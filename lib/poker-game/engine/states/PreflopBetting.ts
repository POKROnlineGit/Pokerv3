import { GameState } from "./GameState";
import { GameContext, Action, ActionType } from "../core/types";
import { applyAction, isBettingRoundComplete } from "../utils/actions";
import {
  getNextActivePlayer,
  getNextEligiblePlayer,
  nextSeat,
} from "../utils/seatUtils";
import {
  postBlinds,
  dealHoleCards,
  addToHistory,
  resetPlayerBets,
  resetEligibleToBet,
} from "../core/GameContext";
import { createDeck, shuffleDeck } from "../utils/deck";
import { DealFlop } from "./DealFlop";

export class PreflopBetting implements GameState {
  phase = "preflop" as const;

  onEnter(ctx: GameContext): GameContext {
    let newCtx = { ...ctx };

    // Rotate button
    newCtx.buttonSeat = (newCtx.buttonSeat % 6) + 1;

    // Reset player states
    newCtx.players = newCtx.players.map((p) => ({
      ...p,
      folded: false,
      allIn: false,
      currentBet: 0,
      totalBet: 0,
      holeCards: [],
    }));

    // Reset pots and bets
    newCtx = resetPlayerBets(newCtx);
    newCtx.pots = [{ amount: 0, eligiblePlayers: [] }];
    newCtx.communityCards = [];
    newCtx.deck = shuffleDeck(createDeck());
    newCtx.minRaise = newCtx.bigBlind * 2;
    newCtx.lastAggressorSeat = null;
    newCtx.handNumber += 1;

    // Deal hole cards
    newCtx = dealHoleCards(newCtx);

    // Post blinds
    newCtx = postBlinds(newCtx);

    // Reset eligibleToBet for all non-all-in players
    newCtx = resetEligibleToBet(newCtx);

    // Check if there are eligible players (if not, skip betting round)
    const eligiblePlayers = newCtx.players.filter(
      (p) => !p.folded && !p.allIn && p.chips > 0 && p.eligibleToBet
    );

    if (eligiblePlayers.length < 2) {
      // Not enough eligible players, skip betting round
      newCtx.currentActorSeat = null;
      newCtx.firstActorSeat = null;
    } else {
      // Set first actor (UTG - left of BB)
      const sbSeat = nextSeat(newCtx.buttonSeat);
      const bbSeat = nextSeat(sbSeat);
      const firstActor = getNextActivePlayer(bbSeat, newCtx.players);
      newCtx.currentActorSeat = firstActor;
      newCtx.firstActorSeat = firstActor;
    }

    newCtx.currentPhase = "preflop";
    newCtx = addToHistory(
      newCtx,
      `Hand #${newCtx.handNumber} - Preflop betting started`
    );

    return newCtx;
  }

  onAction(ctx: GameContext, action: Action): GameContext {
    let newCtx = applyAction(ctx, action);
    newCtx = addToHistory(
      newCtx,
      `Seat ${action.seat} ${action.type}${
        action.amount ? ` ${action.amount}` : ""
      }`
    );

    // Check if betting round is complete
    if (isBettingRoundComplete(newCtx)) {
      return newCtx;
    }

    return newCtx;
  }

  getLegalActions(ctx: GameContext, seat: number): ActionType[] {
    if (ctx.currentActorSeat !== seat) return [];

    const player = ctx.players.find((p) => p.seat === seat);
    if (!player || player.folded || player.allIn || !player.eligibleToBet)
      return [];

    const currentBet = Math.max(...ctx.players.map((p) => p.currentBet), 0);
    const toCall = currentBet - player.currentBet;

    const actions: ActionType[] = ["fold"];

    if (toCall === 0) {
      actions.push("check", "allin");
      // Can bet if eligible
      actions.push("bet");
    } else {
      actions.push("call", "allin");
      // Can raise if eligible
      actions.push("raise");
    }

    return actions;
  }

  shouldTransition(ctx: GameContext): boolean {
    // Don't auto-transition - the store will handle the 3 second delay
    return false;
  }

  getNextState(): GameState | null {
    return new DealFlop();
  }
}
