/**
 * ReplayOrchestrator
 *
 * Engine-Driven architecture: Transitions are triggered solely by engine effects,
 * ensuring perfect synchronization. WIN_POT and NEXT_STREET tags are skipped.
 * SHOW_CARDS is mapped to engine reveal actions.
 */

import { TexasHoldemEngine } from "@backend/domain/game/engine/TexasHoldemEngine";
import {
  PokerCodec,
  ActionType,
  indexToCard,
} from "@backend/domain/handHistory/PokerCodec";
import type { GameState } from "@/lib/types/poker";
import type { GameResult, EngineContext, EngineCard, Effect, TransitionOverrides, EngineAction } from "@/lib/types/engine";
import { getErrorMessage } from "@/lib/utils";

export interface ReplayInput {
  gameId: string;
  variant: "six_max" | "heads_up" | "full_ring";
  manifest: Record<string, string>;
  startingStacks: number[];
  actions: Array<{
    seatIndex: number;
    type: number;
    amount?: number;
    cards?: number[];
    potIndex?: number;
    deltaTime?: number;
    street?: string;
  }>;
  board: number[];
  holeCards: number[][];
  config?: {
    maxPlayers?: number;
    blinds?: { small: number; big: number };
    buyIn?: number;
    variantSlug?: string;
  };
}

export interface ReplayFrame {
  actionIndex: number;
  state: GameState;
  timestamp: number;
}

export interface ReplayResult {
  frames: ReplayFrame[];
  error?: string;
  stoppedAtActionIndex?: number;
}

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

const SUIT_MAP: Record<string, "hearts" | "diamonds" | "clubs" | "spades"> = {
  h: "hearts",
  d: "diamonds",
  c: "clubs",
  s: "spades",
};

/** JSON-serialized player data from engine context */
interface RawPlayer {
  id?: string;
  name?: string;
  seat?: number;
  chips?: number;
  currentBet?: number;
  totalBet?: number;
  holeCards?: Array<string | { display?: string }>;
  folded?: boolean;
  allIn?: boolean;
  isBot?: boolean;
  left?: boolean;
  revealedIndices?: number[];
}

/** JSON-serialized pot data */
interface RawPot {
  amount: number;
  contributors?: string[];
  eligiblePlayers?: string[];
}

/**
 * Helper function to create engine config from variant string
 */
function createConfigFromVariant(
  variant: "six_max" | "heads_up" | "full_ring",
  providedConfig?: ReplayInput["config"]
): {
  maxPlayers: number;
  blinds: { small: number; big: number };
  buyIn: number;
  variantSlug: string;
  actionTimeoutMs: number;
} {
  // Use provided config if available, otherwise use defaults based on variant
  if (providedConfig) {
    return {
      maxPlayers:
        providedConfig.maxPlayers ||
        (variant === "heads_up" ? 2 : variant === "six_max" ? 6 : 9),
      blinds: providedConfig.blinds || { small: 1, big: 2 },
      buyIn: providedConfig.buyIn || 0,
      variantSlug: providedConfig.variantSlug || variant,
      actionTimeoutMs: 30000, // Default 30 seconds for replays
    };
  }

  // Default configs based on variant
  const variantConfigs = {
    heads_up: { maxPlayers: 2, blinds: { small: 1, big: 2 }, buyIn: 0 },
    six_max: { maxPlayers: 6, blinds: { small: 1, big: 2 }, buyIn: 0 },
    full_ring: { maxPlayers: 9, blinds: { small: 1, big: 2 }, buyIn: 0 },
  };

  const config = variantConfigs[variant] || variantConfigs.six_max;
  return {
    ...config,
    variantSlug: variant,
    actionTimeoutMs: 30000, // Default 30 seconds for replays
  };
}

export class ReplayOrchestrator {
  private engine: TexasHoldemEngine;
  private history: ReplayInput;
  private manifestToSeat: Map<number, number>;
  private seatToPlayerId: Map<number, string>;
  private currentUserId?: string;

