import { GameState } from './GameState';
import { GameContext, Action, ActionType } from '../types';
import { PreflopBetting } from './PreflopBetting';

export class WaitingForPlayers implements GameState {
  phase = 'waiting' as const;

  onEnter(ctx: GameContext): GameContext {
    // Check if we have enough players to start
    const activePlayers = ctx.players.filter(p => p.chips > 0);
    if (activePlayers.length >= 2) {
      // Transition to preflop
      return ctx;
    }
    return ctx;
  }

  onAction(ctx: GameContext, action: Action): GameContext {
    // No actions allowed in waiting state
    return ctx;
  }

  getLegalActions(ctx: GameContext, seat: number): ActionType[] {
    return [];
  }

  shouldTransition(ctx: GameContext): boolean {
    const activePlayers = ctx.players.filter(p => p.chips > 0);
    return activePlayers.length >= 2;
  }

  getNextState(): GameState | null {
    return new PreflopBetting();
  }
}

