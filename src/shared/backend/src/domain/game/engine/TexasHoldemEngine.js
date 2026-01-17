/**
 * TexasHoldemEngine - Consolidated poker game engine
 * Pure logic engine (no IO/timers) that returns GameResult objects
 */

import { createShuffledDeck, dealCards } from "../../../shared/utils/deck.js";
import {
  determineWinners,
  distributePots,
} from "../services/ShowdownService.js";
import { EffectType, EventType, TimerType } from "../types.js";
import { Logger } from "../../../shared/utils/Logger.js";

export class TexasHoldemEngine {
  /**
   * Constructor
   * @param {string} gameId - Game ID
   * @param {Object} config - Configuration object (blinds, buyIn, maxPlayers, etc.)
   * @param {Object} savedState - Saved state from database (optional)
   */
  constructor(gameId, config, savedState = null) {
    this.gameId = gameId;
    this.config = config;
    // Store variant slug for hand history tracking (from config.variantSlug)
    this.variantType = config.variantSlug || "six_max";
    this.startInProgress = false; // Guard flag to prevent concurrent game starts

    // WATCHDOG: Initialize activity tracking
    this.createdAt = Date.now();
    this.lastActivity = Date.now();

    // Initialize context from saved state or defaults
    if (savedState) {
      this.context = { ...savedState };
      // Ensure config is available in context
      this.context.config = this.config;
      // Ensure revealedIndices is initialized for loaded players
      if (this.context.players) {
        this.context.players.forEach((p) => {
          if (!p.revealedIndices) {
            p.revealedIndices = [];
          }
        });
      }
      // Initialize private game fields from saved state
      this.context.isPrivate =
        savedState.isPrivate ?? config.isPrivate ?? false;
      this.context.hostId = savedState.hostId ?? null;
      this.context.isPaused = savedState.isPaused ?? false;
      this.context.pendingRequests = savedState.pendingRequests ?? [];
      this.context.spectators = savedState.spectators ?? [];
    } else {
      this.context = this._createInitialContext();
      // Initialize private game fields from config
      this.context.isPrivate = config.isPrivate ?? false;
      this.context.hostId = config.hostId ?? null;
      this.context.isPaused = false;
      this.context.pendingRequests = [];
      this.context.spectators = [];
    }
  }

  /**
   * Create initial game context
   * @private
   * @returns {Object} Initial context
   */
  _createInitialContext() {
    return {
      gameId: this.gameId,
      type: "holdem",
      maxPlayers: this.config.maxPlayers,
      players: [],
      buttonSeat: 1,
      smallBlind: this.config.blinds.small,
      bigBlind: this.config.blinds.big,
      buyIn: this.config.buyIn,
      communityCards: [],
      pots: [{ amount: 0, eligiblePlayers: [] }],
      currentPhase: "waiting",
      currentActorSeat: null,
      firstActorSeat: null,
      minRaise: this.config.blinds.big * 2,
      lastRaiseAmount: null, // Track the last raise amount for min raise calculation
      handHistory: [],
      handNumber: 1,
      actionDeadline: null,
      deck: [],
      showdownResults: null,
      status: "waiting",
      message: null,
      config: this.config,
      isPrivate: false,
      hostId: null,
      isPaused: false,
      pendingRequests: [],
      spectators: [],
    };
  }

  /**
   * Process a player action
   * @param {Object} action - Action object {type, seat, amount?}
   * @returns {Object} GameResult {success, state, events, effects}
   */
  processAction(action) {
    // WATCHDOG: Update activity timestamp
    this.lastActivity = Date.now();

    // Guard: If game is paused, reject action
    if (this.context.isPaused) {
      return {
        success: false,
        state: this.context,
        events: [
          {
            type: EventType.ERROR,
            payload: {
              message: "Game is paused",
            },
          },
        ],
        effects: [],
      };
    }

    const events = [];
    const effects = [];

    // Guard: If game is finished, reject
    if (
      this.context.status === "finished" ||
      this.context.status === "complete"
    ) {
      return {
        success: false,
        state: this.context,
        events: [
          {
            type: EventType.ERROR,
            payload: {
              message: "Cannot act - game is finished or running out",
            },
          },
        ],
        effects: [],
      };
    }

    // Validate action
    const actor = this.context.players.find((p) => p.seat === action.seat);
    if (!actor) {
      return {
        success: false,
        state: this.context,
        events: [
          {
            type: EventType.ERROR,
            payload: { message: `No player at seat ${action.seat}` },
          },
        ],
        effects: [],
      };
    }

    // Check if it's the actor's turn
    // Exception: 'reveal' actions are allowed outside of turn (but only during showdown)
    if (
      this.context.currentActorSeat !== action.seat &&
      action.type !== "reveal"
    ) {
      return {
        success: false,
        state: this.context,
        events: [
          {
            type: EventType.ERROR,
            payload: { message: "Not your turn" },
          },
        ],
        effects: [],
      };
    }

    // Validate amount is a whole number (if provided)
    if (action.amount !== undefined && action.amount !== null) {
      // Check if amount is a whole number
      if (!Number.isInteger(action.amount)) {
        return {
          success: false,
          state: this.context,
          events: [
            {
              type: EventType.ERROR,
              payload: {
                message: `Invalid amount: ${action.amount}. Bet amounts must be whole numbers (integers).`,
              },
            },
          ],
          effects: [],
        };
      }

      // Get current bet for validation
      const currentBet = this._getCurrentBet();

      // Validate call action (including all-in calls)
      if (action.type === "call") {
        const callAmount = action.amount;
        const toCall = currentBet - actor.currentBet;

        // Check if this is a valid all-in call
        const allInPlayers = this.context.players.filter(
          (p) => !p.folded && p.allIn && p.currentBet < currentBet
        );
        const allInAmount =
          allInPlayers.length > 0
            ? Math.max(...allInPlayers.map((p) => p.currentBet))
            : null;
        const toCallAllIn = allInAmount ? allInAmount - actor.currentBet : null;

        // Valid if: full call OR valid all-in call
        const isValidCall =
          callAmount === toCall ||
          (toCallAllIn !== null &&
            callAmount === toCallAllIn &&
            callAmount > 0);

        if (!isValidCall) {
          return {
            success: false,
            state: this.context,
            events: [
              {
                type: EventType.ERROR,
                payload: {
                  message: `Invalid call amount: ${callAmount}. Must be ${toCall} (full call)${
                    toCallAllIn ? ` or ${toCallAllIn} (all-in call)` : ""
                  }`,
                },
              },
            ],
            effects: [],
          };
        }

        if (callAmount > actor.chips) {
          return {
            success: false,
            state: this.context,
            events: [
              {
                type: EventType.ERROR,
                payload: {
                  message: `Insufficient chips: need ${callAmount}, have ${actor.chips}`,
                },
              },
            ],
            effects: [],
          };
        }
      }

      // Validate minimum bet/raise amounts (unified "bet" action)
      if (action.type === "bet") {
        const betAmount = action.amount;
        const toCall = currentBet - actor.currentBet;

        // If calling: bet amount must equal currentBet
        if (betAmount === currentBet && toCall > 0) {
          // Valid call
        } else if (betAmount > currentBet) {
          // This is a raise - validate minimum raise
          const raiseAmount = betAmount - currentBet;
          const lastRaise =
            this.context.lastRaiseAmount || this.context.bigBlind;
          // Minimum raise is the LARGER of last raise amount or big blind
          const minRaiseAmount = Math.max(lastRaise, this.context.bigBlind);

          if (raiseAmount < minRaiseAmount) {
            return {
              success: false,
              state: this.context,
              events: [
                {
                  type: EventType.ERROR,
                  payload: {
                    message: `Raise amount ${raiseAmount} must be at least ${minRaiseAmount} (minimum raise)`,
                  },
                },
              ],
              effects: [],
            };
          }
        } else if (currentBet === 0) {
          // Opening bet - must be at least bigBlind
          if (betAmount < this.context.bigBlind) {
            return {
              success: false,
              state: this.context,
              events: [
                {
                  type: EventType.ERROR,
                  payload: {
                    message: `Bet amount ${betAmount} must be at least the big blind (${this.context.bigBlind})`,
                  },
                },
              ],
              effects: [],
            };
          }
        } else {
          // Invalid: bet amount less than currentBet but not equal (can't bet less)
          return {
            success: false,
            state: this.context,
            events: [
              {
                type: EventType.ERROR,
                payload: {
                  message: `Bet amount ${betAmount} must be at least ${currentBet} (to call) or ${
                    currentBet +
                    Math.min(
                      this.context.lastRaiseAmount || this.context.bigBlind,
                      this.context.bigBlind
                    )
                  } (to raise)`,
                },
              },
            ],
            effects: [],
          };
        }
      }
    }

    // Handle reveal action (showdown only) - bypass turn and legal actions checks
    if (action.type === "reveal") {
      // Only allow reveal during showdown phase
      if (this.context.currentPhase !== "showdown") {
        return {
          success: false,
          state: this.context,
          events: [
            {
              type: EventType.ERROR,
              payload: {
                message: "Can only reveal cards during showdown",
              },
            },
          ],
          effects: [],
        };
      }

      // Validate index exists and is a number
      if (action.index === undefined || action.index === null) {
        return {
          success: false,
          state: this.context,
          events: [
            {
              type: EventType.ERROR,
              payload: {
                message: "Reveal action requires an index",
              },
            },
          ],
          effects: [],
        };
      }

      // Validate index is a number
      if (typeof action.index !== "number") {
        return {
          success: false,
          state: this.context,
          events: [
            {
              type: EventType.ERROR,
              payload: {
                message: `Invalid index type: expected number, got ${typeof action.index}. Index value: ${
                  action.index
                }`,
              },
            },
          ],
          effects: [],
        };
      }

      // Validate index is within bounds of holeCards
      if (
        !actor.holeCards ||
        action.index < 0 ||
        action.index >= actor.holeCards.length
      ) {
        return {
          success: false,
          state: this.context,
          events: [
            {
              type: EventType.ERROR,
              payload: {
                message: `Invalid reveal index: ${
                  action.index
                }. Must be between 0 and ${actor.holeCards?.length || 0}`,
              },
            },
          ],
          effects: [],
        };
      }

      // Initialize revealedIndices if not present
      if (!actor.revealedIndices) {
        actor.revealedIndices = [];
      }

      // Add index to player's revealedIndices if not already present
      if (!actor.revealedIndices.includes(action.index)) {
        actor.revealedIndices.push(action.index);
      }

      // Emit reveal event
      events.push({
        type: EventType.PLAYER_ACTION,
        payload: {
          seat: action.seat,
          action: "reveal",
          index: action.index,
        },
      });

      // Persist state
      effects.push({ type: EffectType.PERSIST });

      return {
        success: true,
        state: this.context,
        events,
        effects,
      };
    }

    // Get legal actions (for non-reveal actions)
    const legalActions = this._getLegalActions(action.seat);
    const isValid = legalActions.some((legal) => legal.type === action.type);

    if (!isValid) {
      return {
        success: false,
        state: this.context,
        events: [
          {
            type: EventType.ERROR,
            payload: {
              message: `Invalid action: ${action.type} for seat ${action.seat}`,
            },
          },
        ],
        effects: [],
      };
    }

    // CRITICAL: Mark actor as having acted BEFORE processing action
    // This ensures hasActed is set before evaluateGame checks it
    if (actor) {
      actor.hasActed = true;
      Logger.debug(
        `[processAction] Player ${actor.seat} acted. hasActed=${actor.hasActed} action=${action.type} game=${this.context.gameId}`
      );
    }

    // Process action based on current phase
    if (this._isBettingPhase()) {
      this._processBettingAction(action);
    }

    // Evaluate game flow (hasActed is already set above)
    // Pass true to allow advancing to next player after action
    // IMPORTANT: Evaluate game BEFORE emitting events so listeners see the updated state (e.g. currentActorSeat = null)
    const flowEffects = this.evaluateGame(true);
    effects.push(...flowEffects);

    // Add to hand history
    this.context.handHistory.push({
      action: action.type,
      seat: action.seat,
      amount: action.amount || 0,
      timestamp: new Date().toISOString(),
    });

    // Emit action event
    events.push({
      type: EventType.PLAYER_ACTION,
      payload: {
        seat: action.seat,
        action: action.type,
        amount: action.amount || 0,
      },
    });

    // Always persist after action
    effects.push({ type: EffectType.PERSIST });

    return {
      success: true,
      state: this.context,
      events,
      effects,
    };
  }

