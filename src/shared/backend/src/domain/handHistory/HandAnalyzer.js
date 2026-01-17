/**
 * HandAnalyzer - Analyzes hand histories and calculates player statistics
 *
 * Takes a decoded hand history and calculates VPIP, PFR, 3bet, cbet, and showdown stats
 */

import { ActionType, indexToCard } from "./PokerCodec.js";
import { cardsToIsomorphic } from "./statsUtils.js";
import { PositionResolver } from "./PositionResolver.js";

/**
 * Analyzes a hand history and calculates stats for a specific player
 *
 * @param {Object} handHistory - Decoded hand history from PokerCodec.decode()
 * @param {string} playerId - Target player ID to analyze
 * @param {Object} playerManifest - Player manifest mapping seat indices to player IDs
 * @param {Object} config - Hand configuration (optional, for context)
 * @returns {Object|null} Stats object or null if player not found
 */
export class HandAnalyzer {
  /**
   * @param {Object} handHistory - Decoded hand history
   *   { board: number[], holeCards: number[][], actions: Object[], startingStacks: number[] }
   * @param {Object} playerManifest - Seat index -> Player ID mapping (e.g., { "0": "uuid-1", "1": "uuid-2" })
   * @param {number} [buttonSeat] - Button seat index (0-based manifest index). If not provided, position resolution will be skipped.
   * @param {number[]} [activeSeats] - Array of active seat indices. If not provided, will derive from manifest.
   */
  constructor(
    handHistory,
    playerManifest,
    buttonSeat = null,
    activeSeats = null
  ) {
    this.handHistory = handHistory;
    this.playerManifest = playerManifest;

    // Build reverse mapping: playerId -> manifest index
    this.playerIdToManifestIndex = {};
    for (const [seatIndex, playerId] of Object.entries(playerManifest)) {
      this.playerIdToManifestIndex[playerId] = parseInt(seatIndex, 10);
    }

    // Derive activeSeats from manifest if not provided
    this.activeSeats =
      activeSeats ||
      Object.keys(playerManifest)
        .map((s) => parseInt(s, 10))
        .sort((a, b) => a - b);

    // Store buttonSeat (may be null if not provided)
    this.buttonSeat = buttonSeat;

    // Resolve positions if buttonSeat is provided
    this.positionMap = null;
    if (this.buttonSeat !== null && this.buttonSeat !== undefined) {
      try {
        this.positionMap = PositionResolver.resolve(
          this.activeSeats,
          this.buttonSeat
        );
      } catch (error) {
        // If position resolution fails, log but don't throw (for backward compatibility)
        console.warn(
          `[HandAnalyzer] Failed to resolve positions: ${error.message}`
        );
        this.positionMap = null;
      }
    }
  }

