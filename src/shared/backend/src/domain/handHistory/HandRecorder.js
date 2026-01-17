import { ActionType, cardToIndex } from "./PokerCodec.js";

/**
 * HandRecorder
 *
 * Sits inside the Game Loop to capture the chronological history of a hand.
 * It handles the critical translation between "Table Seats" (0-9) and
 * "Manifest Indices" (0-N) required for the dense binary format.
 *
 * The manifest is the ordered list of players who were active at the start of the hand.
 * Physical seat numbers (e.g., 2, 5, 8) are mapped to dense manifest indices (0, 1, 2)
 * to minimize storage in the binary format.
 */

/**
 * @typedef {Object} HandRecorderOptions
 * @property {number} [maxHoleCards] - Maximum cards per player (default: 2 for Hold'em, can be 4 for Omaha, etc.)
 * @property {boolean} [allowEmptyHoleCards] - Allow players in manifest without hole cards (default: false)
 * @property {boolean} [trackTiming] - Track deltaTime between actions (default: true)
 */

export class HandRecorder {
  /**
   * @param {Record<string|number, string>} playerManifest - The map of Seat Index -> Player UUID at hand start
   *   e.g. { "2": "uuid-a", "5": "uuid-b" } or { 2: "uuid-a", 5: "uuid-b" }
   * @param {HandRecorderOptions} [options={}]
   * @throws {Error} If manifest is empty or invalid
   */
  constructor(playerManifest, options = {}) {
    if (!playerManifest || Object.keys(playerManifest).length === 0) {
      throw new Error("playerManifest cannot be empty");
    }

    this.playerManifest = playerManifest;

    // Sort seat indices numerically to ensure deterministic manifest order
    const seatIndices = Object.keys(playerManifest)
      .map((k) => {
        const parsed = typeof k === "string" ? parseInt(k, 10) : k;
        if (isNaN(parsed) || parsed < 0 || parsed >= 10) {
          throw new Error(`Invalid seat index: ${k} (must be 0-9)`);
        }
        return parsed;
      })
      .sort((a, b) => a - b);

    // Check for duplicate seat indices
    if (new Set(seatIndices).size !== seatIndices.length) {
      throw new Error("Duplicate seat indices in playerManifest");
    }

    this.playerCount = seatIndices.length;

    if (this.playerCount < 2 || this.playerCount > 10) {
      throw new Error(
        `Invalid player count: ${this.playerCount} (must be 2-10)`
      );
    }

    // Configuration
    this.maxHoleCards = options.maxHoleCards ?? 2; // Default to Hold'em
    this.allowEmptyHoleCards = options.allowEmptyHoleCards ?? false;
    this.trackTiming = options.trackTiming ?? true;

    if (this.maxHoleCards < 1 || this.maxHoleCards > 7) {
      throw new Error(
        `maxHoleCards must be between 1 and 7, got ${this.maxHoleCards}`
      );
    }

    // Initialize hole cards array with empty arrays for every participant
    this.holeCards = Array(this.playerCount)
      .fill(null)
      .map(() => []);

    // Maps physical Seat Index (e.g., 5) -> Packed Manifest Index (e.g., 0)
    this.seatToManifestIndex = new Map();

    // Reverse mapping for validation/debugging
    this.manifestToSeatIndex = new Map();

    // Create bidirectional mappings
    // Example: Seats [2, 5, 8] become Manifest [0, 1, 2]
    seatIndices.forEach((seat, index) => {
      this.seatToManifestIndex.set(seat, index);
      this.manifestToSeatIndex.set(index, seat);
    });

    this.board = [];
    this.boardSet = new Set(); // For O(1) duplicate checking
    this.actions = [];
    this.lastActionTime = null; // Timing tracking
    this.startingStacks = null; // Array of starting stacks in manifest order
  }

  /**
   * Converts a physical seat index to manifest index
   * @param {number} seatIndex
   * @returns {number}
   * @throws {Error} If seat index is not in manifest
   */
  seatToManifest(seatIndex) {
    const manifestIdx = this.seatToManifestIndex.get(seatIndex);
    if (manifestIdx === undefined) {
      throw new Error(
        `Seat ${seatIndex} not in manifest. Valid seats: ${Array.from(
          this.seatToManifestIndex.keys()
        ).join(", ")}`
      );
    }
    return manifestIdx;
  }