  /**
   * Handle player disconnect
   * @param {string} playerId - Player ID
   * @returns {Object} GameResult
   */
  handleDisconnect(playerId) {
    // WATCHDOG: Update activity timestamp
    this.lastActivity = Date.now();

    const events = [];
    const effects = [];

    // Guard: If game is finished, return silently
    if (
      this.context.status === "finished" ||
      this.context.status === "complete"
    ) {
      return {
        success: true,
        state: this.context,
        events: [],
        effects: [],
      };
    }

    const player = this.context.players.find(
      (p) => p.id === playerId && !p.isBot
    );

    // If player is in spectators, remove them
    if (!player && this.context.spectators) {
      const spectatorIndex = this.context.spectators.findIndex(
        (s) => s.userId === playerId
      );
      if (spectatorIndex >= 0) {
        this.context.spectators.splice(spectatorIndex, 1);
        Logger.debug(
          `[handleDisconnect] Removed spectator ${playerId} from game ${this.context.gameId}`
        );
        effects.push({ type: EffectType.PERSIST });
        return {
          success: true,
          state: this.context,
          events: [],
          effects,
        };
      }
    }

    if (!player) {
      return {
        success: false,
        state: this.context,
        events: [],
        effects: [],
      };
    }

    // Update player status
    player.status = "DISCONNECTED";
    player.isOffline = true;
    player.isGhost = true;

    // If in hand, auto-fold
    if (this._isBettingPhase() && !player.folded && !player.allIn) {
      player.folded = true;
      player.eligibleToBet = false;
      // Don't reset currentBet here - it will be reset at end of betting round

      events.push({
        type: EventType.PLAYER_STATUS_UPDATE,
        payload: {
          playerId: player.id,
          status: "DISCONNECTED",
          action: "FOLD",
        },
      });
    }

    // Start reconnect timer
    effects.push({
      type: EffectType.START_RECONNECT_TIMER,
      playerId: player.id,
      duration: 60000, // 60 seconds
    });

    // Evaluate game flow
    // Ensuring this runs before we return
    const flowEffects = this.evaluateGame();
    effects.push(...flowEffects);

    effects.push({ type: EffectType.PERSIST });

    return {
      success: true,
      state: this.context,
      events,
      effects,
    };
  }

  /**
   * Handle player reconnect
   * @param {string} playerId - Player ID
   * @returns {Object} GameResult
   */
  handleReconnect(playerId) {
    // WATCHDOG: Update activity timestamp
    this.lastActivity = Date.now();

    const events = [];
    const effects = [];

    const player = this.context.players.find(
      (p) => p.id === playerId && !p.isBot
    );
    if (!player) {
      return {
        success: false,
        state: this.context,
        events: [],
        effects: [],
      };
    }

    // Update player status
    player.status = "ACTIVE";
    player.isOffline = false;
    player.isGhost = false;

    // Cancel reconnect timer
    effects.push({
      type: EffectType.CANCEL_RECONNECT_TIMER,
      playerId: player.id,
    });

    events.push({
      type: "PLAYER_STATUS_UPDATE",
      payload: {
        playerId: player.id,
        status: "ACTIVE",
      },
    });

    // Persist
    effects.push({ type: EffectType.PERSIST });

    return {
      success: true,
      state: this.context,
      events,
      effects,
    };
  }

  /**
   * Check if player should be excluded from active play
   * @private
   * @param {Object} player - Player object
   * @returns {boolean} True if player is LEFT or REMOVED
   */
  _isPermanentlyLeft(player) {
    return player.status === "LEFT" || player.status === "REMOVED";
  }

  /**
   * Get active players (not folded, not permanently left)
   * @private
   * @returns {Array} Array of active players
   */
  _getActivePlayers() {
    return this.context.players.filter(
      (p) => !p.folded && !this._isPermanentlyLeft(p)
    );
  }

  /**
   * Get players with chips who can still bet (not folded, not all-in, chips > 0)
   * @private
   * @returns {Array} Array of players with chips
   */
  _getPlayersWithChips() {
    return this.context.players.filter(
      (p) => !p.folded && !p.allIn && p.chips > 0
    );
  }

  /**
   * Get active players for betting balance check (all non-folded players)
   * @private
   * @returns {Array} Array of non-folded players
   */
  _getActivePlayersForBalance() {
    return this.context.players.filter((p) => !p.folded);
  }

  /**
   * Check if betting is balanced (all active players have matched currentBet or are all-in)
   * @private
   * @param {number} currentBet - Current high bet
   * @returns {boolean} True if betting is balanced
   */
  _isBettingBalanced(currentBet) {
    const activePlayersForBalance = this._getActivePlayersForBalance();
    return activePlayersForBalance.every(
      (p) => p.allIn || p.currentBet === currentBet
    );
  }

  /**
   * Detect if game is in runout condition
   * Runout occurs when: count of players with chips <= 1,
   * AND there are > 1 active non-folded players total
   * AND betting is balanced
   * @private
   * @returns {Object} { isRunout: boolean, playersWithChips: Array, activeNonFoldedPlayers: Array }
   */
  _detectRunout() {
    const playersWithChips = this._getPlayersWithChips();
    const activeNonFoldedPlayers = this._getActivePlayers();
    const currentBet = this._getCurrentBet();
    const isBettingBalanced = this._isBettingBalanced(currentBet);

    const isRunout =
      playersWithChips.length <= 1 &&
      activeNonFoldedPlayers.length > 1 &&
      isBettingBalanced;

    return {
      isRunout,
      playersWithChips,
      activeNonFoldedPlayers,
      currentBet,
      isBettingBalanced,
    };
  }

  /**
   * Serialize community cards to string format
   * @private
   * @param {Array} cards - Community cards array
   * @returns {Array} Serialized community cards
   */
  _serializeCommunityCards(cards) {
    if (!cards) return [];
    return cards.map((c) => (typeof c === "string" ? c : c.display || c));
  }

  /**
   * Map hole cards with selective reveal logic
   * @private
   * @param {Array} holeCards - Player's hole cards
   * @param {boolean} isSelf - Whether this is the requesting player
   * @param {boolean} isShowdown - Whether game is in showdown phase
   * @param {boolean} isRunout - Whether game is in runout condition
   * @param {number} activePlayersCount - Count of active players
   * @param {Array} revealedIndices - Indices of manually revealed cards
   * @param {boolean} folded - Whether the player is folded
   * @returns {Array} Mapped hole cards (strings or 'HIDDEN')
   */
  _mapHoleCards(
    holeCards,
    isSelf,
    isShowdown,
    isRunout,
    activePlayersCount,
    revealedIndices,
    folded
  ) {
    return holeCards.map((c, index) => {
      // Always reveal own cards
      if (isSelf) {
        return typeof c === "string" ? c : c.display || c;
      }

      // Auto-reveal during runouts or showdown
      // Reveal if: (isShowdown OR isRunout) AND (player is not folded OR player.revealedIndices includes index)
      if (
        (isShowdown || isRunout) &&
        ((!folded && activePlayersCount > 1) || revealedIndices.includes(index))
      ) {
        return typeof c === "string" ? c : c.display || c;
      }

      // All other cases: return 'HIDDEN'
      return "HIDDEN";
    });
  }

  /**
   * Handle player leaving the game permanently
   * @param {string} playerId - Player ID
   * @param {string} [status='LEFT'] - Status to assign ('LEFT' or 'REMOVED')
   * @returns {Object} GameResult
   */
  handleLeave(playerId, status = "LEFT") {
    Logger.debug(
      `[Engine.handleLeave] Called: playerId=${playerId} status=${status} gameId=${this.context.gameId}`
    );
    // WATCHDOG: Update activity timestamp
    this.lastActivity = Date.now();

    const events = [];
    const effects = [];

    const player = this.context.players.find((p) => p.id === playerId);
    if (!player) {
      Logger.warn(
        `[Engine.handleLeave] Player not found: playerId=${playerId} gameId=${this.context.gameId}`
      );
      return { success: false, state: this.context, events: [], effects: [] };
    }
    Logger.debug(
      `[Engine.handleLeave] Player found: playerId=${playerId} seat=${player.seat} status=${player.status} gameId=${this.context.gameId}`
    );

    // 1. Update Status (use provided status parameter)
    player.status = status;
    player.leaving = true;
    player.isOffline = true;
    player.isGhost = false;
    Logger.debug(
      `[Engine.handleLeave] Updated player status to ${status}: playerId=${playerId} seat=${player.seat} gameId=${this.context.gameId}`
    );

    // 1.5. Host Migration (for private games)
    // Check if leaving player is the host and migrate to first remaining player
    if (
      this.context.isPrivate &&
      this.context.hostId === playerId &&
      this.context.players.length > 0
    ) {
      // Find first remaining player (excluding the one leaving)
      const remainingPlayers = this.context.players.filter(
        (p) => p.id !== playerId && !this._isPermanentlyLeft(p)
      );

      if (remainingPlayers.length > 0) {
        const newHost = remainingPlayers[0];
        const oldHostId = this.context.hostId;
        this.context.hostId = newHost.id;

        events.push({
          type: "HOST_CHANGED",
          payload: {
            oldHost: oldHostId,
            newHost: newHost.id,
          },
        });

        Logger.info(
          `[Engine.handleLeave] Host migrated from ${oldHostId} to ${newHost.id} in game ${this.context.gameId}`
        );
      } else {
        // No players remaining - game should end or be closed
        Logger.warn(
          `[Engine.handleLeave] Host ${playerId} left with no remaining players in game ${this.context.gameId}`
        );
      }
    }

    // 1.6. Check if last player left a waiting game
    // If game is in waiting status and no active players remain, end the game
    if (
      this.context.status === "waiting" ||
      this.context.currentPhase === "waiting"
    ) {
      const remainingActivePlayers = this.context.players.filter(
        (p) => p.id !== playerId && !this._isPermanentlyLeft(p) && p.chips > 0
      );

      if (remainingActivePlayers.length === 0) {
        // Last player left a waiting game - end it
        this.context.status = "finished";
        this.context.message = "No players remaining";
        this.context.currentPhase = "complete";

        effects.push({
          type: EffectType.GAME_END,
          winnerId: null,
          reason: "No players remaining in waiting game",
        });

        Logger.info(
          `[Engine.handleLeave] Last player left waiting game ${this.context.gameId}, ending game`
        );

        // Persist the game end
        effects.push({ type: EffectType.PERSIST });

        return {
          success: true,
          state: this.context,
          events,
          effects,
        };
      }
    }

    // 2. Auto-Fold if active hand
    const isBettingPhase = this._isBettingPhase();
    Logger.debug(
      `[Engine.handleLeave] Checking betting phase: isBettingPhase=${isBettingPhase} folded=${player.folded} gameId=${this.context.gameId}`
    );
    if (isBettingPhase && !player.folded) {
      player.folded = true;
      player.eligibleToBet = false;
      player.hasActed = true; // FIX: Mark as acted so advance logic works correctly

      events.push({
        type: EventType.PLAYER_ACTION,
        payload: {
          seat: player.seat,
          action: "fold",
          // No amount for fold
        },
      });
      Logger.debug(
        `[Engine.handleLeave] Auto-folded player: playerId=${playerId} seat=${player.seat} gameId=${this.context.gameId}`
      );
    }

    // 3. Clear Actor if it was their turn
    if (this.context.currentActorSeat === player.seat) {
      Logger.debug(
        `[Engine.handleLeave] Clearing actor seat: playerId=${playerId} seat=${player.seat} gameId=${this.context.gameId}`
      );
      this.context.currentActorSeat = null;
      this.context.actionDeadline = null;
    }

    // 4. Evaluate Game Flow (Advance to next player or end round)
    Logger.debug(
      `[Engine.handleLeave] Evaluating game flow: playerId=${playerId} gameId=${this.context.gameId}`
    );
    const flowEffects = this.evaluateGame(true);
    effects.push(...flowEffects);
    Logger.debug(
      `[Engine.handleLeave] Game flow evaluation complete: flowEffects=${flowEffects.length} gameId=${this.context.gameId}`
    );

    // 5. Persist
    effects.push({ type: EffectType.PERSIST });

    Logger.info(
      `[Engine.handleLeave] Completed: playerId=${playerId} success=true events=${events.length} effects=${effects.length} gameId=${this.context.gameId}`
    );
    return {
      success: true,
      state: this.context,
      events,
      effects,
    };
  }

