import { HandRecorder } from "./HandRecorder.js";
import { PokerCodec, ActionType, cardToIndex } from "./PokerCodec.js";
import { supabaseAdmin } from "../../infrastructure/database/supabaseClient.js";
import { Logger } from "../../shared/utils/Logger.js";

/**
 * @typedef {Object} HandConfig
 * @property {number} sb - Small blind
 * @property {number} bb - Big blind
 * @property {number} [ante] - Ante (optional)
 * @property {number} [buyIn] - Buy-in amount (optional, for reference)
 */

/**
 * @typedef {Object} GamePlayer
 * @property {string} id - Player UUID
 * @property {number} seat - Seat number (1-based in game engine, will be converted to 0-based)
 * @property {Array<{suit: string, rank: string}|string>} [holeCards] - Cards as objects or strings
 * @property {*} [key] - Allow other properties
 */

/**
 * @typedef {'six_max'|'heads_up'|'full_ring'} GameType
 */

/**
 * HandHistoryService
 *
 * Bridges the Game Engine and Supabase database for hand history recording.
 * Manages HandRecorder lifecycle and persists compressed replay data.
 *
 * Design Principles:
 * - Fault Tolerant: Database failures never crash the game loop
 * - Type Safe: Proper mapping between game engine types and codec types
 * - Non-Blocking: All database operations are fire-and-forget
 *
 * NOTE: Do NOT use as a singleton. Each game table should create its own instance.
 */
export class HandHistoryService {
  constructor() {
    this.recorder = null;
    this.gameId = null;
    this.gameType = null;
    this.handIndex = null;
    this.currentConfig = null; // Store config from startHand for endHand
  }

  /**
   * Maps game engine action strings to ActionType enums
   *
   * For unknown actions:
   * - If amount is 0 or undefined: defaults to CHECK (less destructive)
   * - If amount > 0: defaults to BET_OR_RAISE (preserves monetary action)
   * - FOLD is never used as default to avoid confusing replays
   * @param {string} actionType
   * @param {number} [amount]
   * @returns {ActionType}
   */
  static mapActionType(actionType, amount) {
    const mapping = {
      fold: ActionType.FOLD,
      check: ActionType.CHECK,
      call: ActionType.CALL,
      bet: ActionType.BET_OR_RAISE,
      raise: ActionType.BET_OR_RAISE,
      allin: ActionType.BET_OR_RAISE, // All-in is treated as bet/raise
      // Add any custom actions your engine supports:
      // straddle: ActionType.BET_OR_RAISE,
      // muck: ActionType.FOLD,
    };

    const normalized = actionType.toLowerCase();
    const mapped = mapping[normalized];

    if (mapped) {
      return mapped;
    }

    // Unknown action: use CHECK for non-monetary, BET_OR_RAISE for monetary
    const defaultType =
      amount && amount > 0 ? ActionType.BET_OR_RAISE : ActionType.CHECK;
    Logger.warn(
      `[HandHistoryService] Unknown action type: ${actionType}, defaulting to ${
        ActionType[defaultType]
      } (amount: ${amount || 0})`
    );
    return defaultType;
  }

  /**
   * Converts game engine cards to card indices
   * Handles both Card objects and string representations
   * @param {Array<{suit: string, rank: string}|string>|undefined} cards
   * @returns {number[]}
   */
  static convertCards(cards) {
    if (!cards || cards.length === 0) {
      return [];
    }
    return cards.map((card) => cardToIndex(card));
  }

  /**
   * Converts game engine seat (1-based) to recorder seat (0-based)
   * @param {number} seat
   * @returns {number}
   */
  static normalizeSeat(seat) {
    // Game engine uses 1-based seats, recorder expects 0-9
    if (seat < 1 || seat > 10) {
      throw new Error(`Invalid seat number: ${seat} (must be 1-10)`);
    }
    return seat - 1; // Convert to 0-based
  }

  /**
   * Creates a player manifest from game engine players
   * Maps seat -> playerId for HandRecorder
   * @param {GamePlayer[]} players
   * @returns {Record<string, string>}
   */
  static createPlayerManifest(players) {
    const manifest = {};
    for (const player of players) {
      const normalizedSeat = this.normalizeSeat(player.seat);
      manifest[normalizedSeat] = player.id;
    }
    return manifest;
  }

  /**
   * Determines maxHoleCards based on game type
   * @param {GameType} gameType
   * @returns {number}
   */
  static getMaxHoleCards(gameType) {
    // Default to Hold'em (2 cards)
    // Can be extended for Omaha (4), Stud (up to 7), etc.
    const config = {
      six_max: 2,
      heads_up: 2,
      full_ring: 2,
    };
    return config[gameType] || 2;
  }


