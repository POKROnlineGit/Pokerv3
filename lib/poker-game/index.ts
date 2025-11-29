// Public API for the poker game engine
export { GameEngine } from "./GameEngine";
export { createInitialContext } from "./GameContext";
export {
  validateAction,
  applyAction,
  isBettingRoundComplete,
  getCurrentBet,
} from "./actions";
export {
  getNextActivePlayer,
  getNextEligiblePlayer,
  getActivePlayersInOrder,
  nextSeat,
  prevSeat,
} from "./seatUtils";
export { createDeck, shuffleDeck, dealCards } from "./deck";
export { getHandStrength, evaluateHandSimple } from "./botHandEvaluator";
export { checkQueueAndCreateGame } from "./queueManager";
// Note: handEvaluator is server-only (uses poker-evaluator with fs module)
// For client-side, use botHandEvaluator above
// handEvaluator functions are NOT exported here to prevent client-side imports
// Server-side code should import directly from './handEvaluator'
export type {
  GameContext,
  Player,
  Action,
  ActionType,
  GamePhase,
  Pot,
  ActionValidation,
  Card,
} from "./types";