  /**
   * Process admin action (host controls)
   * @param {Object} action - Admin action object {type, ...}
   * @returns {Object} GameResult
   */
  processAdminAction(action) {
    // WATCHDOG: Update activity timestamp
    this.lastActivity = Date.now();

    const events = [];
    const effects = [];

    switch (action.type) {
      case "ADMIN_PAUSE":
        this.context.isPaused = true;
        // Clear action deadline to prevent timeouts while paused
        // The deadline will be recalculated when the game resumes
        if (this.context.actionDeadline) {
          this.context.actionDeadline = null;
        }
        events.push({
          type: EventType.STATE_CHANGED,
          payload: {
            message: "Game paused by host",
            isPaused: true,
          },
        });
        break;

      case "ADMIN_RESUME":
        this.context.isPaused = false;
        events.push({
          type: EventType.STATE_CHANGED,
          payload: {
            message: "Game resumed by host",
            isPaused: false,
          },
        });

        // Restart timer for current actor if one exists (don't advance)
        if (this.context.currentActorSeat && this._isBettingPhase()) {
          const actor = this.context.players.find(
            (p) => p.seat === this.context.currentActorSeat
          );
          if (actor) {
            // Restart the timer with a fresh deadline
            this.context.actionDeadline = new Date(
              Date.now() + this.config.actionTimeoutMs
            ).toISOString();

            effects.push({
              type: EffectType.START_TIMER,
              timerType: TimerType.ACTION_TIMEOUT,
              duration: this.config.actionTimeoutMs,
              playerId: actor.id,
            });

            Logger.debug(
              `[processAdminAction] Restarted timer for current actor after resume: seat=${this.context.currentActorSeat} playerId=${actor.id} game=${this.context.gameId}`
            );
          }
        } else {
          // No current actor - restart game flow normally
          const flowEffects = this.evaluateGame(true);
          effects.push(...flowEffects);
        }
        break;

      case "ADMIN_SET_STACK":
        // Find player by seat or playerId
        const targetPlayer = action.seat
          ? this.context.players.find((p) => p.seat === action.seat)
          : this.context.players.find((p) => p.id === action.playerId);

        if (!targetPlayer) {
          return {
            success: false,
            state: this.context,
            events: [
              {
                type: EventType.ERROR,
                payload: {
                  message: `Player not found for stack update`,
                },
              },
            ],
            effects: [],
          };
        }

        targetPlayer.chips = action.amount;
        events.push({
          type: EventType.PLAYER_STATUS_UPDATE,
          payload: {
            playerId: targetPlayer.id,
            seat: targetPlayer.seat,
            chips: targetPlayer.chips,
            message: `Stack updated to ${action.amount}`,
          },
        });
        break;

      case "ADMIN_SET_BLINDS":
        this.context.smallBlind = action.smallBlind;
        this.context.bigBlind = action.bigBlind;
        events.push({
          type: EventType.STATE_CHANGED,
          payload: {
            message: `Blinds updated to ${action.smallBlind}/${action.bigBlind}`,
            smallBlind: action.smallBlind,
            bigBlind: action.bigBlind,
          },
        });
        break;

      case "ADMIN_KICK":
        // For private games, mark as REMOVED (will transition to spectator at end of hand)
        // For online games, mark as LEFT (will be removed)
        const isPrivate = this.context.isPrivate || false;
        const kickStatus = isPrivate ? "REMOVED" : "LEFT";
        const kickResult = this.handleLeave(action.playerId, kickStatus);
        events.push(...kickResult.events);
        effects.push(...kickResult.effects);
        events.push({
          type: EventType.PLAYER_STATUS_UPDATE,
          payload: {
            playerId: action.playerId,
            message: "Kicked by host",
            status: kickStatus,
          },
        });
        break;

      case "ADMIN_APPROVE":
        // Find request in pendingRequests (support both requestId/playerId and targetUserId for compatibility)
        const targetUserId =
          action.targetUserId || action.requestId || action.playerId;
        const requestIndex = this.context.pendingRequests.findIndex(
          (req) =>
            (req.id || req.playerId) === targetUserId ||
            req.id === action.requestId ||
            req.playerId === action.playerId
        );

        if (requestIndex === -1) {
          return {
            success: false,
            state: this.context,
            events: [
              {
                type: EventType.ERROR,
                payload: {
                  message: "Request not found",
                },
              },
            ],
            effects: [],
          };
        }

        const request = this.context.pendingRequests[requestIndex];
        const playerId = request.id || request.playerId;

        // Check if user is in spectators or was a zero-chip player
        const wasSpectator = this.context.spectators?.some(
          (s) => s.userId === playerId
        );

        // Remove from spectators if present
        if (wasSpectator && this.context.spectators) {
          this.context.spectators = this.context.spectators.filter(
            (s) => s.userId !== playerId
          );
        }

        // Guard: Check if table is already full
        if (this.context.players.length >= this.config.maxPlayers) {
          return {
            success: false,
            state: this.context,
            events: [
              {
                type: EventType.ERROR,
                payload: {
                  message: "Table is full",
                },
              },
            ],
            effects: [],
          };
        }

        // Find next available seat (support targetSeatIndex if provided)
        const targetSeat =
          action.targetSeatIndex || this._findNextAvailableSeat();
        if (!targetSeat) {
          return {
            success: false,
            state: this.context,
            events: [
              {
                type: EventType.ERROR,
                payload: {
                  message: "No seats available",
                },
              },
            ],
            effects: [],
          };
        }

        // Remove from pendingRequests
        this.context.pendingRequests.splice(requestIndex, 1);

        // Determine player status based on game state
        // If game is in "waiting" state (host hasn't started), player should be ACTIVE
        // If game is active, player should be WAITING_FOR_NEXT_HAND
        const isGameWaiting =
          this.context.status === "waiting" ||
          this.context.currentPhase === "waiting";
        const playerStatus = isGameWaiting ? "ACTIVE" : "WAITING_FOR_NEXT_HAND";
        const statusMessage = isGameWaiting
          ? "Seat approved - ready to play"
          : "Seat approved - waiting for next hand";

        // Add to players with appropriate status and fresh stack
        // If joining mid-hand (WAITING_FOR_NEXT_HAND), join as folded
        const newPlayer = {
          id: playerId,
          username: request.username || "Unknown",
          seat: targetSeat,
          chips: this.config.startingStack || this.config.buyIn || 1000, // Fresh stack
          status: playerStatus,
          isBot: false,
          isOffline: false,
          isGhost: false,
          currentBet: 0,
          totalBet: 0,
          holeCards: [],
          // If joining mid-hand (WAITING_FOR_NEXT_HAND), join as folded
          folded: playerStatus === "WAITING_FOR_NEXT_HAND",
          allIn: false,
          eligibleToBet: playerStatus === "ACTIVE", // Only eligible if ACTIVE
          hasActed: playerStatus === "WAITING_FOR_NEXT_HAND", // Mark as acted if joining mid-hand
          leaving: false,
          lastAction: null,
          revealedIndices: [],
        };

        this.context.players.push(newPlayer);

        // Update pot eligible players
        this.context.pots[0].eligiblePlayers.push(playerId);

        events.push({
          type: EventType.PLAYER_STATUS_UPDATE,
          payload: {
            playerId: playerId,
            status: playerStatus,
            message: statusMessage,
            seat: targetSeat,
            chips: newPlayer.chips,
          },
        });
        break;

      case "ADMIN_REJECT":
        // Remove request from pendingRequests (support both requestId/playerId and targetUserId for compatibility)
        const rejectTargetUserId =
          action.targetUserId || action.requestId || action.playerId;
        const rejectIndex = this.context.pendingRequests.findIndex(
          (req) =>
            (req.id || req.playerId) === rejectTargetUserId ||
            req.id === action.requestId ||
            req.playerId === action.playerId
        );

        if (rejectIndex === -1) {
          return {
            success: false,
            state: this.context,
            events: [
              {
                type: EventType.ERROR,
                payload: {
                  message: "Request not found",
                },
              },
            ],
            effects: [],
          };
        }

        const rejectedPlayerId =
          this.context.pendingRequests[rejectIndex].id ||
          this.context.pendingRequests[rejectIndex].playerId;

        this.context.pendingRequests.splice(rejectIndex, 1);
        events.push({
          type: EventType.PLAYER_STATUS_UPDATE,
          payload: {
            playerId: rejectedPlayerId,
            message: "Request rejected",
          },
        });
        break;

      case "ADMIN_START_GAME":
        // 1. Check if enough players
        if (this.context.players.length < 2) {
          return {
            success: false,
            state: this.context,
            events: [
              {
                type: EventType.ERROR,
                payload: {
                  message: "Not enough players",
                },
              },
            ],
            effects: [],
          };
        }

        // 2. Set status to active
        this.context.status = "active";

        // 3. Call evaluateGame(true) to trigger first hand dealing sequence
        // Note: This will evaluate the game state, but we also need to transition to preflop
        // to actually start dealing cards. The transition will be handled by the effects.
        const startGameEffects = this.evaluateGame(true);
        effects.push(...startGameEffects);

        // If game is in waiting phase, transition to preflop to start the first hand
        if (this.context.currentPhase === "waiting") {
          const transitionResult = this.executeTransition("preflop");
          events.push(...transitionResult.events);
          effects.push(...transitionResult.effects);
          // Update context with transition result
          this.context = transitionResult.state;
        }

        // 4. Return success result
        return {
          success: true,
          state: this.context,
          events: events,
          effects: effects,
        };

      default:
        return {
          success: false,
          state: this.context,
          events: [
            {
              type: EventType.ERROR,
              payload: {
                message: `Unknown admin action: ${action.type}`,
              },
            },
          ],
          effects: [],
        };
    }

    // Always persist after admin action
    effects.push({ type: EffectType.PERSIST });

    return {
      success: true,
      state: this.context,
      events,
      effects,
    };
  }

  /**
   * Request seat in private game
   * @param {Object} playerInfo - Player information {id, username, chips?, seat?}
   * @returns {Object} GameResult
   */
  requestSeat(playerInfo) {
    // WATCHDOG: Update activity timestamp
    this.lastActivity = Date.now();

    const events = [];
    const effects = [];

    // Validate game is private
    if (!this.context.isPrivate) {
      return {
        success: false,
        state: this.context,
        events: [
          {
            type: EventType.ERROR,
            payload: {
              message: "Game is not private",
            },
          },
        ],
        effects: [],
      };
    }

    // Get player ID (support both id and playerId fields)
    const playerId = playerInfo.id || playerInfo.playerId;
    if (!playerId) {
      return {
        success: false,
        state: this.context,
        events: [
          {
            type: EventType.ERROR,
            payload: {
              message: "Player ID is required",
            },
          },
        ],
        effects: [],
      };
    }

    // Check if player is already in game (as a seated player)
    if (this.context.players.some((p) => p.id === playerId)) {
      return {
        success: false,
        state: this.context,
        events: [
          {
            type: EventType.ERROR,
            payload: {
              message: "Player already in game",
            },
          },
        ],
        effects: [],
      };
    }

    // Check if request already exists
    if (
      this.context.pendingRequests.some(
        (req) => (req.id || req.playerId) === playerId
      )
    ) {
      return {
        success: false,
        state: this.context,
        events: [
          {
            type: EventType.ERROR,
            payload: {
              message: "Request already pending",
            },
          },
        ],
        effects: [],
      };
    }

    // If not in spectators, add them (for tracking)
    const isSpectator = this.context.spectators?.some(
      (s) => s.userId === playerId
    );
    if (!isSpectator && this.context.spectators) {
      this.context.spectators.push({
        userId: playerId,
        username: playerInfo.username || "Unknown",
        joinedAt: new Date().toISOString(),
      });
    }

    // Add to pending requests (always requires host approval)
    this.context.pendingRequests.push(playerInfo);

    // Notify host
    events.push({
      type: "HOST_NOTIFICATION",
      payload: {
        targetUserId: this.context.hostId,
        message: "New seat request",
        playerInfo: playerInfo,
      },
    });

    effects.push({ type: EffectType.PERSIST });

    return {
      success: true,
      state: this.context,
      events,
      effects,
    };
  }

  /**
   * Handle action timeout
   * NOTE: This applies to BOTH humans and bots identically.
   * Bots have 1-3s delays, but if they somehow don't act within the deadline,
   * they will be timed out and auto-folded just like humans.
   * @param {string} playerId - Player ID (optional)
   * @returns {Object} GameResult
   */
  handleTimeExpiry(playerId = null) {
    // Guard: Don't process timeouts if game is paused
    if (this.context.isPaused) {
      Logger.debug(
        `[handleTimeExpiry] Skipping timeout processing - game is paused gameId=${this.context.gameId}`
      );
      return {
        success: true,
        state: this.context,
        events: [],
        effects: [],
      };
    }

    const events = [];
    const effects = [];

    // 1. Capture the event payload regarding who timed out/folded
    // We must do this before evaluateGame potentially clears the currentActorSeat
    if (playerId) {
      const player = this.context.players.find((p) => p.id === playerId);
      if (player && !player.folded && !player.allIn) {
        player.folded = true;
        player.eligibleToBet = false;
        player.hasActed = true;

        events.push({
          type: EventType.PLAYER_ACTION,
          payload: {
            seat: player.seat,
            action: "fold",
            reason: "timeout",
          },
        });
      }
    } else if (this.context.currentActorSeat) {
      const actor = this.context.players.find(
        (p) => p.seat === this.context.currentActorSeat
      );
      if (actor && !actor.folded && !actor.allIn) {
        actor.folded = true;
        actor.eligibleToBet = false;
        actor.hasActed = true;

        events.push({
          type: EventType.PLAYER_ACTION,
          payload: {
            seat: actor.seat,
            action: "fold",
            reason: "timeout",
          },
        });
      }
    }

    // 2. Update Game State (Advance actor, check round end)
    // The events are in the array but NOT returned/emitted yet.
    const flowEffects = this.evaluateGame();
    effects.push(...flowEffects);

    // 3. Persist and Return
    // Now we return, sending events and new state simultaneously.
    effects.push({ type: EffectType.PERSIST });

    return {
      success: true,
      state: this.context,
      events,
      effects,
    };
  }

  /**
   * Execute a phase transition (called by Manager after effect execution)
   * @param {string} targetPhase - Target phase name
   * @returns {Object} GameResult
   */
  executeTransition(targetPhase, overrides = null) {
    const events = [];
    const effects = [];

    if (!targetPhase || this.context.status === "finished") {
      return {
        success: true,
        state: this.context,
        events: [],
        effects: [],
      };
    }

    const previousPhase = this.context.currentPhase;
    this.context.currentPhase = targetPhase;

    // 1. Push STATE_CHANGED event FIRST
    // This ensures clients update their view mode (e.g. Preflop -> Flop) before processing the cards/chips
    events.push({
      type: EventType.STATE_CHANGED,
      payload: {
        fromPhase: previousPhase,
        toPhase: targetPhase,
        timestamp: new Date().toISOString(),
      },
    });

    // 2. Execute Phase Logic (Deal cards, award pots)
    let phaseResult = null;
    switch (targetPhase) {
      case "preflop":
        phaseResult = this._enterPreflop(overrides);
        break;
      case "flop":
        phaseResult = this._enterFlop(overrides);
        break;
      case "turn":
        phaseResult = this._enterTurn(overrides);
        break;
      case "river":
        phaseResult = this._enterRiver(overrides);
        break;
      case "showdown":
        phaseResult = this._enterShowdown();
        break;
      case "complete":
        phaseResult = this._enterHandComplete();
        break;
    }

    // 3. Merge Phase Events (e.g. DEAL_STREET, WIN_POT)
    if (phaseResult) {
      events.push(...phaseResult.events);
      effects.push(...phaseResult.effects);
    }

    // Always persist after transition
    effects.push({ type: EffectType.PERSIST });

    return {
      success: true,
      state: this.context,
      events,
      effects,
    };
  }

