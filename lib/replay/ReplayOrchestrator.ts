/**
 * ReplayOrchestrator
 *
 * A bridge between binary hand history (from PokerCodec) and the TexasHoldemEngine.
 * Translates historical data into engine-compatible formats and produces a timeline
 * of GameState snapshots for replay visualization.
 */

import { TexasHoldemEngine } from "@backend/game/engine/TexasHoldemEngine";
import {
  PokerCodec,
  ActionType,
  indexToCard,
} from "@backend/game/handHistory/PokerCodec";
import type { GameState } from "@/lib/types/poker";
import type {
  GameResult,
  TransitionOverrides,
  EngineContext,
  EngineCard,
} from "@/lib/types/engine";

/**
 * Input data structure for replay generation
 */
export interface ReplayInput {
  gameId: string;
  variant: "six_max" | "heads_up" | "full_ring";
  manifest: Record<string, string>; // Seat -> UserUUID
  startingStacks: number[]; // Array in manifest order
  actions: Array<{
    seatIndex: number; // Manifest index (0-based)
    type: number; // ActionType enum value
    amount?: number;
    cards?: number[];
    potIndex?: number;
    deltaTime?: number;
    street?: string; // For NEXT_STREET actions
  }>;
  board: number[]; // Card indices 0-51
  holeCards: number[][]; // Array of arrays in manifest order
}

/**
 * A single frame in the replay timeline
 */
export interface ReplayFrame {
  actionIndex: number; // Correlates to the index in the original Codec action list
  state: GameState; // The full engine state object at this moment
  timestamp: number; // Server timestamp if available, or generated
}

/**
 * Result of replay generation
 */
export interface ReplayResult {
  frames: ReplayFrame[];
  error?: string; // Error message if replay stopped early
  stoppedAtActionIndex?: number; // Index where replay stopped (if error)
}

/**
 * Card object format expected by the engine
 * Using EngineCard type from @/lib/types/engine
 */

/**
 * Rank to value mapping
 */
const RANK_VALUES: Record<string, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

/**
 * Suit character to full name mapping
 */
const SUIT_MAP: Record<string, "hearts" | "diamonds" | "clubs" | "spades"> = {
  h: "hearts",
  d: "diamonds",
  c: "clubs",
  s: "spades",
};

export class ReplayOrchestrator {
  private engine: TexasHoldemEngine;
  private history: ReplayInput; // Store original history data
  private manifestToSeat: Map<number, number>; // Manifest index -> Physical seat
  private seatToPlayerId: Map<number, string>; // Physical seat -> Player UUID
  private sortedSeats: number[]; // Sorted seat numbers for manifest order

  /**
   * Constructor
   * @param history - Decoded hand history data
   */
  constructor(history: ReplayInput) {
    // Store history for later use
    this.history = history;
    // Initialize engine
    this.engine = new TexasHoldemEngine(history.gameId, history.variant);

    // RIGID SEAT COMPACTION: Map manifest indices strictly to Engine Seats 1..N (no gaps)
    // Parse manifest keys to integers and sort numerically
    const manifestSeatKeys = Object.keys(history.manifest)
      .map((k) => parseInt(k, 10))
      .sort((a, b) => a - b);

    // Map sorted manifest indices strictly to Engine Seats 1..N (compacted)
    // This ensures no gaps and proper geometry for heads-up logic
    const engineSeatKeys = manifestSeatKeys.map((_, index) => index + 1);

    this.sortedSeats = engineSeatKeys;
    this.manifestToSeat = new Map();
    this.seatToPlayerId = new Map();

    // Map manifest index -> engine seat (1..N, compacted)
    manifestSeatKeys.forEach((manifestSeat, manifestIndex) => {
      const engineSeat = engineSeatKeys[manifestIndex]; // Always index + 1
      this.manifestToSeat.set(manifestIndex, engineSeat);
      this.seatToPlayerId.set(
        engineSeat,
        history.manifest[String(manifestSeat)]
      );
    });

    // Create player objects with starting stacks
    // Critical: Set chips BEFORE blinds are posted (engine will deduct blinds in _enterPreflop)
    const players = manifestSeatKeys.map((manifestSeat, manifestIndex) => {
      const startingStack = history.startingStacks[manifestIndex];
      if (startingStack === undefined) {
        throw new Error(
          `Missing starting stack for manifest index ${manifestIndex} (manifest seat ${manifestSeat})`
        );
      }

      const engineSeat = engineSeatKeys[manifestIndex]; // Always index + 1 (compacted)
      return {
        id: history.manifest[String(manifestSeat)],
        name: `Player ${engineSeat}`,
        seat: engineSeat, // Compacted seat 1..N
        chips: startingStack, // Set BEFORE blinds (engine will deduct in _enterPreflop)
        isBot: false, // Replay players are not bots
        isOffline: false, // Ensure players are online
      };
    });

    // Add players to engine
    this.engine.addPlayers(players);

    // Force all players to ACTIVE status and ensure they are dealt into the hand
    const ctx = this.engine.context as unknown as EngineContext;
    if (ctx.players) {
      ctx.players.forEach((p) => {
        p.status = "ACTIVE";
        p.isOffline = false;
        p.left = false;
        p.leaving = false;
      });
    }
  }