  /**
   * Validates card indices are in valid range (0-51)
   * @param {number[]} cards
   * @param {string} context
   */
  validateCards(cards, context) {
    if (!Array.isArray(cards)) {
      throw new Error(`${context}: cards must be an array`);
    }
    for (const card of cards) {
      if (typeof card !== "number" || card < 0 || card > 51) {
        throw new Error(
          `${context}: invalid card index ${card} (must be 0-51)`
        );
      }
    }
  }

  /**
   * Record hole cards for a specific player.
   *
   * @param {number} seatIndex - Physical seat number (0-9)
   * @param {(number|string|{suit: string, rank: string})[]} cards - Array of card indices (0-51) or card strings/objects (will be converted)
   * @throws {Error} If seat not in manifest or cards invalid
   */
  recordDeal(seatIndex, cards) {
    const manifestIdx = this.seatToManifest(seatIndex);

    // Convert cards to indices if needed
    const cardIndices = cards.map((card) => {
      if (typeof card === "number") {
        return card;
      }
      return cardToIndex(card);
    });

    this.validateCards(cardIndices, `recordDeal(seat ${seatIndex})`);

    // Validate hole card count (configurable for different game variants)
    if (cardIndices.length === 0) {
      if (!this.allowEmptyHoleCards) {
        throw new Error(
          `recordDeal(seat ${seatIndex}): expected at least 1 card, got 0 (set allowEmptyHoleCards=true to allow)`
        );
      }
      // Allow empty array if option is set (player sitting out)
      this.holeCards[manifestIdx] = [];
      return;
    }

    if (cardIndices.length > this.maxHoleCards) {
      throw new Error(
        `recordDeal(seat ${seatIndex}): expected max ${this.maxHoleCards} cards, got ${cardIndices.length}`
      );
    }

    // Check for duplicates
    if (new Set(cardIndices).size !== cardIndices.length) {
      throw new Error(
        `recordDeal(seat ${seatIndex}): duplicate cards detected`
      );
    }

    this.holeCards[manifestIdx] = cardIndices;
  }

  /**
   * Record community cards.
   * Can be called incrementally (Flop, then Turn...) or all at once.
   * It effectively de-duplicates to ensure the board state is accurate.
   *
   * IMPORTANT: This method assumes cards are provided in chronological order.
   * If the upstream game engine sends cards out of order (e.g., Turn before Flop),
   * they will be recorded in the order received. Ensure your game engine guarantees
   * chronological order, or use recordBoardAt() for explicit positioning.
   *
   * @param {(number|string|{suit: string, rank: string})[]} newCards - Array of card indices (0-51) or card strings/objects (will be converted)
   * @throws {Error} If board exceeds 5 cards or cards invalid
   */
  recordBoard(newCards) {
    // Convert cards to indices if needed
    const cardIndices = newCards.map((card) => {
      if (typeof card === "number") {
        return card;
      }
      return cardToIndex(card);
    });

    this.validateCards(cardIndices, "recordBoard");

    // Check for duplicates within new cards
    if (new Set(cardIndices).size !== cardIndices.length) {
      throw new Error("recordBoard: duplicate cards in newCards array");
    }

    // Add cards that aren't already on the board
    for (const card of cardIndices) {
      if (!this.boardSet.has(card)) {
        if (this.board.length >= 5) {
          throw new Error(
            `recordBoard: cannot add more than 5 cards to board (current: ${this.board.length})`
          );
        }
        this.board.push(card);
        this.boardSet.add(card);
      }
    }
  }

  /**
   * Record a board card at a specific position (0-4).
   * Use this if you need explicit control over board card ordering.
   *
   * @param {number} position - Board position (0-4: flop1, flop2, flop3, turn, river)
   * @param {number|string|{suit: string, rank: string}} card - Card index (0-51) or card string/object (will be converted)
   * @throws {Error} If position invalid or card already exists at that position
   */
  recordBoardAt(position, card) {
    if (position < 0 || position >= 5) {
      throw new Error(`recordBoardAt: position must be 0-4, got ${position}`);
    }

    const cardIndex = typeof card === "number" ? card : cardToIndex(card);
    this.validateCards([cardIndex], `recordBoardAt(position ${position})`);

    // Check if position already has a card
    if (this.board[position] !== undefined) {
      throw new Error(
        `recordBoardAt: position ${position} already has card ${this.board[position]}`
      );
    }

    // Check for duplicate card
    if (this.boardSet.has(cardIndex)) {
      throw new Error(
        `recordBoardAt: card ${cardIndex} already exists on board`
      );
    }

    // Ensure board array is large enough (pad with 0xFF if needed, but this shouldn't happen in practice)
    while (this.board.length <= position) {
      this.board.push(0xff); // NULL_CARD placeholder
    }

    this.board[position] = cardIndex;
    this.boardSet.add(cardIndex);
  }