  /**
   * Add players to the game
   * @param {Array} newPlayers - Array of player data objects
   * @returns {boolean} True if any players were added
   */
  addPlayers(newPlayers) {
    if (this.startInProgress) return false;

    // Guard: Check if adding players would exceed max table size
    if (this.context.players.length >= this.config.maxPlayers) {
      Logger.warn(
        `[addPlayers] Cannot add players - table is full (${this.context.players.length}/${this.config.maxPlayers}) game=${this.context.gameId}`
      );
      return false;
    }

    const addedPlayers = [];
    newPlayers.forEach((p) => {
      // Guard: Check if table is already full
      if (this.context.players.length >= this.config.maxPlayers) {
        Logger.warn(
          `[addPlayers] Table is full, skipping player ${p.id} game=${this.context.gameId}`
        );
        return;
      }

      // Check if player is already in the game
      if (this.context.players.some((existing) => existing.id === p.id)) {
        return;
      }

      // Auto-assign seat if not provided
      let seat = p.seat;
      if (!seat) {
        const takenSeats = this.context.players.map((pl) => pl.seat);
        for (let i = 1; i <= this.config.maxPlayers; i++) {
          if (!takenSeats.includes(i)) {
            seat = i;
            break;
          }
        }
      }
      if (!seat) return; // No seats available

      // CORE FIX: Bot-Aware Initialization
      // Bots are always 'active' and never 'offline'.
      const isBot = !!p.isBot;

      const player = {
        id: p.id,
        username: p.username || `Player ${seat}`,
        seat,
        // Prioritize explicit chips, then config.startingStack, then config.buyIn, then default
        chips:
          p.chips || this.config.startingStack || this.config.buyIn || 1000,
        isBot,
        // FIX: Bots start online. Real players start offline (waiting for socket).
        isOffline: isBot ? false : true,
        status: "ACTIVE", // Force active so they are dealt into the first hand

        // Default State Fields
        currentBet: 0,
        totalBet: 0,
        holeCards: [],
        folded: false,
        allIn: false,
        eligibleToBet: true,
        hasActed: false,
        left: false,
        leaving: false,
        lastAction: null,
        isGhost: false,
        revealedIndices: [], // Track which hole card indices are revealed during showdown
      };

      this.context.players.push(player);
      addedPlayers.push(player);
    });

    // Update pot eligible players
    if (addedPlayers.length > 0) {
      this.context.pots[0].eligiblePlayers = this.context.players.map(
        (p) => p.id
      );
    }

    return addedPlayers.length > 0;
  }

  /**
   * Build base context (shared logic for player and spectator contexts)
   * @private
   * @param {string|null} playerId - Player ID (null for spectator)
   * @returns {Object|null} Context copy or null if player not found
   */
  _buildContextBase(playerId) {
    // For player context, validate player exists
    if (playerId) {
      const player = this.context.players.find((p) => p.id === playerId);
      if (!player) {
        return null;
      }
    }

    // 1. Deep Copy
    const ctxCopy = JSON.parse(JSON.stringify(this.context));

    // SECURITY: Remove deck from copied context to prevent deck order leakage
    delete ctxCopy.deck;

    // 2. Serialize community cards
    ctxCopy.communityCards = this._serializeCommunityCards(
      ctxCopy.communityCards
    );

    // 3. Detect runout condition and get necessary data
    const runoutData = this._detectRunout();
    const { isRunout } = runoutData;
    const activePlayersCount = this._getActivePlayersForBalance().length;
    const isShowdown = this.context.currentPhase === "showdown";

    // 4. Serialize players (hide/show hole cards)
    ctxCopy.players = ctxCopy.players.map((p) => {
      const isSelf = playerId ? p.id === playerId : false;

      if (p.holeCards) {
        // Initialize revealedIndices if not present
        if (!p.revealedIndices) {
          p.revealedIndices = [];
        }

        // Map hole cards with selective reveal logic
        p.holeCards = this._mapHoleCards(
          p.holeCards,
          isSelf,
          isShowdown,
          isRunout,
          activePlayersCount,
          p.revealedIndices,
          p.folded
        );

        // If all cards are hidden and player is folded, return empty array
        // (for UI consistency - folded players show no cards)
        if (p.folded && p.holeCards.every((c) => c === "HIDDEN")) {
          p.holeCards = [];
        }
      }
      return p;
    });

    return ctxCopy;
  }

  /**
   * Get player-specific context (hides other players' cards)
   * @param {string} playerId - Player ID
   * @returns {Object} Player context
   */
  getPlayerContext(playerId) {
    return this._buildContextBase(playerId);
  }

  /**
   * Get spectator context (same structure as player context, all cards hidden except runout/showdown)
   * Mirrors getPlayerContext logic but treats spectator as "not self" (all cards hidden)
   * @returns {Object} Spectator context
   */
  getSpectatorContext() {
    return this._buildContextBase(null);
  }

  // ========== PRIVATE METHODS ==========

  /**
   * Evaluate game flow and return effects
   * Publicly accessible for Manager to trigger after state updates (e.g. leaves)
   * @param {boolean} shouldAdvance - Whether to advance to next player (default: true)
   * @returns {Array} Array of effects
   */
  evaluateGame(shouldAdvance = true) {
    const effects = [];

    // Guard: Don't evaluate if game is paused
    if (this.context.isPaused) {
      return effects;
    }

    // Guard: Don't evaluate if game is finished
    if (
      this.context.status === "finished" ||
      this.context.status === "complete"
    ) {
      return effects;
    }

    // Active players definition (All-In players are active, includes bots)
    const activePlayers = this._getActivePlayers();

    // Get current high bet
    const currentBet = this._getCurrentBet();

    // FIX: Identify players with chips (not all-in, chips > 0)
    const playersWithChips = this._getPlayersWithChips();

    // FIX: Check if betting is balanced (all active players have matched currentBet or are all-in)
    const isBettingBalanced = this._isBettingBalanced(currentBet);

    // FIX: Game Flow - Only clear actor if runout is confirmed and balanced
    // This ensures currentActorSeat remains valid while Player 2 is facing the All-In
    if (
      isBettingBalanced &&
      playersWithChips.length <= 1 &&
      this._isBettingPhase()
    ) {
      Logger.debug(
        `[evaluateGame] Runout confirmed: betting balanced with ${playersWithChips.length} player(s) with chips. Round complete. game=${this.context.gameId}`
      );

      // Recalculate pots based on totalBet values (handles all-in side pots correctly)
      this._calculateSidePots(this.context);

      // Clear actor immediately to close UI (betting is truly finished)
      this.context.currentActorSeat = null;
      this.context.actionDeadline = null;

      const nextPhase = this._getNextPhase();
      if (nextPhase) {
        effects.push({
          type: EffectType.SCHEDULE_TRANSITION,
          targetPhase: nextPhase,
          delayMs: this.config.runoutPhaseDelayMs || 2000, // Use runout delay for all-in runouts
        });
      }
      return effects;
    }

    // Players who can still take action
    // A player needs to act if:
    // 1. They're not all-in
    // 2. They haven't acted yet, OR
    // 3. They've acted but their bet is now less than the current bet (someone raised)
    // Special case: In heads-up preflop, BB needs to act even if they've already posted the blind
    const isHeadsUpPreflop =
      activePlayers.length === 2 && this.context.currentPhase === "preflop";

    const playersToAct = activePlayers.filter((p) => {
      if (p.allIn) return false;
      if (p.status === "WAITING_FOR_NEXT_HAND") return false; // Exclude players waiting for next hand

      // In heads-up preflop, BB must get a chance to act even if they posted the blind
      if (isHeadsUpPreflop && p.seat === this.context.bbSeat && !p.hasActed) {
        return true;
      }

      // Standard logic: hasn't acted OR bet is less than current bet
      return !p.hasActed || p.currentBet < currentBet;
    });

    // Scenario A: Uncontested Win (1 player left)
    if (activePlayers.length < 2) {
      // Check for Leavers to trigger Runout
      const hasLeaver = this.context.players.some((p) =>
        this._isPermanentlyLeft(p)
      );
      const isBoardComplete = this.context.communityCards.length >= 5;

      // FIX: If a player left, we MUST run out the board (Turn/River) before ending.
      if (hasLeaver && !isBoardComplete) {
        Logger.debug(
          `[evaluateGame] Leaver detected. Running out board. Phase=${this.context.currentPhase}`
        );

        const nextPhase = this._getNextPhase();
        // Ensure we don't skip straight to showdown/complete if cards are missing
        if (nextPhase && nextPhase !== "complete" && nextPhase !== "showdown") {
          this.context.currentActorSeat = null;
          this.context.actionDeadline = null;

          effects.push({
            type: EffectType.SCHEDULE_TRANSITION,
            targetPhase: nextPhase,
            delayMs: this.config.runoutPhaseDelayMs || 2000, // Use runout delay for leaver runouts
          });
          return effects;
        }
      }

      Logger.debug(`[evaluateGame] Uncontested win. Scheduling Showdown.`);
      // Clear actor immediately to close UI
      this.context.currentActorSeat = null;
      this.context.actionDeadline = null;

      effects.push({
        type: "SCHEDULE_TRANSITION",
        targetPhase: "showdown",
        delayMs: 0, // Manager handles delay timing
      });
      return effects;
    }

    // Scenario B: Betting Round Complete
    if (playersToAct.length === 0 && this._isBettingPhase()) {
      Logger.debug(`[evaluateGame] Round Complete. Scheduling next phase.`);

      // Recalculate pots based on totalBet values (handles all-in side pots correctly)
      // This ensures that when multiple players go all-in with different amounts,
      // only the matched amounts go into the main pot, and excess goes into side pots
      this._calculateSidePots(this.context);

      // FIX: Clear actor immediately so UI closes modal while waiting for transition
      this.context.currentActorSeat = null;
      this.context.actionDeadline = null;

      const nextPhase = this._getNextPhase();
      if (nextPhase) {
        effects.push({
          type: EffectType.SCHEDULE_TRANSITION,
          targetPhase: nextPhase,
          delayMs: this.config.phaseTransitionDelayMs || 2000, // Engine controls timing via config
        });
      }
      return effects;
    }

    // Scenario C: Round Continues
    if (shouldAdvance && this._isBettingPhase()) {
      this._advanceToNextPlayer();

      if (this.context.currentActorSeat) {
        const actor = this.context.players.find(
          (p) => p.seat === this.context.currentActorSeat
        );
        effects.push({
          type: EffectType.START_TIMER,
          timerType: TimerType.ACTION_TIMEOUT,
          duration: this.config.actionTimeoutMs,
          playerId: actor?.id,
        });
      }
    } else if (
      !shouldAdvance &&
      this._isBettingPhase() &&
      this.context.currentActorSeat
    ) {
      // FIX: New betting round started - start timer for the first actor that was just set
      // This handles phase transitions (preflop->flop, flop->turn, turn->river) where shouldAdvance=false
      // but we still need to start a timer for the first actor
      const actor = this.context.players.find(
        (p) => p.seat === this.context.currentActorSeat
      );
      if (actor) {
        // Set action deadline
        this.context.actionDeadline = new Date(
          Date.now() + this.config.actionTimeoutMs
        ).toISOString();

        effects.push({
          type: EffectType.START_TIMER,
          timerType: TimerType.ACTION_TIMEOUT,
          duration: this.config.actionTimeoutMs,
          playerId: actor.id,
        });
        Logger.debug(
          `[evaluateGame] Starting timer for first actor (new round) seat=${this.context.currentActorSeat} playerId=${actor.id} game=${this.context.gameId}`
        );
      }
    }

    // Always persist
    effects.push({ type: EffectType.PERSIST });

    return effects;
  }

  /**
   * Get next phase based on current phase
   * @private
   * @returns {string|null} Next phase name
   */
  _getNextPhase() {
    const phaseFlow = {
      waiting: "preflop",
      preflop: "flop",
      flop: "turn",
      turn: "river",
      river: "showdown",
      showdown: "complete",
      complete: this.context.status === "finished" ? null : "waiting",
    };

    return phaseFlow[this.context.currentPhase] || null;
  }

  /**
   * Check if current phase is a betting phase
   * @private
   * @returns {boolean}
   */
  _isBettingPhase() {
    return ["preflop", "flop", "turn", "river"].includes(
      this.context.currentPhase
    );
  }