  /**
   * Start recording a new hand
   *
   * @param {number} handIndex - Sequential hand number (0-indexed or 1-indexed)
   * @param {GamePlayer[]} players - Array of players in the hand
   * @param {HandConfig} config - Hand configuration (blinds, antes) - stored for use in endHand
   * @param {GameType} gameType - Game type (for determining maxHoleCards)
   * @param {import('./HandRecorder.js').HandRecorderOptions} [options] - Optional HandRecorder options
   */
  startHand(handIndex, players, config, gameType, options) {
    try {
      // Store config for use in endHand
      this.currentConfig = config;

      // Store gameId and gameType if not already set (allows per-instance usage)
      if (!this.gameId) {
        Logger.warn(
          `[HandHistoryService] startHand called without gameId.`
        );
      }
      if (!this.gameType) {
        this.gameType = gameType;
      }

      // Create player manifest
      const manifest = HandHistoryService.createPlayerManifest(players);

      // Determine maxHoleCards
      const maxHoleCards =
        options?.maxHoleCards || HandHistoryService.getMaxHoleCards(gameType);

      // Create recorder with options
      const recorderOptions = {
        maxHoleCards,
        allowEmptyHoleCards: options?.allowEmptyHoleCards ?? false,
        trackTiming: options?.trackTiming ?? true,
        ...options,
      };

      this.recorder = new HandRecorder(manifest, recorderOptions);
      this.handIndex = handIndex;

      // Record initial hole cards if available
      for (const player of players) {
        if (player.holeCards && player.holeCards.length > 0) {
          const normalizedSeat = HandHistoryService.normalizeSeat(player.seat);
          const cardIndices = HandHistoryService.convertCards(player.holeCards);
          this.recorder.recordDeal(normalizedSeat, cardIndices);
        }
      }

      Logger.debug(
        `[HandHistoryService] Started recording hand ${handIndex} with ${players.length} players`
      );
    } catch (error) {
      Logger.error(
        `[HandHistoryService] Failed to start hand ${handIndex}:`,
        error
      );
      // Reset recorder on error
      this.recorder = null;
      this.handIndex = null;
    }
  }

  /**
   * Record starting chip stacks for all players
   * Must be called after startHand() and before any actions that modify stacks
   *
   * @param {Array<{seat: number, chips: number}>} stacks - Array of {seat, chips} objects
   *   Seat numbers are 1-based from game engine, will be normalized to 0-based
   */
  recordStartingStacks(stacks) {
    if (!this.recorder) {
      Logger.debug(
        `[HandHistoryService] Ignoring starting stacks: recorder not active`
      );
      return;
    }

    try {
      // Normalize seats from 1-based (game engine) to 0-based (recorder)
      const normalizedStacks = stacks.map(({ seat, chips }) => ({
        seat: HandHistoryService.normalizeSeat(seat),
        chips,
      }));
      this.recorder.recordStartingStacks(normalizedStacks);
      Logger.debug(
        `[HandHistoryService] Recorded starting stacks for ${stacks.length} players`
      );
    } catch (error) {
      Logger.error(
        `[HandHistoryService] Failed to record starting stacks:`,
        error
      );
    }
  }

  /**
   * Record a player action
   *
   * @param {number} seat - Player seat (1-based from game engine)
   * @param {string} actionType - Action type string ('fold', 'check', 'call', 'bet', 'raise', 'allin')
   * @param {number} [amount] - Optional amount for monetary actions
   */
  recordAction(seat, actionType, amount) {
    if (!this.recorder) {
      Logger.debug(
        `[HandHistoryService] Ignoring action: recorder not active (seat ${seat}, action ${actionType})`
      );
      return;
    }

    try {
      const normalizedSeat = HandHistoryService.normalizeSeat(seat);
      const enumType = HandHistoryService.mapActionType(actionType, amount);
      this.recorder.recordAction(normalizedSeat, enumType, amount);
    } catch (error) {
      Logger.error(
        `[HandHistoryService] Failed to record action (seat ${seat}, type ${actionType}):`,
        error
      );
    }
  }

  /**
   * Record hole cards for a player
   *
   * @param {number} seat - Player seat (1-based from game engine)
   * @param {Array<{suit: string, rank: string}|string>} cards - Array of cards (objects or strings)
   */
  recordDeal(seat, cards) {
    if (!this.recorder) {
      Logger.debug(
        `[HandHistoryService] Ignoring deal: recorder not active (seat ${seat})`
      );
      return;
    }

    try {
      const normalizedSeat = HandHistoryService.normalizeSeat(seat);
      const cardIndices = HandHistoryService.convertCards(cards);
      this.recorder.recordDeal(normalizedSeat, cardIndices);
    } catch (error) {
      Logger.error(
        `[HandHistoryService] Failed to record deal (seat ${seat}):`,
        error
      );
    }
  }