  /**
   * Record a player action.
   * Converts seat index to manifest index automatically.
   *
   * @param {number} seatIndex - Physical seat number (0-9)
   * @param {ActionType} type - Action type
   * @param {number} [amount] - Amount for monetary actions (call, bet, raise)
   * @throws {Error} If seat not in manifest or amount invalid
   */
  recordAction(seatIndex, type, amount) {
    const manifestIdx = this.seatToManifest(seatIndex);

    // Validate amount for monetary actions
    const monetaryActions = [
      ActionType.CALL,
      ActionType.BET_OR_RAISE,
      ActionType.WIN_POT,
      ActionType.POST_SMALL_BLIND,
      ActionType.POST_BIG_BLIND,
      ActionType.POST_ANTE,
    ];
    if (monetaryActions.includes(type)) {
      if (amount === undefined || amount < 0) {
        throw new Error(
          `recordAction(seat ${seatIndex}, type ${type}): monetary action requires amount >= 0`
        );
      }
      if (amount > 4294967295) {
        throw new Error(
          `recordAction(seat ${seatIndex}, type ${type}): amount ${amount} exceeds UInt32 maximum`
        );
      }
    } else if (amount !== undefined) {
      throw new Error(
        `recordAction(seat ${seatIndex}, type ${type}): non-monetary action should not have amount`
      );
    }

    // Calculate deltaTime if timing is enabled
    const now = this.trackTiming ? Date.now() : undefined;
    const deltaTime =
      this.trackTiming && this.lastActionTime !== null
        ? Math.min(now - this.lastActionTime, 65535) // Cap at UInt16 max
        : undefined;
    if (this.trackTiming) {
      this.lastActionTime = now;
    }

    // Store with manifest index (not seat index)
    this.actions.push({
      seatIndex: manifestIdx, // CRITICAL: Convert to manifest index
      type,
      amount,
      deltaTime,
    });
  }

  /**
   * Record a small blind post.
   *
   * @param {number} seatIndex - Physical seat number (0-9)
   * @param {number} amount - Small blind amount
   */
  recordSmallBlind(seatIndex, amount) {
    this.recordAction(seatIndex, ActionType.POST_SMALL_BLIND, amount);
  }

  /**
   * Record a big blind post.
   *
   * @param {number} seatIndex - Physical seat number (0-9)
   * @param {number} amount - Big blind amount
   */
  recordBigBlind(seatIndex, amount) {
    this.recordAction(seatIndex, ActionType.POST_BIG_BLIND, amount);
  }

  /**
   * Record an ante post.
   *
   * @param {number} seatIndex - Physical seat number (0-9)
   * @param {number} amount - Ante amount
   */
  recordAnte(seatIndex, amount) {
    this.recordAction(seatIndex, ActionType.POST_ANTE, amount);
  }

  /**
   * Record a street transition (preflop -> flop, flop -> turn, etc.)
   *
   * @param {string} street - Street name ('preflop', 'flop', 'turn', 'river', 'showdown')
   */
  recordStreetChange(street) {
    const now = this.trackTiming ? Date.now() : undefined;
    const deltaTime =
      this.trackTiming && this.lastActionTime !== null
        ? Math.min(now - this.lastActionTime, 65535)
        : undefined;
    if (this.trackTiming) {
      this.lastActionTime = now;
    }

    // NEXT_STREET actions don't have a seat, use 0 as placeholder (will be ignored in replay)
    this.actions.push({
      seatIndex: 0, // Placeholder, not used for street transitions
      type: ActionType.NEXT_STREET,
      street,
      deltaTime,
    });
  }