  /**
   * Process a betting action
   * @private
   * @param {Object} action - Action object
   */
  _processBettingAction(action) {
    const player = this.context.players.find((p) => p.seat === action.seat);
    if (!player || player.folded || player.allIn) {
      return;
    }

    const currentBet = this._getCurrentBet();
    const toCall = currentBet - player.currentBet;

    switch (action.type) {
      case "fold":
        player.folded = true;
        player.eligibleToBet = false;
        break;

      case "check":
        if (toCall > 0) {
          throw new Error("Cannot check, must call or fold");
        }
        player.eligibleToBet = false;
        break;

      case "call":
        // Check if this is calling an all-in amount (less than full toCall)
        const requestedCallAmount = action.amount || toCall;
        const isAllInCall = requestedCallAmount < toCall;

        if (isAllInCall) {
          // Verify this matches an all-in player's bet
          const allInPlayers = this.context.players.filter(
            (p) => !p.folded && p.allIn && p.currentBet < currentBet
          );
          const allInAmount =
            allInPlayers.length > 0
              ? Math.max(...allInPlayers.map((p) => p.currentBet))
              : null;

          if (
            allInAmount === null ||
            requestedCallAmount !== allInAmount - player.currentBet
          ) {
            throw new Error(
              `Invalid all-in call amount: ${requestedCallAmount}. Expected ${
                allInAmount - player.currentBet
              }`
            );
          }

          // Call the all-in amount
          const actualCallAmount = Math.min(requestedCallAmount, player.chips);
          player.chips -= actualCallAmount;
          player.currentBet += actualCallAmount;
          player.totalBet += actualCallAmount;
          this.context.pots[0].amount += actualCallAmount;

          // Mark as all-in (can't continue betting, only eligible for pots up to this amount)
          player.allIn = true;
          player.eligibleToBet = false;
        } else {
          // Standard call (full amount)
          const actualCallAmount = Math.min(toCall, player.chips);
          player.chips -= actualCallAmount;
          player.currentBet += actualCallAmount;
          player.totalBet += actualCallAmount;
          this.context.pots[0].amount += actualCallAmount;
          if (player.chips === 0) player.allIn = true;
          player.eligibleToBet = false;
        }
        break;

      case "bet":
        // Unified bet action handles both betting and raising
        const betAmount = Math.floor(action.amount || this.context.bigBlind);
        // toCall is already calculated at the top of the function

        if (currentBet === 0) {
          // Opening bet - must be at least bigBlind
          if (betAmount < this.context.bigBlind) {
            throw new Error(
              `Bet amount ${betAmount} must be at least the big blind (${this.context.bigBlind})`
            );
          }
          player.chips -= betAmount;
          player.currentBet = betAmount;
          player.totalBet += betAmount;
          this.context.pots[0].amount += betAmount;
          // Track last raise amount (the bet itself)
          this.context.lastRaiseAmount = betAmount;
          if (player.chips === 0) player.allIn = true;
          // Reset eligibleToBet for others
          this.context.players.forEach((p) => {
            if (p.seat !== player.seat && !p.folded && !p.allIn) {
              p.eligibleToBet = true;
            }
          });
          player.eligibleToBet = false;
        } else if (betAmount === currentBet) {
          // Call
          const callAmount = Math.min(toCall, player.chips);
          player.chips -= callAmount;
          player.currentBet += callAmount;
          player.totalBet += callAmount;
          this.context.pots[0].amount += callAmount;
          if (player.chips === 0) player.allIn = true;
          player.eligibleToBet = false;
        } else if (betAmount > currentBet) {
          // Raise
          const raiseAmount = betAmount - currentBet;
          const lastRaise =
            this.context.lastRaiseAmount || this.context.bigBlind;
          // Minimum raise is the LARGER of last raise amount or big blind
          const minRaiseAmount = Math.max(lastRaise, this.context.bigBlind);

          if (raiseAmount < minRaiseAmount) {
            throw new Error(
              `Raise amount ${raiseAmount} must be at least ${minRaiseAmount} (minimum raise)`
            );
          }

          const totalNeeded = betAmount - player.currentBet;
          player.chips -= totalNeeded;
          player.currentBet = betAmount;
          player.totalBet += totalNeeded;
          this.context.pots[0].amount += totalNeeded;
          // Track last raise amount
          this.context.lastRaiseAmount = raiseAmount;
          if (player.chips === 0) player.allIn = true;
          // Reset eligibleToBet for others
          this.context.players.forEach((p) => {
            if (p.seat !== player.seat && !p.folded && !p.allIn) {
              p.eligibleToBet = true;
            }
          });
          player.eligibleToBet = false;
        } else {
          throw new Error(
            `Bet amount ${betAmount} must be at least ${currentBet} (to call)`
          );
        }
        break;

      case "allin":
        const allInAmount = player.chips;
        player.chips = 0;
        player.currentBet += allInAmount;
        player.totalBet += allInAmount;
        player.allIn = true;
        this.context.pots[0].amount += allInAmount;
        if (allInAmount > currentBet) {
          // Reset eligibleToBet for others
          this.context.players.forEach((p) => {
            if (p.seat !== player.seat && !p.folded && !p.allIn) {
              p.eligibleToBet = true;
            }
          });
        }
        player.eligibleToBet = false;
        break;
    }
  }

  /**
   * Get legal actions for a seat
   * @private
   * @param {number} seat - Seat number
   * @returns {Array} Legal actions
   */
  _getLegalActions(seat) {
    const player = this.context.players.find((p) => p.seat === seat);
    if (!player || player.folded || player.allIn) {
      return [];
    }

    if (this.context.currentActorSeat !== seat) {
      return [];
    }

    const currentBet = this._getCurrentBet();
    const toCall = currentBet - player.currentBet;

    const actions = [];

    if (toCall === 0) {
      actions.push({ type: "check" });
      actions.push({ type: "fold" }); // Allow open fold (valid poker move)
    } else {
      actions.push({ type: "fold" });

      // Check if there's an all-in player with a smaller bet
      // This allows players to call the all-in amount instead of the full amount
      const allInPlayers = this.context.players.filter(
        (p) => !p.folded && p.allIn && p.currentBet < currentBet
      );

      if (allInPlayers.length > 0) {
        // There's an all-in player with less than currentBet
        // Use the smallest all-in amount (for main pot eligibility only)
        const allInAmount = Math.min(...allInPlayers.map((p) => p.currentBet));
        const toCallAllIn = allInAmount - player.currentBet;

        if (
          toCallAllIn > 0 &&
          toCallAllIn < toCall &&
          toCallAllIn <= player.chips
        ) {
          // Offer option to call the all-in amount (eligible only for main pot)
          actions.push({
            type: "call",
            amount: toCallAllIn,
            isAllInCall: true, // Flag to indicate this is calling an all-in
          });
        }
      }

      // Always offer the full call option (eligible for all pots, can continue betting)
      actions.push({ type: "call", amount: toCall });
    }

    if (currentBet === 0) {
      actions.push({
        type: "bet",
        minAmount: this.context.bigBlind,
        maxAmount: player.chips,
      });
    } else {
      // Can raise - use unified "bet" action
      // Minimum raise is the LARGER of last raise amount or big blind
      const lastRaise = this.context.lastRaiseAmount || this.context.bigBlind;
      const minRaiseAmount = Math.max(lastRaise, this.context.bigBlind);
      const minRaiseTotal = currentBet + minRaiseAmount;

      if (player.chips >= minRaiseTotal - player.currentBet) {
        actions.push({
          type: "bet",
          minAmount: minRaiseTotal, // Minimum total bet amount
          maxAmount: player.chips + player.currentBet, // Maximum total bet (all-in)
        });
      }
    }

    actions.push({ type: "allin", amount: player.chips });

    return actions;
  }

  /**
   * Get current bet amount
   * @private
   * @returns {number}
   */
  _getCurrentBet() {
    // Only consider active (non-folded) players when calculating current bet
    const activePlayers = this._getActivePlayersForBalance();
    if (activePlayers.length === 0) return 0;

    // Get max bet from players who can still act (not all-in)
    const playersWhoCanAct = activePlayers.filter((p) => !p.allIn);

    if (playersWhoCanAct.length > 0) {
      // There are players who can still act
      // The effective bet is the max of:
      // 1. Max bet from players who can act
      // 2. Max bet from all-in players (if higher) - this handles cases where
      //    someone goes all-in for more than the current bet
      const maxFromActingPlayers = Math.max(
        ...playersWhoCanAct.map((p) => p.currentBet),
        0
      );
      const allInPlayers = activePlayers.filter((p) => p.allIn);
      const maxFromAllInPlayers =
        allInPlayers.length > 0
          ? Math.max(...allInPlayers.map((p) => p.currentBet), 0)
          : 0;

      // Return the higher of the two (effective bet)
      // This ensures that if someone goes all-in for 1000, the effective bet is 1000,
      // not just the bet of the remaining non-all-in players
      return Math.max(maxFromActingPlayers, maxFromAllInPlayers);
    }

    // All players are all-in - return max of all bets
    return Math.max(...activePlayers.map((p) => p.currentBet), 0);
  }

  /**
   * Advance to next player
   * @private
   */
  _advanceToNextPlayer() {
    if (!this.context.currentActorSeat) {
      // FIX: Verify firstActorSeat is not LEFT/REMOVED before using it
      if (this.context.firstActorSeat) {
        const firstActor = this.context.players.find(
          (p) => p.seat === this.context.firstActorSeat
        );
        if (
          firstActor &&
          !this._isPermanentlyLeft(firstActor) &&
          !firstActor.folded &&
          !firstActor.allIn
        ) {
          // Check if they still need to act
          const highBet = this._getCurrentBet();
          const needsToAct =
            !firstActor.hasActed || firstActor.currentBet < highBet;
          if (needsToAct) {
            const actionTimeoutMs = this.config.actionTimeoutMs || 30000;
            this.context.currentActorSeat = this.context.firstActorSeat;
            this.context.actionDeadline = new Date(
              Date.now() + actionTimeoutMs
            ).toISOString();
            Logger.debug(
              `[_advanceToNextPlayer] Set currentActorSeat to firstActorSeat ${this.context.firstActorSeat} (${firstActor.id}) game=${this.context.gameId}`
            );
            return;
          }
        }
        // If firstActorSeat is invalid, fall through to find next eligible player
      }

      // Find first eligible player starting from button
      let seat = this.context.buttonSeat;
      const maxPlayers = this.context.maxPlayers || 6;
      const actionTimeoutMs = this.config.actionTimeoutMs || 30000;
      const highBet = this._getCurrentBet();

      for (let i = 0; i < maxPlayers; i++) {
        seat = (seat % maxPlayers) + 1;
        const player = this.context.players.find((p) => p.seat === seat);

        if (
          !player ||
          player.folded ||
          player.allIn ||
          this._isPermanentlyLeft(player) ||
          player.status === "WAITING_FOR_NEXT_HAND"
        ) {
          continue;
        }

        const needsToAct = !player.hasActed || player.currentBet < highBet;
        if (needsToAct) {
          this.context.currentActorSeat = seat;
          this.context.actionDeadline = new Date(
            Date.now() + actionTimeoutMs
          ).toISOString();
          Logger.debug(
            `[_advanceToNextPlayer] Set currentActorSeat to Seat ${seat} (${player.id}) game=${this.context.gameId}`
          );
          return;
        }
      }

      // No eligible player found
      this.context.currentActorSeat = null;
      this.context.actionDeadline = null;
      return;
    }

    let seat = this.context.currentActorSeat;
    const maxPlayers = this.context.maxPlayers || 6;
    const actionTimeoutMs = this.config.actionTimeoutMs || 30000;
    const highBet = this._getCurrentBet();

    Logger.debug(
      `[advanceToNextPlayer] Advancing from Seat ${seat} game=${this.context.gameId} phase=${this.context.currentPhase} highBet=${highBet}`
    );

    // Special case: In heads-up preflop, BB must get a chance to act even if they posted the blind
    const isHeadsUpPreflop =
      this.context.players.filter(
        (p) => !p.folded && !this._isPermanentlyLeft(p)
      ).length === 2 && this.context.currentPhase === "preflop";

    for (let i = 0; i < maxPlayers; i++) {
      seat = (seat % maxPlayers) + 1;
      const player = this.context.players.find((p) => p.seat === seat);

      if (
        !player ||
        player.folded ||
        player.allIn ||
        this._isPermanentlyLeft(player)
      ) {
        continue;
      }

      // In heads-up preflop, BB needs to act if they haven't acted yet (even if they posted the blind)
      const isBBInHeadsUp =
        isHeadsUpPreflop &&
        player.seat === this.context.bbSeat &&
        !player.hasActed;
      const needsToAct =
        !player.hasActed || player.currentBet < highBet || isBBInHeadsUp;

      if (needsToAct) {
        this.context.currentActorSeat = seat;
        this.context.actionDeadline = new Date(
          Date.now() + actionTimeoutMs
        ).toISOString();
        Logger.debug(
          `[advanceToNextPlayer] Advanced to Seat ${seat} (${player.id}) hasActed=${player.hasActed} currentBet=${player.currentBet} highBet=${highBet} isBBInHeadsUp=${isBBInHeadsUp} game=${this.context.gameId} phase=${this.context.currentPhase}`
        );
        return;
      }
    }

    Logger.debug(
      `[advanceToNextPlayer] No player needs to act - round complete game=${this.context.gameId} phase=${this.context.currentPhase}`
    );
    this.context.currentActorSeat = null;
    this.context.actionDeadline = null;
  }