  /**
   * Record community cards
   *
   * @param {Array<{suit: string, rank: string}|string>} cards - Array of cards (objects or strings)
   */
  recordBoard(cards) {
    if (!this.recorder) {
      Logger.debug(`[HandHistoryService] Ignoring board: recorder not active`);
      return;
    }

    try {
      const cardIndices = HandHistoryService.convertCards(cards);
      this.recorder.recordBoard(cardIndices);
    } catch (error) {
      Logger.error(`[HandHistoryService] Failed to record board:`, error);
    }
  }

  /**
   * Record a board card at a specific position
   *
   * @param {number} position - Board position (0-4: flop1, flop2, flop3, turn, river)
   * @param {{suit: string, rank: string}|string} card - Card (object or string)
   */
  recordBoardAt(position, card) {
    if (!this.recorder) {
      Logger.debug(
        `[HandHistoryService] Ignoring boardAt: recorder not active`
      );
      return;
    }

    try {
      const cardIndex = cardToIndex(card);
      this.recorder.recordBoardAt(position, cardIndex);
    } catch (error) {
      Logger.error(
        `[HandHistoryService] Failed to record boardAt (position ${position}):`,
        error
      );
    }
  }

  /**
   * Record cards shown at showdown
   *
   * @param {number} seat - Player seat (1-based from game engine)
   * @param {Array<{suit: string, rank: string}|string>} cards - Array of cards (objects or strings)
   */
  recordShowdown(seat, cards) {
    if (!this.recorder) {
      Logger.debug(
        `[HandHistoryService] Ignoring showdown: recorder not active (seat ${seat})`
      );
      return;
    }

    try {
      const normalizedSeat = HandHistoryService.normalizeSeat(seat);
      const cardIndices = HandHistoryService.convertCards(cards);
      this.recorder.recordShowdown(normalizedSeat, cardIndices);
    } catch (error) {
      Logger.error(
        `[HandHistoryService] Failed to record showdown (seat ${seat}):`,
        error
      );
    }
  }

  /**
   * Record a pot win
   *
   * @param {number} seat - Player seat (1-based from game engine)
   * @param {number} amount - Amount won
   * @param {number} [potIndex=0] - Pot index (0 = main pot, 1+ = side pots)
   */
  recordWin(seat, amount, potIndex = 0) {
    if (!this.recorder) {
      Logger.debug(
        `[HandHistoryService] Ignoring win: recorder not active (seat ${seat})`
      );
      return;
    }

    try {
      const normalizedSeat = HandHistoryService.normalizeSeat(seat);
      this.recorder.recordWin(normalizedSeat, amount, potIndex);
    } catch (error) {
      Logger.error(
        `[HandHistoryService] Failed to record win (seat ${seat}):`,
        error
      );
    }
  }

  /**
   * Record a small blind post
   *
   * @param {number} seat - Player seat (1-based from game engine)
   * @param {number} amount - Small blind amount
   */
  recordSmallBlind(seat, amount) {
    if (!this.recorder) {
      return;
    }

    try {
      const normalizedSeat = HandHistoryService.normalizeSeat(seat);
      this.recorder.recordSmallBlind(normalizedSeat, amount);
    } catch (error) {
      Logger.error(
        `[HandHistoryService] Failed to record small blind (seat ${seat}):`,
        error
      );
    }
  }

  /**
   * Record a big blind post
   *
   * @param {number} seat - Player seat (1-based from game engine)
   * @param {number} amount - Big blind amount
   */
  recordBigBlind(seat, amount) {
    if (!this.recorder) {
      return;
    }

    try {
      const normalizedSeat = HandHistoryService.normalizeSeat(seat);
      this.recorder.recordBigBlind(normalizedSeat, amount);
    } catch (error) {
      Logger.error(
        `[HandHistoryService] Failed to record big blind (seat ${seat}):`,
        error
      );
    }
  }

  /**
   * Record an ante post
   *
   * @param {number} seat - Player seat (1-based from game engine)
   * @param {number} amount - Ante amount
   */
  recordAnte(seat, amount) {
    if (!this.recorder) {
      return;
    }

    try {
      const normalizedSeat = HandHistoryService.normalizeSeat(seat);
      this.recorder.recordAnte(normalizedSeat, amount);
    } catch (error) {
      Logger.error(
        `[HandHistoryService] Failed to record ante (seat ${seat}):`,
        error
      );
    }
  }

  /**
   * Record a street transition
   *
   * @param {string} street - Street name ('preflop', 'flop', 'turn', 'river', 'showdown')
   */
  recordStreetChange(street) {
    if (!this.recorder) {
      return;
    }

    try {
      this.recorder.recordStreetChange(street);
    } catch (error) {
      Logger.error(
        `[HandHistoryService] Failed to record street change (${street}):`,
        error
      );
    }
  }

