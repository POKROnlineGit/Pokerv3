/**
 * UI-friendly types for component compatibility
 * Simplified structure optimized for UI rendering
 */

import { GameContext, ActionType } from "../engine/core/types";
import { gameContextToUI, GameContextUI } from "./adapters";

// Re-export Card type and ActionType (same in both)
export type { Card, ActionType } from "../engine/core/types";

// Re-export GameContextUI as GameState for backward compatibility with UI components
export type { GameContextUI };
export type GameState = GameContextUI;

// UI-friendly Player type (for UI components)
export interface Player {
  id: string;
  name: string;
  seat: number;
  chips: number;
  betThisRound: number;
  totalBet: number;
  holeCards: string[];
  folded: boolean;
  allIn: boolean;
  isBot?: boolean;
  playerHandType?: string; // Current best hand type (e.g., "Pair", "Flush")
}

// ActionValidation (same structure)
export interface ActionValidation {
  valid: boolean;
  error?: string;
  minAmount?: number;
  maxAmount?: number;
}