  /**
   * Reset betting state for new round
   * @private
   */
  _resetBettingState() {
    this.context.players.forEach((p) => {
      if (!p.folded && !this._isPermanentlyLeft(p)) {
        p.hasActed = false;
        p.currentBet = 0; // Reset bet for active players
        p.eligibleToBet = true;
      } else {
        p.eligibleToBet = false;
        // Also reset currentBet for folded players at end of betting round
        p.currentBet = 0;
      }
    });

    this.context.currentActorSeat = null;
    this.context.actionDeadline = null;

    // Reset minRaise to bigBlind for new betting round (minimum bet/raise size)
    this.context.minRaise = this.context.bigBlind;
    // Reset lastRaiseAmount for new betting round
    this.context.lastRaiseAmount = null;

    Logger.debug(
      `[resetBettingState] Reset betting state for new round game=${this.context.gameId} phase=${this.context.currentPhase}`
    );
  }

  /**
   * Initialize betting round: reset state and determine first actor
   * Extracted from _dealCommunityCards to be shared by both random and override paths
   * @private
   */
  _initializeBettingRound() {
    const ctx = this.context;

    // Reset betting state
    this._resetBettingState();

    // FIX: Detect runout condition before actor selection
    // Calculate active players (not folded, not left)
    const activePlayers = this._getActivePlayers();

    // Calculate players with chips (active players who are not all-in and have chips > 0)
    const playersWithChips = this._getPlayersWithChips();

    // Check if this is a runout: playersWithChips <= 1 AND activePlayers > 1
    if (playersWithChips.length <= 1 && activePlayers.length > 1) {
      Logger.debug(
        `[_initializeBettingRound] Runout detected: ${playersWithChips.length} player(s) with chips, ${activePlayers.length} active player(s). Skipping actor selection. game=${ctx.gameId}`
      );

      // Leave firstActorSeat, currentActorSeat, and actionDeadline as null
      // This ensures the round starts in a 'completed' state
      ctx.firstActorSeat = null;
      ctx.currentActorSeat = null;
      ctx.actionDeadline = null;

      // Return early - evaluateGame will detect this and trigger next phase immediately
      return;
    }

    // DETERMINE FIRST ACTOR (POSTFLOP)
    // Always Left of Button (Small Blind position)
    // Find first eligible player starting left of button
    let nextSeat = ctx.buttonSeat;
    const maxPlayers = ctx.maxPlayers || 6;
    const actionTimeoutMs = this.config.actionTimeoutMs || 30000;

    for (let i = 0; i < maxPlayers; i++) {
      nextSeat = (nextSeat % maxPlayers) + 1;
      const player = ctx.players.find((p) => p.seat === nextSeat);
      if (
        player &&
        !player.folded &&
        !player.allIn &&
        !this._isPermanentlyLeft(player) &&
        player.status !== "WAITING_FOR_NEXT_HAND" // Exclude players waiting for next hand
      ) {
        ctx.firstActorSeat = nextSeat;
        ctx.currentActorSeat = nextSeat;
        ctx.actionDeadline = new Date(
          Date.now() + actionTimeoutMs
        ).toISOString();
        Logger.debug(
          `[_initializeBettingRound] Set First Actor (Postflop): Seat ${nextSeat} (${player.id}) game=${ctx.gameId} buttonSeat=${ctx.buttonSeat}`
        );
        break;
      }
    }

    if (!ctx.currentActorSeat) {
      Logger.warn(
        `[_initializeBettingRound] No eligible first actor found game=${ctx.gameId}`
      );
      ctx.firstActorSeat = null;
      ctx.actionDeadline = null;
    }
  }

  /**
   * Deal community cards
   * @private
   * @param {number} count - Number of cards to deal
   */
  /**
   * Validate a card object has required properties
   * @private
   * @param {Object} card - Card object to validate
   * @throws {Error} If card is invalid
   */
  _validateCard(card) {
    if (
      !card ||
      typeof card.rank === "undefined" ||
      typeof card.suit === "undefined"
    ) {
      throw new Error(
        "Invalid card object passed to overrides. Must have rank and suit properties."
      );
    }
  }

  /**
   * Remove cards from deck by matching suit and rank
   * @private
   * @param {Array} deck - Deck array
   * @param {Array} cardsToRemove - Cards to remove
   * @returns {Array} Filtered deck
   */
  _removeCardsFromDeck(deck, cardsToRemove) {
    return deck.filter((deckCard) => {
      return !cardsToRemove.some(
        (removeCard) =>
          deckCard.suit === removeCard.suit && deckCard.rank === removeCard.rank
      );
    });
  }

  /**
   * Apply card overrides for deterministic replay
   * @private
   * @param {Object} overrides - Override object with holeCards and/or communityCards
   * @throws {Error} If override cards are invalid
   */
  _applyCardOverrides(overrides) {
    const ctx = this.context;

    // Apply hole card overrides
    if (overrides.holeCards) {
      ctx.players.forEach((player) => {
        if (!player.folded && overrides.holeCards[player.seat]) {
          const overrideCards = overrides.holeCards[player.seat];
          // Validate all cards
          overrideCards.forEach((card) => this._validateCard(card));
          // Assign cards to player
          player.holeCards = overrideCards;
          // Remove cards from deck to prevent duplicates
          ctx.deck = this._removeCardsFromDeck(ctx.deck, overrideCards);
        }
      });
    }

    // Apply community card overrides
    if (overrides.communityCards) {
      // Validate all cards
      overrides.communityCards.forEach((card) => this._validateCard(card));
      // Push cards to community cards
      ctx.communityCards.push(...overrides.communityCards);
      // Remove cards from deck to prevent duplicates
      ctx.deck = this._removeCardsFromDeck(ctx.deck, overrides.communityCards);
    }
  }

  /**
   * Deal community cards and set first actor
   * @param {number} count - Number of cards to deal
   * @returns {Array} The cards that were dealt
   */
  _dealCommunityCards(count) {
    // Burn one card
    if (this.context.deck.length > 0) {
      this.context.deck.shift();
    }

    // Deal cards
    const cards = dealCards(this.context.deck, count);
    this.context.communityCards.push(...cards);

    // Initialize betting round (resets state and determines first actor)
    this._initializeBettingRound();

    // Return the cards that were dealt
    return cards;
  }

  /**
   * Enter preflop phase
   * @private
   * @param {Object} [overrides=null] - Optional card overrides for deterministic replay
   * @returns {Object} GameResult
   */
  _enterPreflop(overrides = null) {
    const ctx = this.context;

    // 1. DESTRUCTIVE RESET (Fixes "Ghost Cards")
    ctx.communityCards = [];
    ctx.pots = [{ amount: 0, eligiblePlayers: [] }];

    // 1.5. Activate players waiting for next hand
    const waitingPlayers = ctx.players.filter(
      (p) => p.status === "WAITING_FOR_NEXT_HAND"
    );

    for (const player of waitingPlayers) {
      player.status = "ACTIVE";
      // Reset hand-specific state
      player.holeCards = [];
      player.currentBet = 0;
      player.totalBet = 0;
      player.folded = false;
      player.allIn = false;
      player.eligibleToBet = true;
      player.hasActed = false;
      player.lastAction = null;
      player.revealedIndices = [];

      Logger.debug(
        `[_enterPreflop] Activated player ${player.id} (seat ${player.seat}) from WAITING_FOR_NEXT_HAND to ACTIVE game=${ctx.gameId}`
      );
    }

    // 2. Create and shuffle deck (always create fresh deck, even for replays)
    const deck = createShuffledDeck();
    ctx.deck = deck;

    // 3. Deal hole cards (use overrides if provided, otherwise random)
    if (overrides && overrides.holeCards) {
      // Apply hole card overrides
      this._applyCardOverrides(overrides);
    } else {
      // Standard random dealing
      ctx.players.forEach((player) => {
        if (!player.folded) {
          player.holeCards = dealCards(ctx.deck, 2);
        }
      });
    }

    // 3.5. Capture starting stacks BEFORE blinds are posted
    // This ensures accurate hand history replay with initial chip counts
    const startingStacks = ctx.players
      .filter((p) => !p.folded && !this._isPermanentlyLeft(p))
      .map((p) => ({
        seat: p.seat,
        chips: p.chips,
      }));

    // 4. Post blinds (This now handles First Actor determination logic internally)
    // We moved the First Actor logic into _postBlinds to ensure consistency with Heads-Up rules
    const blindEvents = [];
    this._postBlinds(blindEvents);

    // 5. Set min raise and action deadline
    // Set minRaise to bigBlind (minimum bet/raise size)
    ctx.minRaise = ctx.bigBlind;
    // Initialize lastRaiseAmount to null for new hand
    ctx.lastRaiseAmount = null;
    if (ctx.currentActorSeat) {
      ctx.actionDeadline = new Date(
        Date.now() + this.config.actionTimeoutMs
      ).toISOString();
    }

    // 6. Check for insufficient players
    this._skipBettingIfInsufficientPlayers();

    Logger.debug(
      `[Engine] Preflop Started. Board CLEARED. First Actor: ${ctx.currentActorSeat}`
    );

    // 7. Return Result with EMPTY cards payload
    // IMPORTANT: DEAL_STREET must come BEFORE blindEvents to ensure
    // HandHistoryService.startHand() is called before recording blinds
    return {
      state: ctx,
      events: [
        {
          type: EventType.DEAL_STREET,
          payload: {
            street: "preflop",
            cards: [], // Explicitly empty
            communityCards: [], // Explicitly empty
            pot: 0,
            startingStacks: startingStacks, // Starting chip stacks before blinds
          },
        },
        ...blindEvents,
      ],
      effects: this.evaluateGame(false),
    };
  }

  /**
   * Find next available seat
   * @private
   * @returns {number|null} Next available seat number or null if none available
   */
  _findNextAvailableSeat() {
    // Guard: Check if table is already full
    if (this.context.players.length >= this.config.maxPlayers) {
      return null;
    }

    const takenSeats = this.context.players.map((p) => p.seat);
    for (let i = 1; i <= this.config.maxPlayers; i++) {
      if (!takenSeats.includes(i)) {
        return i;
      }
    }
    return null; // No seats available
  }

  /**
   * Find the next active seat clockwise from the current seat
   * @private
   * @param {number} currentSeat - Current seat number
   * @param {Array} activePlayers - Array of active player objects
   * @returns {number} Next active seat number
   */
  _getNextActiveSeat(currentSeat, activePlayers) {
    let seat = currentSeat;
    for (let i = 0; i < this.config.maxPlayers; i++) {
      seat = (seat % this.config.maxPlayers) + 1;
      if (activePlayers.some((p) => p.seat === seat)) return seat;
    }
    return currentSeat; // Fallback
  }

  /**
   * Post blinds
   * @private
   * @param {Array} events - Optional array to collect blind events
   */
  _postBlinds(events) {
    // Get active players, then filter for those ready to play (not waiting for next hand, have chips)
    const activePlayers = this._getActivePlayers().filter(
      (p) => p.status !== "WAITING_FOR_NEXT_HAND" && p.chips > 0
    );
    const isHeadsUp = activePlayers.length === 2;

    let buttonSeat, sbSeat, bbSeat;

    // Use existing buttonSeat from context (already rotated properly)
    buttonSeat = this.context.buttonSeat;

    // Validate button seat has a valid player with chips
    const buttonPlayer = this.context.players.find(
      (p) => p.seat === buttonSeat
    );
    if (
      !buttonPlayer ||
      this._isPermanentlyLeft(buttonPlayer) ||
      buttonPlayer.status === "WAITING_FOR_NEXT_HAND" ||
      buttonPlayer.chips === 0
    ) {
      // Button seat is invalid - find first valid player
      if (activePlayers.length > 0) {
        buttonSeat = activePlayers[0].seat;
        this.context.buttonSeat = buttonSeat;
        Logger.warn(
          `[_postBlinds] Button seat was invalid, reassigned to seat ${buttonSeat} game=${this.context.gameId}`
        );
      } else {
        Logger.error(
          `[_postBlinds] No valid players for button assignment game=${this.context.gameId}`
        );
        return; // Should trigger game end
      }
    }

    // LOGIC: Heads-Up Rules (2 players) vs Normal Rules (3+ players)
    if (isHeadsUp) {
      // HEADS-UP RULES:
      // 1. Dealer (Button) posts Small Blind
      // 2. Non-Dealer posts Big Blind
      sbSeat = buttonSeat;

      // Find the other player (Non-Dealer)
      const otherPlayer = activePlayers.find((p) => p.seat !== buttonSeat);
      if (otherPlayer) {
        bbSeat = otherPlayer.seat;
      } else {
        // Fallback safety
        bbSeat = (buttonSeat % this.context.maxPlayers) + 1;
      }

      Logger.debug(
        `[_postBlinds] Heads-Up Detected. SB (Dealer)=${sbSeat}, BB=${bbSeat}`
      );
    } else {
      // NORMAL RULES (3+ Players):
      // 1. SB is left of Button
      // 2. BB is left of SB
      sbSeat = this._getNextActiveSeat(buttonSeat, activePlayers);
      bbSeat = this._getNextActiveSeat(sbSeat, activePlayers);

      Logger.debug(
        `[_postBlinds] Normal Play. Button=${buttonSeat}, SB=${sbSeat}, BB=${bbSeat}`
      );
    }

    // CRITICAL FIX: Save to Context for UI display
    this.context.dealerSeat = buttonSeat;
    this.context.sbSeat = sbSeat;
    this.context.bbSeat = bbSeat;

    const sbPlayer = this.context.players.find((p) => p.seat === sbSeat);
    const bbPlayer = this.context.players.find((p) => p.seat === bbSeat);

    if (sbPlayer) {
      const sbAmount = Math.min(this.context.smallBlind, sbPlayer.chips);
      sbPlayer.chips -= sbAmount;
      sbPlayer.currentBet = sbAmount;
      sbPlayer.totalBet = sbAmount;
      this.context.pots[0].amount += sbAmount;
      if (sbPlayer.chips === 0) sbPlayer.allIn = true;
      if (events)
        events.push({
          type: "PLAYER_ACTION",
          payload: {
            seat: sbPlayer.seat,
            action: "post_small_blind",
            amount: sbAmount,
          },
        });
    }

    if (bbPlayer) {
      const bbAmount = Math.min(this.context.bigBlind, bbPlayer.chips);
      bbPlayer.chips -= bbAmount;
      bbPlayer.currentBet = bbAmount;
      bbPlayer.totalBet = bbAmount;
      this.context.pots[0].amount += bbAmount;
      if (bbPlayer.chips === 0) bbPlayer.allIn = true;
      if (events)
        events.push({
          type: "PLAYER_ACTION",
          payload: {
            seat: bbPlayer.seat,
            action: "post_big_blind",
            amount: bbAmount,
          },
        });
    }

    // DETERMINE FIRST ACTOR (PREFLOP)
    if (isHeadsUp) {
      // Heads-Up: Dealer (SB) acts first Preflop
      this.context.currentActorSeat = sbSeat;
      this.context.firstActorSeat = sbSeat;
    } else {
      // Normal: UTG (Left of BB) acts first
      const utgSeat = this._getNextActiveSeat(bbSeat, activePlayers);
      this.context.currentActorSeat = utgSeat;
      this.context.firstActorSeat = utgSeat;
    }

    Logger.debug(
      `[Engine] Preflop First Actor: Seat ${this.context.currentActorSeat} (Button=${this.context.buttonSeat}, HeadsUp=${isHeadsUp}) game=${this.context.gameId}`
    );
  }