  /**
   * Calculate stats for a specific player
   *
   * @param {string} playerId - Player ID to analyze
   * @returns {Object|null} Stats object or null if player not found
   */
  analyzePlayer(playerId) {
    const manifestIndex = this.playerIdToManifestIndex[playerId];
    if (manifestIndex === undefined) {
      return null; // Player not in this hand
    }

    // Get player's hole cards
    if (
      !this.handHistory.holeCards ||
      !Array.isArray(this.handHistory.holeCards)
    ) {
      return null; // Invalid hole cards structure
    }

    const holeCardIndices = this.handHistory.holeCards[manifestIndex] || [];
    if (holeCardIndices.length < 2) {
      return null; // Invalid hole cards
    }

    // Convert hole cards to isomorphic format
    const card1 = indexToCard(holeCardIndices[0]);
    const card2 = indexToCard(holeCardIndices[1]);
    const holeCards = cardsToIsomorphic(card1, card2);

    // Initialize stats
    const stats = {
      hole_cards: holeCards,
      is_vpip: false,
      is_pfr: false,
      did_3bet: false,
      can_3bet: false,
      did_cbet: false,
      can_cbet: false,
      saw_flop: false,
      went_to_showdown: false,
      won_hand: false,
      net_chips: 0,
      seat_position: this.positionMap
        ? this.positionMap[manifestIndex] || null
        : null,
    };

    // Track preflop state
    let isPreflop = true;
    let currentStreet = "preflop";
    let preflopRaiseCount = 0; // Track number of raises preflop
    let playerFacedRaise = false; // Did player face a raise before acting?
    let playerRaised = false; // Did player raise preflop?
    let lastPreflopAggressor = null; // Who was the last preflop aggressor (raiser)?
    let playerWasLastAggressor = false; // Was player the last preflop aggressor?

    // Track flop state
    let flopFirstActor = null; // First player to act on flop
    let playerActedOnFlop = false;

    // Track showdown
    let playerReachedShowdown = false;
    let playerFolded = false; // Track if player folded at any point
    let playerWon = false;
    let playerWinAmount = 0;
    let playerTotalInvested = 0;

    // Process actions
    for (const action of this.handHistory.actions) {
      // Check for street transitions
      if (action.type === ActionType.NEXT_STREET) {
        if (action.street === "flop") {
          isPreflop = false;
          currentStreet = "flop";
          stats.saw_flop = true;
        } else if (action.street === "turn") {
          currentStreet = "turn";
        } else if (action.street === "river") {
          currentStreet = "river";
        } else if (action.street === "showdown") {
          currentStreet = "showdown";
          // Player went to showdown if they reached this point without folding
          if (!playerFolded) {
            playerReachedShowdown = true;
          }
        }
        continue;
      }

      const actionPlayerId = this.getPlayerIdFromManifestIndex(
        action.seatIndex
      );
      const isPlayerAction = actionPlayerId === playerId;

      // Track player's total investment
      if (isPlayerAction) {
        if (
          action.type === ActionType.CALL ||
          action.type === ActionType.BET_OR_RAISE
        ) {
          playerTotalInvested += action.amount || 0;
        } else if (
          action.type === ActionType.POST_SMALL_BLIND ||
          action.type === ActionType.POST_BIG_BLIND
        ) {
          playerTotalInvested += action.amount || 0;
        }
      }

      // PREFLOP STATS
      if (isPreflop) {
        // Track raises preflop
        if (action.type === ActionType.BET_OR_RAISE) {
          preflopRaiseCount++;

          // If this is a raise and player hasn't acted yet, they face a raise
          if (!playerRaised && actionPlayerId !== playerId) {
            playerFacedRaise = true;
          }

          // Track last aggressor
          lastPreflopAggressor = actionPlayerId;
          playerWasLastAggressor = actionPlayerId === playerId;
        }

        // Player actions
        if (isPlayerAction) {
          // VPIP: Player voluntarily put money in pot (call or raise, excluding blinds)
          if (
            action.type === ActionType.CALL ||
            action.type === ActionType.BET_OR_RAISE
          ) {
            stats.is_vpip = true;
          }

          // PFR: Player raised preflop
          if (action.type === ActionType.BET_OR_RAISE) {
            stats.is_pfr = true;
            playerRaised = true;
          }

          // 3bet opportunity: Player faced a raise (2-bet) before acting
          if (playerFacedRaise && preflopRaiseCount >= 1) {
            stats.can_3bet = true;

            // Did 3bet: Player re-raised after facing a raise
            if (action.type === ActionType.BET_OR_RAISE) {
              stats.did_3bet = true;
            }
          }

          // Track if player folded preflop
          if (action.type === ActionType.FOLD) {
            playerFolded = true;
            // Player folded, no further preflop stats
            break;
          }
        }
      }

      // Track folds on all streets (not just preflop)
      if (isPlayerAction && action.type === ActionType.FOLD) {
        playerFolded = true;
      }

      // FLOP STATS (cbet)
      if (currentStreet === "flop") {
        // Track first actor on flop
        if (flopFirstActor === null && action.type !== ActionType.NEXT_STREET) {
          flopFirstActor = actionPlayerId;
        }

        // Cbet opportunity: Player was last preflop aggressor AND first to act on flop
        if (playerWasLastAggressor && flopFirstActor === playerId) {
          stats.can_cbet = true;
        }

        if (isPlayerAction) {
          playerActedOnFlop = true;

          // Did cbet: Player bet on flop when they had the opportunity
          if (stats.can_cbet && action.type === ActionType.BET_OR_RAISE) {
            stats.did_cbet = true;
          }
        }
      }

      // SHOWDOWN STATS
      // Note: We already set playerReachedShowdown when NEXT_STREET transitions to showdown
      // This check serves as a backup indicator if SHOW_CARDS action is present
      if (currentStreet === "showdown") {
        if (isPlayerAction && action.type === ActionType.SHOW_CARDS) {
          playerReachedShowdown = true;
        }
      }

      // WIN STATS
      if (action.type === ActionType.WIN_POT && isPlayerAction) {
        playerWon = true;
        playerWinAmount += action.amount || 0;
      }
    }

    // Set final stats
    stats.went_to_showdown = playerReachedShowdown;
    stats.won_hand = playerWon;
    stats.net_chips = playerWinAmount - playerTotalInvested;

    return stats;
  }

  /**
   * Get player ID from manifest index
   * @param {number} manifestIndex - Manifest index (0-based)
   * @returns {string|null} Player ID or null if not found
   */
  getPlayerIdFromManifestIndex(manifestIndex) {
    const seatIndexStr = String(manifestIndex);
    return this.playerManifest[seatIndexStr] || null;
  }
}
