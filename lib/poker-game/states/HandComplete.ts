import { GameState } from './GameState';
import { GameContext, Action, ActionType } from '../types';
import { PreflopBetting } from './PreflopBetting';

export class HandComplete implements GameState {
  phase = 'complete' as const;

  onEnter(ctx: GameContext): GameContext {
    return ctx;
  }

  onAction(ctx: GameContext, action: Action): GameContext {
    return ctx;
  }

  getLegalActions(ctx: GameContext, seat: number): ActionType[] {
    return [];
  }

  shouldTransition(ctx: GameContext): boolean {
    // Check if we should start a new hand
    const activePlayers = ctx.players.filter(p => p.chips > 0);
    return activePlayers.length >= 2;
  }

  getNextState(): GameState | null {
    return new PreflopBetting();
  }
}