  /**
   * Skip betting if insufficient players
   * @private
   */
  _skipBettingIfInsufficientPlayers() {
    const activePlayers = this.context.players.filter(
      (p) => p.status === "ACTIVE" && !p.folded && p.chips > 0
    );

    if (activePlayers.length < 2) {
      Logger.debug(
        `[skipBetting] Insufficient active players game=${this.context.gameId} hand=${this.context.handNumber} phase=${this.context.currentPhase} activePlayers=${activePlayers.length}`
      );

      this.context.players.forEach((p) => {
        p.eligibleToBet = false;
        if (
          (p.status === "DISCONNECTED" || this._isPermanentlyLeft(p)) &&
          !p.folded &&
          !p.allIn
        ) {
          p.folded = true;
        }
      });

      this.context.currentActorSeat = null;
      this.context.actionDeadline = null;
    }
  }

  /**
   * Enter flop phase
   * @private
   * @returns {Object} GameResult with DEAL_STREET event
   */
  /**
   * Enter flop phase
   * @private
   * @returns {Object} GameResult with DEAL_STREET event
   */
  _enterFlop(overrides = null) {
    const ctx = this.context;

    // Override takes precedence - if provided, apply it before guard check
    if (overrides) {
      this._applyCardOverrides(overrides);
      this._initializeBettingRound();
    } else {
      // FIX: Guard against double-dealing (only for random path)
      if (ctx.communityCards.length >= 3) {
        Logger.warn(
          `[Engine] Flop already dealt, skipping deal. game=${ctx.gameId}`
        );
      } else {
        this._dealCommunityCards(3); // This already calls _initializeBettingRound()
      }
    }

    // SERIALIZE PAYLOAD
    const fullBoardStrings = ctx.communityCards.map((c) => c.display || c);
    const newCardsStrings = ctx.communityCards
      .slice(0, 3)
      .map((c) => c.display || c);

    Logger.debug(`[Engine] Dealing Flop (Serialized):`, newCardsStrings);

    return {
      state: ctx,
      events: [
        {
          type: EventType.DEAL_STREET,
          payload: {
            street: "flop",
            communityCards: fullBoardStrings,
            cards: newCardsStrings,
            pot: ctx.pots[0]?.amount || 0,
          },
        },
      ],
      effects: this.evaluateGame(false),
    };
  }

  /**
   * Enter turn phase
   * @private
   * @param {Object} [overrides=null] - Optional card overrides for deterministic replay
   * @returns {Object} GameResult with DEAL_STREET event
   */
  _enterTurn(overrides = null) {
    const ctx = this.context;

    // Override takes precedence - if provided, apply it before guard check
    if (overrides) {
      this._applyCardOverrides(overrides);
      this._initializeBettingRound();
    } else {
      // FIX: Guard against double-dealing (only for random path)
      if (ctx.communityCards.length >= 4) {
        Logger.warn(
          `[Engine] Turn already dealt, skipping deal. game=${ctx.gameId}`
        );
      } else {
        this._dealCommunityCards(1); // This already calls _initializeBettingRound()
      }
    }

    // SERIALIZE PAYLOAD
    const fullBoardStrings = ctx.communityCards.map((c) => c.display || c);
    const newCardsStrings = ctx.communityCards
      .slice(3, 4)
      .map((c) => c.display || c);

    Logger.debug(`[Engine] Dealing Turn (Serialized):`, newCardsStrings);

    return {
      state: ctx,
      events: [
        {
          type: EventType.DEAL_STREET,
          payload: {
            street: "turn",
            communityCards: fullBoardStrings,
            cards: newCardsStrings,
            pot: ctx.pots[0]?.amount || 0,
          },
        },
      ],
      effects: this.evaluateGame(false),
    };
  }

  /**
   * Enter river phase
   * @private
   * @param {Object} [overrides=null] - Optional card overrides for deterministic replay
   * @returns {Object} GameResult with DEAL_STREET event
   */
  _enterRiver(overrides = null) {
    const ctx = this.context;

    // Override takes precedence - if provided, apply it before guard check
    if (overrides) {
      this._applyCardOverrides(overrides);
      this._initializeBettingRound();
    } else {
      // FIX: Guard against double-dealing (only for random path)
      if (ctx.communityCards.length >= 5) {
        Logger.warn(
          `[Engine] River already dealt, skipping deal. game=${ctx.gameId}`
        );
      } else {
        this._dealCommunityCards(1); // This already calls _initializeBettingRound()
      }
    }

    // SERIALIZE PAYLOAD
    const fullBoardStrings = ctx.communityCards.map((c) => c.display || c);
    const newCardsStrings = ctx.communityCards
      .slice(4, 5)
      .map((c) => c.display || c);

    Logger.debug(`[Engine] Dealing River (Serialized):`, newCardsStrings);

    return {
      state: ctx,
      events: [
        {
          type: EventType.DEAL_STREET,
          payload: {
            street: "river",
            communityCards: fullBoardStrings,
            cards: newCardsStrings,
            pot: ctx.pots[0]?.amount || 0,
          },
        },
      ],
      effects: this.evaluateGame(false),
    };
  }

  /**
   * Enter showdown phase
   * @private
   */
  _enterShowdown() {
    const ctx = this.context;

    // Idempotency Check
    if (ctx.showdownResults) {
      return {
        state: ctx,
        events: [],
        effects: [
          {
            type: EffectType.SCHEDULE_TRANSITION,
            targetPhase: "complete",
            delayMs: 5000, // Strict 5-second duration for Showdown phase
          },
        ],
      };
    }

    Logger.debug(
      `[Engine] Entering Showdown. Active players: ${
        ctx.players.filter((p) => !p.folded && !this._isPermanentlyLeft(p))
          .length
      }`
    );

    // 0. Calculate side pots before evaluating winners
    // This ensures proper pot splitting when players have different all-in amounts
    this._calculateSidePots(ctx);

    // 1. Evaluate Winner
    const winners = this._evaluateWinner(ctx);

    // 2. Distribute Pot
    const winEvents = [];
    this._distributePot(ctx, winners, winEvents);

    return {
      state: ctx,
      events: [...winEvents], // Include win events for hand history
      effects: [
        {
          type: EffectType.SCHEDULE_TRANSITION,
          targetPhase: "complete",
          delayMs: 5000, // Strict 5-second duration for Showdown phase
        },
      ],
    };
  }

  /**
   * Evaluate winner(s) using ShowdownService
   * @private
   * @param {Object} ctx - Game context
   * @returns {Array} Array of winner objects
   */
  _evaluateWinner(ctx) {
    // Filter active players (not folded, not left)
    const activePlayers = ctx.players.filter(
      (p) => !p.folded && !this._isPermanentlyLeft(p)
    );

    if (activePlayers.length === 0) return [];

    // If only 1 player left (e.g. everyone folded), they win automatically
    if (activePlayers.length === 1) {
      const winner = activePlayers[0];
      return [
        {
          playerId: winner.id,
          id: winner.id,
          seat: winner.seat,
          hand: { name: "Winner (all others folded)" },
          evaluation: {
            name: "Winner (all others folded)",
            desc: "Won by default",
          },
          desc: "Won by default",
        },
      ];
    }

    // Use ShowdownService
    try {
      const winnersResult = determineWinners(activePlayers, ctx.communityCards);
      return winnersResult.winners || [];
    } catch (error) {
      Logger.error("[Engine] Error evaluating winner:", error);
      // Fallback: return first active player
      return [
        {
          playerId: activePlayers[0].id,
          id: activePlayers[0].id,
          seat: activePlayers[0].seat,
          hand: { name: "High Card" },
          evaluation: { name: "High Card", desc: "Fallback winner" },
          desc: "Fallback winner",
        },
      ];
    }
  }

  /**
   * Calculate side pots based on totalBet amounts
   * Creates main pot + side pots with correct eligiblePlayers
   * Called at showdown to properly split pots when players have different all-in amounts
   * @private
   * @param {Object} ctx - Game context
   */
  _calculateSidePots(ctx) {
    // Get all active players (not folded, not left) with their totalBet
    const activePlayers = ctx.players
      .filter((p) => !p.folded && !this._isPermanentlyLeft(p))
      .map((p) => ({
        id: p.id,
        totalBet: p.totalBet || 0,
        player: p, // Keep reference to player object
      }));

    if (activePlayers.length === 0) {
      // No active players, keep existing pot structure
      return;
    }

    // Get unique totalBet amounts, sorted ascending
    const betLevels = [...new Set(activePlayers.map((p) => p.totalBet))]
      .filter((bet) => bet > 0)
      .sort((a, b) => a - b);

    // If all players bet the same amount, no side pots needed
    if (betLevels.length <= 1) {
      // Just ensure main pot has all eligible players
      if (ctx.pots[0]) {
        ctx.pots[0].eligiblePlayers = activePlayers.map((p) => p.id);
      }
      return;
    }

    // Calculate side pots
    // Each pot level represents chips that all players at that level contributed
    const newPots = [];
    let previousLevel = 0;

    for (let i = 0; i < betLevels.length; i++) {
      const currentLevel = betLevels[i];
      const levelAmount = currentLevel - previousLevel;

      // Players eligible for this pot level (contributed at least this much)
      const eligibleForThisLevel = activePlayers
        .filter((p) => p.totalBet >= currentLevel)
        .map((p) => p.id);

      // Calculate pot amount: levelAmount * number of eligible players
      const potAmount = levelAmount * eligibleForThisLevel.length;

      newPots.push({
        amount: potAmount,
        eligiblePlayers: eligibleForThisLevel,
      });

      previousLevel = currentLevel;
    }

    // FIX: Return unmatched chips to players (only once, not on every street)
    // If a side pot has only one eligible player, that player effectively wins it immediately
    // Return those chips to their stack and remove the pot
    // IMPORTANT: Only return chips if the player's chips are still 0 (haven't been returned yet)
    // This prevents returning chips multiple times when _calculateSidePots is called on each street
    const potsToKeep = [];
    for (const pot of newPots) {
      if (pot.eligiblePlayers.length === 1) {
        // Only one player eligible for this pot - return chips to them immediately
        const playerId = pot.eligiblePlayers[0];
        const player = ctx.players.find((p) => p.id === playerId);
        if (player) {
          // Only return chips if player is all-in and hasn't received unmatched chips yet
          // Check if player's current chips + totalBet matches their original stack
          // If player.chips > 0 and they're all-in, they may have already received unmatched chips
          // We can verify by checking if the pot amount matches what should be returned
          // For safety, only return if player is all-in (chips should be 0 before return)
          if (player.allIn && player.chips === 0) {
            // Player is all-in with 0 chips - safe to return unmatched chips
            player.chips += pot.amount;
            Logger.debug(
              `[_calculateSidePots] Returning ${pot.amount} chips to player ${playerId} (single-eligible side pot)`
            );
            // Don't add this pot to the pots array since chips are returned
          } else if (!player.allIn) {
            // Player is not all-in, so this shouldn't happen, but keep the pot just in case
            potsToKeep.push(pot);
          } else {
            // Player is all-in but already has chips - unmatched chips were already returned
            // Don't return again, but also don't keep the pot (it was already handled)
            Logger.debug(
              `[_calculateSidePots] Skipping return of ${pot.amount} chips to player ${playerId} (already returned, chips=${player.chips})`
            );
            // Don't add this pot to the pots array since chips were already returned
          }
        }
      } else {
        // Multiple players eligible - keep the pot for showdown
        potsToKeep.push(pot);
      }
    }

    // Replace pots array with calculated side pots (excluding single-eligible pots)
    ctx.pots = potsToKeep;

    Logger.debug(
      `[_calculateSidePots] Created ${newPots.length} pot(s) for game=${ctx.gameId} ` +
        `betLevels=[${betLevels.join(", ")}] ` +
        `totalAmount=${newPots.reduce((sum, p) => sum + p.amount, 0)}`
    );
  }

