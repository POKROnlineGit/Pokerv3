import { GameState } from "./GameState";
import { GameContext, Action, ActionType } from "../types";
import { applyAction, isBettingRoundComplete } from "../actions";
import { addToHistory } from "../GameContext";
import { Showdown } from "./Showdown";

export class RiverBetting implements GameState {
  phase = "river" as const;

  onEnter(ctx: GameContext): GameContext {
    return ctx;
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
    return new Showdown();
  }
}
