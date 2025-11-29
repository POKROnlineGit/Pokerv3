/**
 * Legacy types for UI compatibility
 * These match the old poker-engine types so components don't need to change
 */

import { GameContext, Player as NewPlayer, ActionType, ActionValidation as NewActionValidation } from './types';
import { gameContextToLegacyState } from './adapters';
import { validateAction as validateActionNew, getCurrentBet as getCurrentBetNew } from './actions';

// Re-export Card type (same in both)
export type { Card } from './types';

// Legacy GameState (for UI components)
export interface GameState {
  gameId: string;
  players: Array<{
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
  }>;
  communityCards: string[];
  pot: number;
  sidePots: Array<{ amount: number; eligibleSeats: number[] }>;
  buttonSeat: number;
  sbSeat: number;
  bbSeat: number;
  currentRound: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
  currentActorSeat: number;
  minRaise: number;
  lastRaise: number;
  betsThisRound: number[];
  handNumber: number;
}

// Legacy Player type
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
}

// ActionValidation (same structure)
export interface ActionValidation {
  valid: boolean;
  error?: string;
  minAmount?: number;
  maxAmount?: number;
}

// Helper to convert GameContext to legacy GameState
export function toLegacyGameState(ctx: GameContext): GameState {
  return gameContextToLegacyState(ctx);
}

// Helper to validate action on legacy GameState
// This creates a minimal GameContext for validation purposes
export function validateAction(
  gameState: GameState,
  playerId: string,
  action: ActionType,
  amount?: number
): ActionValidation {
  // Create a minimal GameContext for validation
  const player = gameState.players.find(p => p.id === playerId);
  if (!player) {
    return { valid: false, error: 'Player not found' };
  }

  // Check if it's the player's turn
  if (gameState.currentActorSeat !== player.seat) {
    return { valid: false, error: 'Not your turn' };
  }

  // Basic validation without full context conversion
  const currentBet = Math.max(...gameState.betsThisRound, 0);
  const toCall = currentBet - player.betThisRound;

  switch (action) {
    case 'fold':
      if (player.allIn) {
        return { valid: false, error: 'Cannot fold when all-in' };
      }
      return { valid: true };

    case 'check':
      if (toCall > 0) {
        return { valid: false, error: 'Cannot check, must call or fold' };
      }
      return { valid: true };

    case 'call':
      if (toCall === 0) {
        return { valid: false, error: 'Can check instead of calling' };
      }
      if (toCall > player.chips) {
        return { valid: false, error: 'Not enough chips to call' };
      }
      return { valid: true };

    case 'bet':
      if (toCall > 0) {
        return { valid: false, error: 'Cannot bet, must call or fold' };
      }
      if (!amount || amount < gameState.minRaise) {
        return {
          valid: false,
          error: `Bet must be at least ${gameState.minRaise}`,
          minAmount: gameState.minRaise,
        };
      }
      if (amount > player.chips) {
        return {
          valid: false,
          error: 'Not enough chips',
          maxAmount: player.chips,
        };
      }
      return { valid: true, minAmount: gameState.minRaise, maxAmount: player.chips };

    case 'raise':
      if (toCall === 0) {
        return { valid: false, error: 'Cannot raise, must bet first' };
      }
      if (!amount) {
        return { valid: false, error: 'Raise amount required' };
      }
      const totalNeeded = toCall + amount;
      if (totalNeeded > player.chips) {
        return { valid: false, error: 'Not enough chips' };
      }
      if (amount < gameState.minRaise) {
        return {
          valid: false,
          error: `Raise must be at least ${gameState.minRaise} more`,
          minAmount: gameState.minRaise,
        };
      }
      return {
        valid: true,
        minAmount: gameState.minRaise,
        maxAmount: player.chips - toCall,
      };

    case 'allin':
      if (player.chips === 0) {
        return { valid: false, error: 'Already all-in' };
      }
      return { valid: true };

    default:
      return { valid: false, error: 'Invalid action' };
  }
}

// Helper to get current bet from legacy GameState
export function getCurrentBet(gameState: GameState): number {
  return Math.max(...gameState.betsThisRound, 0);
}