  constructor(
    history: ReplayInput,
    playerNames?: Record<string, string>,
    currentUserId?: string
  ) {
    this.history = history;
    this.currentUserId = currentUserId;

    // Create config object from variant string or use provided config
    const engineConfig = createConfigFromVariant(
      history.variant,
      history.config
    );
    this.engine = new TexasHoldemEngine(history.gameId, engineConfig);

    // 1. Rigid Seat Mapping
    const manifestSeatKeys = Object.keys(history.manifest)
      .map((k) => parseInt(k, 10))
      .sort((a, b) => a - b);

    const engineSeatKeys = manifestSeatKeys.map((_, index) => index + 1);
    this.manifestToSeat = new Map();
    this.seatToPlayerId = new Map();

    manifestSeatKeys.forEach((manifestSeat, manifestIndex) => {
      const engineSeat = engineSeatKeys[manifestIndex];
      this.manifestToSeat.set(manifestIndex, engineSeat);
      this.seatToPlayerId.set(
        engineSeat,
        history.manifest[String(manifestSeat)]
      );
    });

    // 2. Initialize Players
    const players = manifestSeatKeys.map((manifestSeat, manifestIndex) => {
      const startingStack = history.startingStacks[manifestIndex];
      if (startingStack === undefined) throw new Error("Missing stack");

      const engineSeat = engineSeatKeys[manifestIndex];
      const playerId = history.manifest[String(manifestSeat)];

      // CLEANUP: Unconditionally try to use the injected map.
      // If the map is missing the ID, we fall back to a generic ID string.
      // We do NOT rely on the engine or previous state.
      const displayName = playerNames?.[playerId] || `Player ${engineSeat}`;

      return {
        id: playerId,
        name: displayName,
        seat: engineSeat,
        chips: startingStack,
        isBot: false,
        isOffline: false,
      };
    });

    this.engine.addPlayers(players);

    // 3. Force Active Status
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

  public generateReplay(): ReplayResult {
    const frames: ReplayFrame[] = [];
    let currentTimestamp = Date.now();
    let actionIndex = 0;

    try {
      // --- Frame -1: Initial State ---
      frames.push({
        actionIndex: -1,
        state: this.captureState(),
        timestamp: currentTimestamp,
      });

      // --- FIX: Synchronize Button Position ---
      // The engine defaults buttonSeat to 1. We must set it based on who actually
      // posted the Small Blind in the history to ensure 'First Actor' logic matches.
      const sbAction = this.history.actions.find(
        (a) => a.type === ActionType.POST_SMALL_BLIND
      );
      if (sbAction) {
        const sbSeat = this.manifestToSeat.get(sbAction.seatIndex);
        if (sbSeat) {
          const ctx = this.engine.context as unknown as EngineContext;
          const numPlayers = ctx.players.length;

          if (this.history.variant === "heads_up") {
            // In Heads-Up, the Small Blind IS the Button
            ctx.buttonSeat = sbSeat;
          } else {
            // In Ring Games, SB is to the left of Button.
            // Since seats are compacted 1..N, Button is SB - 1 (wrapping N)
            ctx.buttonSeat = sbSeat === 1 ? numPlayers : sbSeat - 1;
          }
        }
      }

      // --- Preflop Execution ---
      const holeCardsOverride: Record<number, EngineCard[]> = {};
      this.history.holeCards.forEach((cardIndices, manifestIndex) => {
        const seat = this.manifestToSeat.get(manifestIndex);
        if (seat) {
          holeCardsOverride[seat] = cardIndices.map((idx) =>
            this.indexToCardObject(idx)
          );
        }
      });

      const preflopRes = this.engine.executeTransition("preflop", {
        holeCards: holeCardsOverride,
      } as unknown as null) as unknown as GameResult;

      if (!preflopRes.success) throw new Error("Preflop transition failed");

      frames.push({
        actionIndex: -1,
        state: this.captureState(),
        timestamp: (currentTimestamp += 100),
      });

      // --- Main Action Loop ---
      const actions = this.history.actions;
      for (; actionIndex < actions.length; actionIndex++) {
        const action = actions[actionIndex];

        // SKIP: Engine-handled automatic actions
        if (
          [
            ActionType.POST_SMALL_BLIND,
            ActionType.POST_BIG_BLIND,
            ActionType.POST_ANTE,
            ActionType.WIN_POT, // Engine calculates winners automatically
            ActionType.NEXT_STREET, // Engine calculates transitions automatically
          ].includes(action.type)
        ) {
          continue;
        }

        const seat = this.manifestToSeat.get(action.seatIndex);
        if (!seat) throw new Error(`Invalid seat index: ${action.seatIndex}`);

        const engineActionType = this.codecActionTypeToEngine(action.type);
        if (!engineActionType) continue;

        // VALIDATE: Check engine state before processing
        const ctxBefore = this.engine.context as unknown as EngineContext;
        const currentActorSeat = ctxBefore.currentActorSeat;
        const gameStatus = ctxBefore.status;

        // FIX: Skip actions if game is finished or complete
        // The engine will reject these actions anyway
        if (gameStatus === "finished" || gameStatus === "complete") {
          // Break out of loop when game is complete to avoid extra frames
          break;
        }

        // FIX: Allow transitions and reveals even when currentActorSeat is null (all-in runouts)
        // Only skip betting actions when currentActorSeat is null
        if (currentActorSeat === null) {
          // For all-in runouts, we need to process reveal actions and transitions
          // but skip betting actions
          if (
            engineActionType === "fold" ||
            engineActionType === "check" ||
            engineActionType === "call" ||
            engineActionType === "bet"
          ) {
            continue;
          }
          // Allow reveal actions to proceed (for showdown)
        }

        // Validate that the action's seat matches the current actor (only for betting actions)
        if (
          currentActorSeat !== null &&
          currentActorSeat !== seat &&
          (engineActionType === "fold" ||
            engineActionType === "check" ||
            engineActionType === "call" ||
            engineActionType === "bet")
        ) {
          console.error(
            `[ReplayOrchestrator] Seat mismatch at action ${actionIndex}:`,
            {
              expectedSeat: currentActorSeat,
              actionSeat: seat,
              actionType: engineActionType,
              phase: ctxBefore.currentPhase,
              actionIndex,
            }
          );
          throw new Error(
            `Desync: Engine expects seat ${currentActorSeat} to act, but history says seat ${seat} (manifest index ${action.seatIndex}) acted at action index ${actionIndex}`
          );
        }

        // SETUP: Reveal Index (if applicable)
        let revealIndex: number | undefined;
        if (engineActionType === "reveal") {
          if (action.cards && action.cards.length > 0) {
            const cardVal = action.cards[0];
            const playerHoleCards =
              this.history.holeCards[action.seatIndex] || [];
            revealIndex = playerHoleCards.indexOf(cardVal);
            if (revealIndex === -1) revealIndex = 0; // Fallback
          } else {
            revealIndex = 0;
          }
        }

        // EXECUTE: Player Action
        const engineAction = {
          seat,
          type: engineActionType,
          amount: action.amount,
          index: revealIndex,
        } as Parameters<typeof this.engine.processAction>[0];

        const result = this.engine.processAction(
          engineAction
        ) as unknown as GameResult;

        if (!result.success) {
          // Log helpful error info
          const ctx = this.engine.context as unknown as EngineContext;
          console.error(`[Replay] Action failed at index ${actionIndex}:`, {
            type: engineActionType,
            seat,
            currentActor: ctx.currentActorSeat,
            phase: ctx.currentPhase,
          });
          const errEvent = result.events.find((e) => e.type === "ERROR");
          const errorPayload = errEvent?.payload as { message?: string } | undefined;
          throw new Error(
            errorPayload?.message || "Engine rejected action"
          );
        }

        // CAPTURE: State after action
        frames.push({
          actionIndex,
          state: this.captureState(),
          timestamp: (currentTimestamp += 100),
        });

        // EXECUTE: Auto-Transitions (Engine-Driven)
        // We listen for the engine requesting a transition via effects
        // Helper function to process transitions recursively
        const processTransitions = (effects: Effect[]): void => {
          // Check game status before processing transitions
          const ctxCheck = this.engine.context as unknown as EngineContext;
          if (
            ctxCheck.status === "finished" ||
            ctxCheck.status === "complete"
          ) {
            // Don't process transitions if game is complete/finished
            // This prevents the preflop transition for the next hand from being added
            return;
          }

          for (const effect of effects) {
            if (effect.type === "SCHEDULE_TRANSITION" && "targetPhase" in effect) {
              const targetPhase = effect.targetPhase;

              // Skip preflop transitions - these are for the next hand, not this replay
              if (targetPhase === "preflop") {
                continue;
              }

              // Prepare historical cards if dealing a street
              let overrides: TransitionOverrides | null = null;
              if (["flop", "turn", "river"].includes(targetPhase)) {
                const boardIndices = this.getBoardIndicesForStreet(targetPhase);
                overrides = {
                  communityCards: boardIndices.map((idx) =>
                    this.indexToCardObject(idx)
                  ),
                };
              }

              // Execute the transition
              const transResult = this.engine.executeTransition(
                targetPhase as Parameters<typeof this.engine.executeTransition>[0],
                overrides as Parameters<typeof this.engine.executeTransition>[1]
              ) as unknown as GameResult;
              if (!transResult.success) {
                throw new Error(`Auto-transition to ${targetPhase} failed`);
              }

              // Capture state after transition
              frames.push({
                actionIndex,
                state: this.captureState(),
                timestamp: (currentTimestamp += 100),
              });

              // FIX: After a transition, check if there are more transitions needed
              // This handles the case where all streets need to be dealt in sequence
              // during an all-in runout
              if (transResult.effects && transResult.effects.length > 0) {
                processTransitions(transResult.effects);
              }
            }
          }
        };

        if (result.effects) {
          processTransitions(result.effects);
        }
      }

      return { frames };
    } catch (err: unknown) {
      console.error("[ReplayOrchestrator] Generation failed:", err);
      return {
        frames,
        error: getErrorMessage(err),
        stoppedAtActionIndex: actionIndex,
      };
    }
  }

  // --- Helpers ---

  private getBoardIndicesForStreet(street: string): number[] {
    const board = this.history.board;
    switch (street) {
      case "flop":
        return board.slice(0, 3);
      case "turn":
        return board.slice(3, 4);
      case "river":
        return board.slice(4, 5);
      default:
        return [];
    }
  }

  private indexToCardObject(index: number): EngineCard {
    const str = indexToCard(index);
    const rankChar = str[0] as EngineCard["rank"];
    const suitChar = str[1].toLowerCase();
    return {
      suit: SUIT_MAP[suitChar],
      rank: rankChar,
      value: RANK_VALUES[rankChar],
      display: str,
    };
  }

  private captureState(): GameState {
    const ctx = this.engine.context as unknown as EngineContext;
    // Reconstruct clean GameState object from engine context
    // This logic mirrors the previous implementation but ensures deep clone via JSON
    const rawState = JSON.parse(JSON.stringify(ctx)) as {
      gameId: string;
      status: string;
      currentPhase: string;
      players: RawPlayer[];
      communityCards: Array<string | { display?: string }>;
      pots: RawPot[];
      currentActorSeat: number | null;
      buttonSeat: number;
      sbSeat: number;
      bbSeat: number;
      smallBlind: number;
      bigBlind: number;
      minRaise: number;
      handNumber: number;
      actionDeadline?: string | null;
      config?: {
        buyIn?: number;
        maxPlayers?: number;
        blinds?: { small: number; big: number };
      };
    };

    const playersBefore: RawPlayer[] = rawState.players || [];
    const mappedPlayers = playersBefore.map((p: RawPlayer) => {
      // Handle holeCards the same way as getPlayerContext does
      // Mirror the structure: check if holeCards exists before processing
      let holeCards: string[] = [];
      if (p.holeCards && Array.isArray(p.holeCards)) {
        // Initialize revealedIndices if not present
        const revealedIndices: number[] = Array.isArray(p.revealedIndices)
          ? p.revealedIndices
          : [];

        const isShowdown = rawState.currentPhase === "showdown";
        const activeNonFoldedPlayers = (rawState.players || []).filter(
          (pl: RawPlayer) => !pl.folded && !pl.left
        );
        const activePlayersCount = activeNonFoldedPlayers.length;
        const playersWithChips = (rawState.players || []).filter(
          (pl: RawPlayer) => (pl.chips ?? 0) > 0 && !pl.folded && !pl.left
        );
        const currentBet = Math.max(
          0,
          ...(rawState.players || []).map((pl: RawPlayer) => pl.currentBet || 0)
        );
        const activePlayersForBalance = (rawState.players || []).filter(
          (pl: RawPlayer) => !pl.folded && !pl.left
        );
        const isBettingBalanced = activePlayersForBalance.every(
          (pl: RawPlayer) => pl.allIn || (pl.currentBet || 0) === currentBet
        );
        const isRunout =
          playersWithChips.length <= 1 &&
          activeNonFoldedPlayers.length > 1 &&
          isBettingBalanced;

        // Map holeCards - respect revealedIndices, similar to getPlayerContext
        const isSelf = this.currentUserId && p.id === this.currentUserId;
        holeCards = p.holeCards.map((c: string | { display?: string }, index: number) => {
          // Always reveal own cards (hero)
          if (isSelf) {
            return typeof c === "string" ? c : c?.display || "HIDDEN";
          }

          // Auto-reveal during runouts or showdown for active players
          // At showdown: reveal all non-folded players' cards
          // At runout: reveal if betting is balanced and there are multiple active players
          // Also reveal if explicitly revealed via reveal action
          if (isShowdown && !p.folded) {
            // At showdown, reveal all non-folded players' cards
            return typeof c === "string" ? c : c?.display || "HIDDEN";
          }
          if (
            isRunout &&
            ((!p.folded && activePlayersCount > 1) ||
              revealedIndices.includes(index))
          ) {
            // At runout, reveal based on betting balance and active players
            return typeof c === "string" ? c : c?.display || "HIDDEN";
          }

          // Reveal cards that have been explicitly revealed via reveal action
          if (revealedIndices.includes(index)) {
            return typeof c === "string" ? c : c?.display || "HIDDEN";
          }

          // All other cases: return 'HIDDEN'
          return "HIDDEN";
        });

        // If all cards are hidden and player is folded, return empty array
        // (for UI consistency - folded players show no cards)
        // This mirrors getPlayerContext behavior
        if (p.folded && holeCards.every((c) => c === "HIDDEN")) {
          holeCards = [];
        }
      }
      // If holeCards is undefined/null, holeCards remains empty array
      // Player object is ALWAYS returned (mirrors getPlayerContext)

      return {
        id: p.id || "",
        username: p.name || `Player ${p.seat || "?"}`,
        seat: p.seat || 0,
        chips: p.chips || 0,
        currentBet: p.currentBet || 0,
        totalBet: p.totalBet || 0,
        holeCards: holeCards,
        folded: p.folded || false,
        allIn: p.allIn || false,
        isBot: p.isBot || false,
        left: p.left || false,
        revealedIndices: p.revealedIndices || [],
      };
    });

    const finalPlayers = mappedPlayers.filter((p) => p.id); // Filter out players without IDs

    return {
      gameId: rawState.gameId,
      status: rawState.status,
      currentPhase: rawState.currentPhase || "preflop",
      players: finalPlayers,
      communityCards: (rawState.communityCards || []).map((c) =>
        typeof c === "string" ? c : c?.display || ""
      ),
      pot: rawState.pots?.[0]?.amount || 0,
      sidePots:
        rawState.pots?.slice(1).map((pot: RawPot) => ({
          amount: pot.amount,
          eligibleSeats: [], // Simplified for replay display
        })) || [],
      pots: rawState.pots?.map((pot: RawPot) => ({
        amount: pot.amount,
        contributors: pot.contributors || pot.eligiblePlayers || [],
        eligiblePlayers: pot.eligiblePlayers,
      })) || [],
      currentActorSeat: rawState.currentActorSeat,
      buttonSeat: rawState.buttonSeat,
      dealerSeat: rawState.buttonSeat,
      sbSeat: rawState.sbSeat,
      bbSeat: rawState.bbSeat,
      actionDeadline: rawState.actionDeadline
        ? new Date(rawState.actionDeadline).getTime()
        : null,
      minRaise: rawState.minRaise,
      betsThisRound: rawState.players?.map((p) => p.currentBet || 0) || [],
      handNumber: rawState.handNumber,
      bigBlind: rawState.bigBlind,
      smallBlind: rawState.smallBlind,
      config: rawState.config,
    } as GameState;
  }

  private codecActionTypeToEngine(type: number): string | null {
    switch (type) {
      case ActionType.FOLD:
        return "fold";
      case ActionType.CHECK:
        return "check";
      case ActionType.CALL:
        return "call";
      case ActionType.BET_OR_RAISE:
        return "bet"; // All-in actions are also recorded as BET_OR_RAISE
      case ActionType.SHOW_CARDS:
        return "reveal";
      default:
        return null;
    }
  }
}
