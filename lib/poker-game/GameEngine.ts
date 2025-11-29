import { GameContext, Action } from "./types";
import { GameState } from "./states/GameState";
import { WaitingForPlayers } from "./states/WaitingForPlayers";

export class GameEngine {
  private context: GameContext;
  private currentState: GameState;
  private stateChangeCallbacks: ((ctx: GameContext) => void)[] = [];

  constructor(initialContext: GameContext) {
    this.context = initialContext;
    this.currentState = new WaitingForPlayers();
    this.context = this.currentState.onEnter(this.context);
    this.checkTransitions();
  }

  /**
   * Process a player action
   */
  processAction(action: Action): void {
    this.context = this.currentState.onAction(this.context, action);
    this.checkTransitions();
    this.notifyStateChange();
  }

  /**
   * Get current game state
   */
  getState(): GameContext {
    return { ...this.context };
  }

  /**
   * Get legal actions for a player
   */
  getLegalActions(seat: number): string[] {
    return this.currentState.getLegalActions(this.context, seat);
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback: (ctx: GameContext) => void): () => void {
    this.stateChangeCallbacks.push(callback);
    return () => {
      this.stateChangeCallbacks = this.stateChangeCallbacks.filter(
        (cb) => cb !== callback
      );
    };
  }

  /**
   * Check if we should transition to the next state
   */
  private checkTransitions(): void {
    while (this.currentState.shouldTransition(this.context)) {
      const nextState = this.currentState.getNextState();
      if (!nextState) break;

      this.currentState = nextState;
      this.context = this.currentState.onEnter(this.context);
      this.notifyStateChange();
    }
  }

  /**
   * Notify all subscribers of state changes
   */
  private notifyStateChange(): void {
    this.stateChangeCallbacks.forEach((callback) => {
      callback(this.getState());
    });
  }

  /**
   * Force a state transition (for testing/debugging or delayed transitions)
   */
  forceTransition(): void {
    // Force transition by temporarily allowing it
    if (this.currentState.shouldTransition(this.context)) {
      this.checkTransitions();
    } else {
      // If shouldTransition returns false, manually transition anyway
      const nextState = this.currentState.getNextState();
      if (nextState) {
        this.currentState = nextState;
        this.context = this.currentState.onEnter(this.context);
        this.notifyStateChange();
        // Continue checking for further transitions
        this.checkTransitions();
      }
    }
  }
}
