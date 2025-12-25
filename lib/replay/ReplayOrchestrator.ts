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
import type { GameResult, EngineContext, EngineCard } from "@/lib/types/engine";

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

export class ReplayOrchestrator {
  private engine: TexasHoldemEngine;
  private history: ReplayInput;
  private manifestToSeat: Map<number, number>;
  private seatToPlayerId: Map<number, string>;

  constructor(history: ReplayInput, playerNames?: Record<string, string>) {
    this.history = history;
    this.engine = new TexasHoldemEngine(history.gameId, history.variant);

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

        // If currentActorSeat is null, the round has completed - skip non-transition actions
        if (currentActorSeat === null) {
          continue;
        }

        // Validate that the action's seat matches the current actor
        if (currentActorSeat !== seat) {
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
        const engineAction: any = {
          seat,
          type: engineActionType,
          amount: action.amount,
          index: revealIndex,
        };

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
          const errEvent = result.events.find((e: any) => e.type === "ERROR");
          throw new Error(
            errEvent?.payload?.message || "Engine rejected action"
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
        if (result.effects) {
          for (const effect of result.effects) {
            if (effect.type === "SCHEDULE_TRANSITION") {
              const targetPhase = effect.targetPhase;

              // Prepare historical cards if dealing a street
              let overrides: any = null;
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
                targetPhase,
                overrides as unknown as null
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
            }
          }
        }
      }

      return { frames };
    } catch (err: any) {
      console.error("[ReplayOrchestrator] Generation failed:", err);
      return {
        frames,
        error: err.message,
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
    const rankChar = str[0];
    const suitChar = str[1].toLowerCase();
    return {
      suit: SUIT_MAP[suitChar],
      rank: rankChar as any,
      value: RANK_VALUES[rankChar],
      display: str,
    };
  }

  private captureState(): GameState {
    const ctx = this.engine.context as unknown as EngineContext;
    // Reconstruct clean GameState object from engine context
    // This logic mirrors the previous implementation but ensures deep clone via JSON
    const rawState = JSON.parse(JSON.stringify(ctx));

    const playersBefore = rawState.players || [];
    const mappedPlayers = playersBefore.map((p: any) => {
      // Handle holeCards the same way as getPlayerContext does
      // Mirror the structure: check if holeCards exists before processing
      let holeCards: string[] = [];
      if (p.holeCards && Array.isArray(p.holeCards)) {
        // Map holeCards - for replay (God Mode), show all cards
        holeCards = p.holeCards.map((c: any) => {
          // Convert card object to display string
          return typeof c === "string" ? c : c?.display || "HIDDEN";
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
        name: p.name || `Player ${p.seat || "?"}`,
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

    const finalPlayers = mappedPlayers.filter((p: any) => p.id); // Filter out players without IDs

    return {
      gameId: rawState.gameId,
      status: rawState.status,
      phase: rawState.currentPhase || "preflop",
      currentRound: rawState.currentPhase || "preflop",
      players: finalPlayers,
      communityCards: (rawState.communityCards || []).map((c: any) =>
        typeof c === "string" ? c : c?.display || c
      ),
      pot: rawState.pots?.[0]?.amount || 0,
      sidePots:
        rawState.pots?.slice(1).map((pot: any) => ({
          amount: pot.amount,
          eligibleSeats: [], // Simplified for replay display
        })) || [],
      pots: rawState.pots,
      currentActorSeat: rawState.currentActorSeat,
      buttonSeat: rawState.buttonSeat,
      dealerSeat: rawState.buttonSeat,
      sbSeat: rawState.sbSeat,
      bbSeat: rawState.bbSeat,
      actionDeadline: rawState.actionDeadline
        ? new Date(rawState.actionDeadline).getTime()
        : null,
      minRaise: rawState.minRaise,
      handNumber: rawState.handNumber,
      bigBlind: rawState.bigBlind,
      smallBlind: rawState.smallBlind,
      currentPhase: rawState.currentPhase,
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