  /**
   * Distribute pot(s) to winners and mutate player chips
   * @private
   * @param {Object} ctx - Game context
   * @param {Array} winners - Array of winner objects from _evaluateWinner
   */
  _distributePot(ctx, winners, events) {
    // Iterate through all pots (Main + Side)
    ctx.pots.forEach((pot, index) => {
      if (pot.amount === 0) return;

      // 1. Identify Eligible Winners for this specific pot
      // (If eligiblePlayers is empty/undefined, assume all winners are eligible - Main Pot)
      const eligibleWinners = winners.filter(
        (w) =>
          !pot.eligiblePlayers ||
          pot.eligiblePlayers.length === 0 ||
          pot.eligiblePlayers.includes(w.playerId || w.id)
      );

      // 2. Determine payout group
      // If no winners are eligible for this side pot, re-evaluate winners from eligible players only
      let payoutGroup = eligibleWinners;
      if (
        eligibleWinners.length === 0 &&
        pot.eligiblePlayers &&
        pot.eligiblePlayers.length > 0
      ) {
        // This shouldn't happen in normal play, but handle edge case:
        // Re-evaluate winners from only the eligible players for this pot
        const eligiblePlayers = ctx.players.filter(
          (p) =>
            pot.eligiblePlayers.includes(p.id) &&
            !p.folded &&
            !this._isPermanentlyLeft(p)
        );
        if (eligiblePlayers.length > 0) {
          try {
            const eligibleWinnersResult = determineWinners(
              eligiblePlayers,
              ctx.communityCards
            );
            payoutGroup = eligibleWinnersResult.winners || [];
            Logger.warn(
              `[_distributePot] No eligible winners found for pot ${index}, re-evaluated from ${eligiblePlayers.length} eligible players game=${ctx.gameId}`
            );
          } catch (error) {
            Logger.error(
              `[_distributePot] Error re-evaluating winners for pot ${index}:`,
              error
            );
            // Fallback: use all winners (last resort)
            payoutGroup = winners;
          }
        } else {
          // No eligible players found - this is a data integrity issue
          Logger.error(
            `[_distributePot] No eligible players found for pot ${index} with eligiblePlayers=[${pot.eligiblePlayers.join(
              ", "
            )}] game=${ctx.gameId}`
          );
          // Skip this pot (don't distribute)
          return;
        }
      }

      if (payoutGroup.length > 0) {
        const share = Math.floor(pot.amount / payoutGroup.length);
        const remainder = pot.amount % payoutGroup.length;

        payoutGroup.forEach((winner, i) => {
          // CRITICAL: Find the actual player object in context to mutate
          const playerRef = ctx.players.find(
            (p) => p.id === (winner.playerId || winner.id)
          );
          if (playerRef) {
            const extra = i < remainder ? 1 : 0;
            const total = share + extra;
            playerRef.chips += total; // <--- CHIPS AWARDED HERE
            if (events)
              events.push({
                type: "WIN_POT",
                payload: {
                  seat: playerRef.seat,
                  amount: total,
                  potIndex: index,
                },
              });
            Logger.debug(
              `[Engine] Awarded ${total} chips to ${playerRef.id} from Pot ${index}`
            );
          }
        });
      }

      // Empty the pot
      pot.amount = 0;
    });

    // Save detailed results for the UI
    ctx.showdownResults = {
      winners: winners.map((w) => w.playerId || w.id),
      ranks: winners.map((w) => ({
        playerId: w.playerId || w.id,
        rank: w.rank || 1,
        message: w.evaluation?.name || w.hand?.name || "Winner",
      })),
      distributions: winners.map((w) => {
        const player = ctx.players.find((p) => p.id === (w.playerId || w.id));
        return {
          playerId: w.playerId || w.id,
          amount: 0, // Will be calculated from pot distribution above
        };
      }),
    };
  }

  /**
   * Enter hand complete phase
   * @private
   */
  _enterHandComplete() {
    const ctx = this.context;

    // Initialize events and effects arrays at the start
    const events = [];
    const effects = [];

    // 1. Move Button - Skip empty seats and only rotate to players with chips
    const playersWithChips = ctx.players.filter(
      (p) => !this._isPermanentlyLeft(p) && p.chips > 0
    );

    if (playersWithChips.length === 0) {
      // No players with chips - handled by later logic
      Logger.warn(
        `[_enterHandComplete] No players with chips remaining game=${ctx.gameId}`
      );
    } else {
      // Find current button player in the valid players list
      const currentButtonIndex = playersWithChips.findIndex(
        (p) => p.seat === ctx.buttonSeat
      );

      if (currentButtonIndex >= 0) {
        // Current button is valid - rotate to next player
        const nextIndex = (currentButtonIndex + 1) % playersWithChips.length;
        ctx.buttonSeat = playersWithChips[nextIndex].seat;
      } else {
        // Current button seat is invalid (empty or no chips) - assign to first valid player
        ctx.buttonSeat = playersWithChips[0].seat;
        Logger.warn(
          `[_enterHandComplete] Button seat was invalid, reassigned to seat ${ctx.buttonSeat} game=${ctx.gameId}`
        );
      }

      Logger.debug(
        `[_enterHandComplete] Button rotated to seat ${ctx.buttonSeat} (${playersWithChips.length} players with chips) game=${ctx.gameId}`
      );
    }

    // 2. Increment Hand Number
    ctx.handNumber++;

    // 3. Remove LEFT players and handle REMOVED players
    const leftPlayers = ctx.players.filter((p) => p.status === "LEFT");
    const removedPlayers = ctx.players.filter((p) => p.status === "REMOVED");

    // Remove LEFT players (online games - permanent removal)
    if (leftPlayers.length > 0) {
      Logger.info(
        `[HandComplete] Removing ${leftPlayers.length} permanently left player(s) game=${ctx.gameId} hand=${ctx.handNumber}`
      );

      ctx.removedGhostPlayers = leftPlayers.map((p) => ({
        id: p.id,
        seat: p.seat,
        username: p.username,
      }));

      ctx.players = ctx.players.filter((p) => p.status !== "LEFT");
    } else {
      ctx.removedGhostPlayers = [];
    }

    // Handle REMOVED players (private games - move to spectators)
    if (removedPlayers.length > 0) {
      if (!ctx.isPrivate) {
        // Defensive: REMOVED should only exist in private games, but handle edge case
        Logger.warn(
          `[HandComplete] REMOVED players found in non-private game - treating as LEFT game=${ctx.gameId} hand=${ctx.handNumber}`
        );
        ctx.players = ctx.players.filter((p) => p.status !== "REMOVED");
      } else {
        // Private games: Move REMOVED players to spectators
        Logger.info(
          `[HandComplete] Moving ${removedPlayers.length} removed player(s) to spectators game=${ctx.gameId} hand=${ctx.handNumber}`
        );

        for (const player of removedPlayers) {
          // Remove from players array
          ctx.players = ctx.players.filter((p) => p.id !== player.id);

          // Add to spectators (if not already there)
          if (!ctx.spectators || !Array.isArray(ctx.spectators)) {
            ctx.spectators = [];
          }
          if (!ctx.spectators.some((s) => s.userId === player.id)) {
            ctx.spectators.push({
              userId: player.id,
              username: player.username,
              joinedAt: new Date().toISOString(),
            });
          }

          events.push({
            type: EventType.PLAYER_MOVED_TO_SPECTATOR,
            payload: {
              playerId: player.id,
              playerName: player.username,
              seat: player.seat,
              reason: "Removed by host",
              gameId: ctx.gameId,
              shouldRemoveFromConnections: true, // Flag for GameManager cleanup
            },
          });
        }
      }
    }

    // 4. Reset player states for next hand
    ctx.players.forEach((player) => {
      player.holeCards = [];
      player.currentBet = 0;
      player.totalBet = 0;
      player.folded = false;
      player.allIn = false;
      player.eligibleToBet = true;
      player.revealedIndices = []; // Reset revealed indices for new hand
      // CRITICAL FIX: Reset action flags so players aren't skipped in next Preflop
      player.hasActed = false;
      player.lastAction = null;
    });

    // 5. Reset game state
    ctx.pots = [
      {
        amount: 0,
        eligiblePlayers: ctx.players.map((p) => p.id),
      },
    ];
    ctx.communityCards = [];
    ctx.deck = [];
    ctx.handHistory = [];
    ctx.showdownResults = null;
    ctx.currentActorSeat = null;
    ctx.firstActorSeat = null;
    ctx.actionDeadline = null;

    // 6. Check for Player Elimination and Game Over
    const activePlayers = ctx.players.filter((p) => p.chips > 0);
    const bustedPlayers = ctx.players.filter(
      (p) => p.chips === 0 && !p.isBot && !this._isPermanentlyLeft(p)
    );

    // Handle zero-chip players differently for private vs online games
    if (bustedPlayers.length > 0) {
      if (ctx.isPrivate) {
        // PRIVATE GAMES: Move to spectators
        Logger.info(
          `[HandComplete] ${bustedPlayers.length} player(s) moved to spectators (out of chips) game=${ctx.gameId} hand=${ctx.handNumber}`
        );

        for (const player of bustedPlayers) {
          // Remove from players array
          ctx.players = ctx.players.filter((p) => p.id !== player.id);

          // Add to spectators (if not already there)
          if (!ctx.spectators.some((s) => s.userId === player.id)) {
            ctx.spectators.push({
              userId: player.id,
              username: player.username,
              joinedAt: new Date().toISOString(),
            });
          }

          events.push({
            type: EventType.PLAYER_MOVED_TO_SPECTATOR,
            payload: {
              playerId: player.id,
              playerName: player.username,
              seat: player.seat,
              reason: "Out of chips",
              gameId: ctx.gameId,
            },
          });
        }
      } else {
        // ONLINE GAMES: Mark as eliminated (keep in players array)
        Logger.info(
          `[HandComplete] ${bustedPlayers.length} player(s) eliminated game=${ctx.gameId} hand=${ctx.handNumber}`
        );

        for (const player of bustedPlayers) {
          events.push({
            type: EventType.PLAYER_ELIMINATED,
            payload: {
              playerId: player.id,
              playerName: player.username,
              seat: player.seat,
              reason: "You ran out of chips",
              gameId: ctx.gameId,
            },
          });

          // Mark player as eliminated (status can be used for UI display)
          player.status = "ELIMINATED";
        }
      }
    }

    // FIX: Handle insufficient players
    // 0 players = end game (even for private games)
    // 1 player = wait for private games, end for public games
    if (activePlayers.length === 0) {
      // No players remaining - end game for both private and public
      ctx.status = "finished";
      ctx.message = "No players remaining";
      Logger.info(
        `[HandComplete] GAME OVER - No players remaining game=${ctx.gameId} hand=${ctx.handNumber}`
      );

      return {
        state: ctx,
        events, // Include elimination events
        effects: [
          {
            type: EffectType.GAME_END,
            winnerId: null,
            reason: "No players remaining",
          },
        ],
      };
    } else if (activePlayers.length === 1) {
      // 1 player remaining
      if (ctx.isPrivate) {
        // Private games transition to 'waiting' instead of finishing
        ctx.status = "waiting";
        ctx.message = "Waiting for more players";
        ctx.currentPhase = "waiting";
        // Clear any active hand state
        ctx.currentActorSeat = null;
        ctx.actionDeadline = null;
        ctx.communityCards = [];
        ctx.deck = [];
        ctx.handHistory = [];
        ctx.showdownResults = null;

        events.push({
          type: EventType.STATE_CHANGED,
          payload: {
            message: "Game waiting for more players",
            status: "waiting",
          },
        });

        Logger.info(
          `[HandComplete] Private game ${ctx.gameId} transitioning to waiting state due to insufficient players (1 player remaining)`
        );

        return {
          state: ctx,
          events, // Include elimination events and state change
          effects: [
            {
              type: EffectType.PERSIST,
            },
          ],
        };
      } else {
        // Public games finish normally with 1 player
        ctx.status = "finished";
        ctx.message = "One player remains";
        Logger.info(
          `[HandComplete] GAME OVER game=${ctx.gameId} hand=${ctx.handNumber} activePlayers=${activePlayers.length}`
        );

        return {
          state: ctx,
          events, // Include elimination events
          effects: [
            {
              type: EffectType.GAME_END,
              winnerId: activePlayers[0]?.id,
              reason: "One player remains",
            },
          ],
        };
      }
    }

    // 7. Game continues - immediately start next hand (Preflop)
    ctx.status = "active";
    ctx.message = null;
    Logger.debug(
      `[HandComplete] Game continuing. Scheduling next hand (Preflop). game=${ctx.gameId} hand=${ctx.handNumber} activePlayers=${activePlayers.length} bustedPlayers=${bustedPlayers.length}`
    );

    return {
      state: ctx,
      events, // Include elimination events if any
      effects: [
        {
          type: EffectType.SCHEDULE_TRANSITION,
          targetPhase: "preflop",
          delayMs: 0,
        },
      ],
    };
  }
}