  /**
   * Record cards shown at showdown.
   * This is a specific action type distinct from the initial deal.
   * Converts seat index to manifest index automatically.
   *
   * @param {number} seatIndex - Physical seat number (0-9)
   * @param {(number|string|{suit: string, rank: string})[]} cards - Array of card indices (0-51) or card strings/objects (will be converted)
   * @throws {Error} If seat not in manifest or cards invalid
   */
  recordShowdown(seatIndex, cards) {
    const manifestIdx = this.seatToManifest(seatIndex);

    // Convert cards to indices if needed
    const cardIndices = cards.map((card) => {
      if (typeof card === "number") {
        return card;
      }
      return cardToIndex(card);
    });

    this.validateCards(cardIndices, `recordShowdown(seat ${seatIndex})`);

    if (cardIndices.length === 0 || cardIndices.length > this.maxHoleCards) {
      throw new Error(
        `recordShowdown(seat ${seatIndex}): expected 1-${this.maxHoleCards} cards, got ${cardIndices.length}`
      );
    }

    // Calculate deltaTime if timing is enabled
    const now = this.trackTiming ? Date.now() : undefined;
    const deltaTime =
      this.trackTiming && this.lastActionTime !== null
        ? Math.min(now - this.lastActionTime, 65535)
        : undefined;
    if (this.trackTiming) {
      this.lastActionTime = now;
    }

    // Store with manifest index (not seat index)
    this.actions.push({
      seatIndex: manifestIdx, // CRITICAL: Convert to manifest index
      type: ActionType.SHOW_CARDS,
      cards: cardIndices,
      deltaTime,
    });
  }

  /**
   * Record a pot win.
   * Should be called for every portion of the pot won (main pot, side pots).
   * Converts seat index to manifest index automatically.
   *
   * @param {number} seatIndex - Physical seat number (0-9)
   * @param {number} amount - Amount won
   * @param {number} [potIndex=0] - Pot index (0 = main pot, 1+ = side pots). Defaults to 0 if not specified.
   * @throws {Error} If seat not in manifest or amount invalid
   */
  recordWin(seatIndex, amount, potIndex = 0) {
    const manifestIdx = this.seatToManifest(seatIndex);

    if (amount < 0) {
      throw new Error(`recordWin(seat ${seatIndex}): amount must be >= 0`);
    }
    if (potIndex < 0 || potIndex > 255) {
      throw new Error(`recordWin(seat ${seatIndex}): potIndex must be 0-255`);
    }

    // Calculate deltaTime if timing is enabled
    const now = this.trackTiming ? Date.now() : undefined;
    const deltaTime =
      this.trackTiming && this.lastActionTime !== null
        ? Math.min(now - this.lastActionTime, 65535)
        : undefined;
    if (this.trackTiming) {
      this.lastActionTime = now;
    }

    this.actions.push({
      seatIndex: manifestIdx,
      type: ActionType.WIN_POT,
      amount,
      potIndex,
      deltaTime,
    });
  }

  /**
   * Record starting chip stacks for all players in manifest order.
   * Must be called before any actions that modify stacks (e.g., blinds).
   *
   * @param {Array<{seat: number, chips: number}>} stacks - Array of {seat, chips} objects
   * @throws {Error} If stacks length doesn't match playerCount or seat not in manifest
   */
  recordStartingStacks(stacks) {
    if (!stacks || stacks.length === 0) {
      throw new Error("recordStartingStacks: stacks array cannot be empty");
    }
    if (stacks.length !== this.playerCount) {
      throw new Error(
        `recordStartingStacks: stacks length (${stacks.length}) does not match playerCount (${this.playerCount})`
      );
    }

    // Convert to manifest-indexed array
    this.startingStacks = Array(this.playerCount).fill(0);
    for (const { seat, chips } of stacks) {
      if (chips < 0 || chips > 0xffffffff) {
        throw new Error(
          `recordStartingStacks: Invalid chip amount ${chips} for seat ${seat} (must be 0-4294967295)`
        );
      }
      const manifestIdx = this.seatToManifest(seat);
      // Verify: manifest index should correspond to the player's position in sorted manifest
      // This ensures stacks align with holeCards and other manifest-indexed data
      if (manifestIdx < 0 || manifestIdx >= this.playerCount) {
        throw new Error(
          `recordStartingStacks: Invalid manifest index ${manifestIdx} for seat ${seat} (must be 0-${this.playerCount - 1})`
        );
      }
      this.startingStacks[manifestIdx] = chips;
    }
  }