  /**
   * Finalize the current hand and persist to database
   *
   * @param {string|null} winnerId - Winner UUID (null if split pot or no winner)
   * @param {number} finalPot - Total pot size
   * @param {Object} [stats] - Hand statistics (optional, defaults to empty object)
   * @returns {Promise<boolean>}
   */
  async endHand(winnerId, finalPot, stats = {}) {
    if (!this.recorder || this.handIndex === null) {
      Logger.warn(
        `[HandHistoryService] Cannot end hand: recorder not active or missing handIndex`
      );
      return false;
    }

    // Use stored config from startHand
    const handConfig = this.currentConfig;
    if (!handConfig) {
      Logger.error(
        `[HandHistoryService] Cannot end hand: no config available (config should be stored from startHand)`
      );
      // Reset state to prevent corruption
      this.recorder = null;
      this.handIndex = null;
      this.currentConfig = null;
      return false;
    }

    if (!this.gameId) {
      Logger.error(`[HandHistoryService] Cannot end hand: missing gameId`);
      // Reset state to prevent corruption
      this.recorder = null;
      this.handIndex = null;
      this.currentConfig = null;
      return false;
    }

    try {
      // Extract replay data from recorder
      const replayData = this.recorder.getReplayData();
      const playerManifest = this.recorder.getPlayerManifest();

      // Compress using codec (playerCount is now derived from startingStacks in the data)
      const compressedBuffer = PokerCodec.encode(replayData);

      // Prepare JSONB data using stored config
      const configJsonb = {
        sb: handConfig.sb,
        bb: handConfig.bb,
        buttonSeat: handConfig.buttonSeat,
        gameType: this.gameType, // Store variant (e.g. 'six_max') for UI layout
        ...(handConfig.ante !== undefined && { ante: handConfig.ante }),
        ...(handConfig.buyIn !== undefined && { buyIn: handConfig.buyIn }),
      };

      // Insert into database
      // Explicitly convert Uint8Array to Postgres HEX format to prevent JSON stringification
      // Convert Uint8Array to hex string
      const hexString = Array.from(compressedBuffer)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const { error } = await supabaseAdmin.from("hand_histories").insert({
        game_id: this.gameId,
        hand_index: this.handIndex,
        config: configJsonb,
        player_manifest: playerManifest,
        replay_data: "\\x" + hexString, // Explicitly convert to Postgres HEX format to avoid JSON stringification
        winner_id: winnerId,
        final_pot: finalPot,
        stats: stats, // Map stats directly to stats column
        played_at: new Date().toISOString(),
      });

      if (error) {
        throw error;
      }

      Logger.info(
        `[HandHistoryService] Saved hand ${this.handIndex} for game ${this.gameId} (${compressedBuffer.length} bytes)`
      );

      // Reset recorder for next hand
      this.recorder = null;
      this.handIndex = null;
      this.currentConfig = null;

      return true;
    } catch (error) {
      // Fault tolerance: Log error but don't throw
      Logger.error(
        `[HandHistoryService] Failed to save hand ${this.handIndex} for game ${this.gameId}:`,
        error
      );

      // Reset recorder even on error to prevent state corruption
      this.recorder = null;
      this.handIndex = null;
      this.currentConfig = null;

      return false;
    }
  }

  /**
   * Check if a hand is currently being recorded
   * @returns {boolean}
   */
  isRecording() {
    return this.recorder !== null;
  }

  /**
   * Get current hand index
   * @returns {number|null}
   */
  getCurrentHandIndex() {
    return this.handIndex;
  }

  /**
   * Get hand statistics (VPIP, PFR) for the current hand
   * @returns {Record<string, {vpip: boolean, pfr: boolean}>} Stats object keyed by playerId
   */
  getHandStats() {
    if (this.recorder) {
      return this.recorder.calculateStats();
    }
    return {};
  }

  /**
   * Reset the service (useful for testing or error recovery)
   */
  reset() {
    this.recorder = null;
    this.handIndex = null;
    this.gameId = null;
    this.gameType = null;
    this.currentConfig = null;
  }

  /**
   * Set the game ID and type (useful when creating instance per game)
   *
   * @param {string} gameId - Game UUID
   * @param {GameType} gameType - Game type
   */
  setGame(gameId, gameType) {
    this.gameId = gameId;
    this.gameType = gameType;
  }
}

// NOTE: Do NOT export a singleton instance.
// Each game table should create its own instance:
//
// class GameTable {
//   constructor(gameId, gameType) {
//     this.historyService = new HandHistoryService();
//     this.historyService.setGame(gameId, gameType);
//   }
// }
