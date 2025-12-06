import { GameContext, Action, ActionType } from '../core/types';

/**
 * Base interface for all game states
 */
export interface GameState {
  phase: GameContext['currentPhase'];
  
  /**
   * Called when entering this state
   */
  onEnter(ctx: GameContext): GameContext;
  
  /**
   * Called when a player/bot takes an action
   */
  onAction(ctx: GameContext, action: Action): GameContext;
  
  /**
   * Get legal actions for a player at a given seat
   */
  getLegalActions(ctx: GameContext, seat: number): ActionType[];
  
  /**
   * Determine if we should transition to the next state
   */
  shouldTransition(ctx: GameContext): boolean;
  
  /**
   * Get the next state to transition to
   */
  getNextState(): GameState | null;
}