  /**
   * Main replay generation loop
   * @returns Timeline of GameState snapshots
   */
  generateReplay(): ReplayResult {
    const frames: ReplayFrame[] = [];
    let currentTimestamp = Date.now();

    try {
      // Get history once for the entire function
      const history = this.getHistory();

      // Log raw decoded action log for debugging
      console.log("[ReplayOrchestrator] ===== RAW DECODED ACTION LOG =====");
      console.log(
        `[ReplayOrchestrator] Total actions: ${history.actions.length}`
      );
      console.log(`[ReplayOrchestrator] Variant: ${history.variant}`);
      console.log(`[ReplayOrchestrator] Game ID: ${history.gameId}`);
      console.log(`[ReplayOrchestrator] Manifest:`, history.manifest);
      console.log(
        `[ReplayOrchestrator] Starting stacks:`,
        history.startingStacks
      );
      console.log(`[ReplayOrchestrator] Board cards (indices):`, history.board);
      console.log(
        `[ReplayOrchestrator] Hole cards (indices per player):`,
        history.holeCards
      );
      console.log(`[ReplayOrchestrator] Action sequence:`);
      history.actions.forEach((action, idx) => {
        const actionTypeName =
          Object.keys(ActionType).find(
            (key) => ActionType[key as keyof typeof ActionType] === action.type
          ) || `UNKNOWN(${action.type})`;
        const seat = this.getSeatFromManifestIndex(action.seatIndex);
        console.log(
          `  [${idx}] ${actionTypeName} | seatIndex: ${
            action.seatIndex
          } → engineSeat: ${seat} | amount: ${
            action.amount ?? "N/A"
          } | street: ${action.street ?? "N/A"}`
        );
      });
      console.log("[ReplayOrchestrator] ====================================");

      // 1. Capture initial state (before preflop)
      frames.push({
        actionIndex: -1, // Before any actions
        state: this.captureState(),
        timestamp: currentTimestamp,
      });

      // 2. Prepare hole cards for preflop transition
      // Convert from manifest order to seat-keyed object
      const holeCardsOverride: Record<number, EngineCard[]> = {};

      history.holeCards.forEach((cardIndices, manifestIndex) => {
        const seat = this.getSeatFromManifestIndex(manifestIndex);
        if (seat === null) {
          throw new Error(`Invalid manifest index: ${manifestIndex}`);
        }

        holeCardsOverride[seat] = cardIndices.map((idx) =>
          this.indexToCardObject(idx)
        );
      });

      // 3. Execute preflop transition with hole card overrides
      const preflopResult = this.engine.executeTransition("preflop", {
        holeCards: holeCardsOverride,
      } as unknown as null) as unknown as GameResult;

      if (!preflopResult.success) {
        throw new Error("Failed to execute preflop transition");
      }

      // Capture state after preflop (blinds posted, cards dealt)
      frames.push({
        actionIndex: -1, // Still before action loop
        state: this.captureState(),
        timestamp: (currentTimestamp += 100),
      });

      // 4. Process actions
      for (
        let actionIndex = 0;
        actionIndex < history.actions.length;
        actionIndex++
      ) {
        const action = history.actions[actionIndex];

        // Skip blind and ante actions (handled by engine automatically)
        if (
          action.type === ActionType.POST_SMALL_BLIND ||
          action.type === ActionType.POST_BIG_BLIND ||
          action.type === ActionType.POST_ANTE
        ) {
          continue;
        }

        // Skip WIN_POT actions (these are events, not player actions)
        if (action.type === ActionType.WIN_POT) {
          continue;
        }

        // Handle street transitions
        if (action.type === ActionType.NEXT_STREET) {
          const streetName = this.mapStreetName(action.street);
          if (!streetName) {
            throw new Error(`Invalid street name: ${action.street}`);
          }

          const transitionResult = this.handleStreetTransition(streetName);
          if (!transitionResult.success) {
            throw new Error(
              `Failed to execute ${streetName} transition: ${JSON.stringify(
                transitionResult
              )}`
            );
          }

          // Capture state after street transition
          frames.push({
            actionIndex,
            state: this.captureState(),
            timestamp: (currentTimestamp += 100),
          });
          continue;
        }

        // Handle player actions
        const seat = this.getSeatFromManifestIndex(action.seatIndex);
        if (seat === null) {
          throw new Error(
            `Invalid seat index in action ${actionIndex}: ${action.seatIndex}`
          );
        }

        // Get engine state before processing action
        const ctxBefore = this.engine.context as unknown as EngineContext;
        const currentActorSeat = ctxBefore.currentActorSeat;

        // If currentActorSeat is null, it means the previous round completed
        // Skip any non-NEXT_STREET actions until we find the NEXT_STREET action
        if (currentActorSeat === null) {
          if (action.type === ActionType.NEXT_STREET) {
            // NEXT_STREET is already handled above, so continue
            continue;
          } else {
            // Round completed but this isn't NEXT_STREET - skip it (likely a duplicate/extra action in history)
            continue;
          }
        }

        // VALIDATE: currentActorSeat must match the action's seat
        if (currentActorSeat !== seat) {
          console.error(
            `[ReplayOrchestrator] Desync at action ${actionIndex}:`,
            {
              engineState: {
                currentActorSeat,
                phase: ctxBefore.currentPhase,
              },
              historyAction: {
                seatIndex: action.seatIndex,
                mappedSeat: seat,
                type: action.type,
              },
            }
          );
          throw new Error(
            `Desync detected at action ${actionIndex}: Engine expects seat ${currentActorSeat} to act, but history says seat ${seat} (manifest index ${action.seatIndex}) acted.`
          );
        }

        const engineActionType = this.codecActionTypeToEngine(action.type);
        if (!engineActionType) {
          throw new Error(
            `Unknown action type ${action.type} at action index ${actionIndex}`
          );
        }

        const engineAction: any = {
          seat: seat,
          type: engineActionType,
        };

        // Add amount for monetary actions
        if (action.amount !== undefined) {
          engineAction.amount = action.amount;
        }

        // Process action through engine
        const actionResult = this.engine.processAction(
          engineAction
        ) as unknown as GameResult;

        // Get engine state after processing action
        const ctxAfter = this.engine.context as unknown as EngineContext;

        // CRITICAL: Ignore returned 'effects'. Do NOT execute SCHEDULE_TRANSITION.
        // The engine may emit SCHEDULE_TRANSITION effects when rounds complete, but we drive
        // all transitions strictly from the historical log (NEXT_STREET actions).
        // Executing engine-scheduled transitions would cause desync (random cards vs. historical cards).

        if (!actionResult.success) {
          // Graceful failure: return timeline up to this point
          console.error(`[ReplayOrchestrator] Action ${actionIndex} failed:`, {
            action,
            engineAction,
            engineStateBefore: {
              currentActorSeat: currentActorSeat,
              phase: ctxBefore.currentPhase,
            },
            engineStateAfter: {
              currentActorSeat: ctxAfter.currentActorSeat,
              phase: ctxAfter.currentPhase,
            },
            errorEvents: actionResult.events,
          });
          return {
            frames,
            error: `Engine rejected action at index ${actionIndex}: ${JSON.stringify(
              actionResult.events
            )}`,
            stoppedAtActionIndex: actionIndex,
          };
        }

        // Capture state after action
        frames.push({
          actionIndex,
          state: this.captureState(),
          timestamp: (currentTimestamp += 100),
        });
      }

      return { frames };
    } catch (error: any) {
      return {
        frames,
        error: error.message || "Unknown error during replay generation",
        stoppedAtActionIndex:
          frames.length > 0 ? frames[frames.length - 1].actionIndex : -1,
      };
    }
  }