  /**
   * Returns the count of players originally in the hand.
   * Needed by the Service to know the encoding size.
   * @returns {number}
   */
  getPlayerCount() {
    return this.playerCount;
  }

  /**
   * Get the original player manifest (for reference/debugging)
   * @returns {Record<string, string>}
   */
  getPlayerManifest() {
    return { ...this.playerManifest };
  }

  /**
   * Get the seat-to-manifest mapping (for debugging)
   * @returns {Map<number, number>}
   */
  getSeatMapping() {
    return new Map(this.seatToManifestIndex);
  }

  /**
   * Check if a seat is in the manifest
   * @param {number} seatIndex
   * @returns {boolean}
   */
  hasSeat(seatIndex) {
    return this.seatToManifestIndex.has(seatIndex);
  }

  /**
   * Reset the recorder for a new hand (keeps manifest, clears data)
   */
  reset() {
    this.board = [];
    this.boardSet.clear();
    this.holeCards = Array(this.playerCount)
      .fill(null)
      .map(() => []);
    this.actions = [];
    this.lastActionTime = null;
    this.startingStacks = null;
  }

  /**
   * Finalizes the data for export.
   * Returns the object ready for PokerCodec.encode()
   *
   * @returns {import('./PokerCodec.js').ReplayData}
   * @throws {Error} If data is incomplete (when allowEmptyHoleCards is false)
   */
  getReplayData() {
    // Validate that all players have hole cards (unless option allows empty)
    if (!this.allowEmptyHoleCards) {
      for (let i = 0; i < this.playerCount; i++) {
        if (this.holeCards[i].length === 0) {
          const seat = this.manifestToSeatIndex.get(i);
          throw new Error(
            `Cannot finalize: player at manifest index ${i} (seat ${seat}) has no hole cards. ` +
              `Set allowEmptyHoleCards=true if players can sit out.`
          );
        }
      }
    }

    return {
      board: [...this.board], // Return copy
      holeCards: this.holeCards.map((hand) => [...hand]), // Return deep copy
      actions: [...this.actions], // Return copy
      startingStacks: this.startingStacks ? [...this.startingStacks] : undefined, // Return copy if set
    };
  }

  /**
   * Get current board state (for debugging/inspection)
   * @returns {readonly number[]}
   */
  getBoard() {
    return [...this.board];
  }

  /**
   * Get current action count (for debugging/inspection)
   * @returns {number}
   */
  getActionCount() {
    return this.actions.length;
  }

  /**
   * Calculate VPIP and PFR statistics for each player based on action history.
   * VPIP (Voluntarily Put money In Pot): Player called or raised preflop.
   * PFR (Pre-Flop Raise): Player raised preflop.
   *
   * @returns {Record<string, {vpip: boolean, pfr: boolean}>} Stats object keyed by playerId
   */
  calculateStats() {
    const stats = {};
    let isPreflop = true;

    for (const action of this.actions) {
      // Check if this is a street transition (preflop -> flop, etc.)
      if (action.type === ActionType.NEXT_STREET) {
        isPreflop = false;
        continue;
      }

      // Get playerId from manifest index
      const manifestIdx = action.seatIndex;
      const physicalSeat = this.manifestToSeatIndex.get(manifestIdx);
      if (physicalSeat === undefined) {
        // Skip actions without valid seat (e.g., NEXT_STREET placeholder)
        continue;
      }
      const playerId = this.playerManifest[physicalSeat];
      if (!playerId) {
        continue;
      }

      // Initialize player stats if missing
      if (!stats[playerId]) {
        stats[playerId] = { vpip: false, pfr: false };
      }

      // VPIP: If action type is CALL or BET_OR_RAISE AND isPreflop is true, set vpip = true
      // VPIP only counts preflop voluntary money in pot (excludes blinds and postflop actions)
      if ((action.type === ActionType.CALL || action.type === ActionType.BET_OR_RAISE) && isPreflop) {
        stats[playerId].vpip = true;
      }

      // PFR: If action type is BET_OR_RAISE AND isPreflop is true, set pfr = true
      if (action.type === ActionType.BET_OR_RAISE && isPreflop) {
        stats[playerId].pfr = true;
      }
    }

    return stats;
  }
}