  /**
   * Handle street transition (flop, turn, river)
   * @param streetName - Street name ("flop", "turn", "river")
   */
  private handleStreetTransition(streetName: "flop" | "turn" | "river"): {
    success: boolean;
  } {
    const history = this.getHistory();
    const boardIndices = this.getBoardIndicesForStreet(
      streetName,
      history.board
    );

    // Convert indices to card objects
    const communityCards = boardIndices.map((idx) =>
      this.indexToCardObject(idx)
    );

    // Execute transition with community card overrides
    const result = this.engine.executeTransition(streetName, {
      communityCards: communityCards,
    } as unknown as null) as unknown as GameResult;

    return { success: result.success };
  }

  /**
   * Get board card indices for a specific street
   * @param street - Street name
   * @param board - Full board array from codec
   * @returns Array of card indices for this street
   */
  private getBoardIndicesForStreet(
    street: "flop" | "turn" | "river",
    board: number[]
  ): number[] {
    switch (street) {
      case "flop":
        // Flop: indices 0, 1, 2 (3 cards)
        return board.slice(0, 3);
      case "turn":
        // Turn: index 3 (1 card)
        return board.slice(3, 4);
      case "river":
        // River: index 4 (1 card)
        return board.slice(4, 5);
      default:
        throw new Error(`Unknown street: ${street}`);
    }
  }

  /**
   * Convert codec card index to engine card object
   * @param index - Card index (0-51)
   * @returns Engine card object
   */
  private indexToCardObject(index: number): EngineCard {
    // Use codec's indexToCard to get string representation
    const cardString = indexToCard(index);
    // cardString format: "Ah", "Kd", "Tc", etc.

    const rankChar = cardString[0];
    const suitChar = cardString[1].toLowerCase();

    const suit = SUIT_MAP[suitChar];
    if (!suit) {
      throw new Error(`Invalid suit character: ${suitChar}`);
    }

    const rank = rankChar as EngineCard["rank"];
    const value = RANK_VALUES[rank];
    if (value === undefined) {
      throw new Error(`Invalid rank character: ${rankChar}`);
    }

    return {
      suit,
      rank,
      value,
      display: cardString,
    };
  }

  /**
   * Capture current game state
   * @returns Full game state (God Mode - all cards visible)
   * Returns a clean, immutable snapshot of the engine's internal state
   */
  private captureState(): GameState {
    // Access engine context directly for "God Mode" visibility
    // This gives us the raw state with all hole cards visible
    const ctx = this.engine.context as unknown as EngineContext;

    // Return JSON.parse(JSON.stringify(...)) to ensure a clean, immutable snapshot
    // Convert engine context to GameState format
    const state: GameState = {
      gameId: ctx.gameId || "",
      status: (ctx.status || "active") as GameState["status"],
      phase: (ctx.currentPhase || "preflop") as GameState["phase"],
      players: ctx.players.map((p) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        chips: p.chips,
        currentBet: p.currentBet,
        totalBet: p.totalBet,
        holeCards: p.holeCards.map((c) =>
          typeof c === "string" ? c : c.display || `${c.rank}${c.suit[0]}`
        ),
        folded: p.folded,
        allIn: p.allIn,
        isBot: p.isBot,
        leaving: p.leaving,
        left: p.left,
        revealedIndices: p.revealedIndices || [],
      })),
      communityCards: ctx.communityCards.map((c) =>
        typeof c === "string" ? c : c.display || `${c.rank}${c.suit[0]}`
      ),
      pot: ctx.pots?.[0]?.amount || 0,
      sidePots: ctx.pots?.slice(1).map((pot) => ({
        amount: pot.amount,
        eligibleSeats:
          pot.eligiblePlayers
            ?.map((pid) => {
              const player = ctx.players.find((p) => p.id === pid);
              return player?.seat;
            })
            .filter((s): s is number => s !== undefined) || [],
      })),
      pots: ctx.pots?.map((pot) => ({
        amount: pot.amount,
        contributors: pot.eligiblePlayers || [],
      })),
      currentActorSeat: ctx.currentActorSeat || null,
      buttonSeat: ctx.buttonSeat || 0,
      dealerSeat: ctx.buttonSeat || 0,
      sbSeat: ctx.sbSeat || 0,
      bbSeat: ctx.bbSeat || 0,
      actionDeadline: ctx.actionDeadline
        ? new Date(ctx.actionDeadline).getTime()
        : null,
      minRaise: ctx.minRaise || ctx.bigBlind || 0,
      lastRaiseAmount: ctx.lastRaiseAmount || undefined,
      betsThisRound: ctx.players.map((p) => p.currentBet),
      currentRound: (ctx.currentPhase ||
        "preflop") as GameState["currentRound"],
      handNumber: ctx.handNumber || 1,
      bigBlind: ctx.bigBlind,
      smallBlind: ctx.smallBlind,
      config: ctx.config
        ? {
            maxPlayers: ctx.config.maxPlayers,
            smallBlind: ctx.config.smallBlind,
            bigBlind: ctx.config.bigBlind,
            turnTimer: ctx.config.actionTimeoutMs,
          }
        : undefined,
      currentPhase: ctx.currentPhase,
    };

    return state;
  }

  /**
   * Get seat number from manifest index
   * @param manifestIndex - Manifest index (0-based)
   * @returns Physical seat number or null if invalid
   */
  private getSeatFromManifestIndex(manifestIndex: number): number | null {
    const seat = this.manifestToSeat.get(manifestIndex);
    return seat !== undefined ? seat : null;
  }

  /**
   * Convert codec action type to engine action type string
   * @param actionType - Codec ActionType enum value
   * @returns Engine action type string or null if unknown
   */
  private codecActionTypeToEngine(
    actionType: number
  ): "fold" | "check" | "call" | "bet" | "allin" | "reveal" | null {
    switch (actionType) {
      case ActionType.FOLD:
        return "fold";
      case ActionType.CHECK:
        return "check";
      case ActionType.CALL:
        return "call";
      case ActionType.BET_OR_RAISE:
        return "bet"; // Engine handles bet/raise distinction internally
      case ActionType.WIN_POT:
        // WIN_POT is not a player action, skip it
        return null;
      case ActionType.SHOW_CARDS:
        return "reveal";
      case ActionType.POST_SMALL_BLIND:
      case ActionType.POST_BIG_BLIND:
      case ActionType.POST_ANTE:
        // These are handled by engine automatically, return null to skip
        return null;
      case ActionType.NEXT_STREET:
        // Handled separately, return null
        return null;
      default:
        return null;
    }
  }

  /**
   * Map codec street name to engine street name
   * @param street - Street name from codec (may be uppercase)
   * @returns Engine street name or null if invalid
   */
  private mapStreetName(street?: string): "flop" | "turn" | "river" | null {
    if (!street) return null;

    const normalized = street.toLowerCase();
    switch (normalized) {
      case "flop":
        return "flop";
      case "turn":
        return "turn";
      case "river":
        return "river";
      default:
        return null;
    }
  }

  /**
   * Get history data (stored during construction)
   * @returns Original history input data
   */
  private getHistory(): ReplayInput {
    return this.history;
  }
}
