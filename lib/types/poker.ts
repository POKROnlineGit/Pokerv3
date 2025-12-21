export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "allin";

// Re-export Card type from engine (if needed by components)
export type { Card } from "@/lib/poker-game/engine/core/types";

export interface ActionValidation {
  valid: boolean;
  error?: string;
  minAmount?: number;
  maxAmount?: number;
}

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
  leaving?: boolean;
  playerHandType?: string;

  // UI-Specific Injected Fields (Fixes missing buttons/bets)
  bet?: number; // Visual bet amount
  isDealer?: boolean; // Visual dealer button
  isSb?: boolean; // Visual SB button
  isBb?: boolean; // Visual BB button

  // Ghost State / Disconnect Fields
  disconnected?: boolean;
  left?: boolean;
  isGhost?: boolean;
  disconnectTimestamp?: number;
}

export interface Pot {
  amount: number;
  contributors: string[];
  winners?: string[];
}

export interface GameState {
  gameId: string;
  status?: "waiting" | "starting" | "active" | "finished" | "complete";
  phase?:
    | "waiting"
    | "preflop"
    | "flop"
    | "turn"
    | "river"
    | "showdown"
    | "complete";
  players: Player[];
  communityCards: string[];
  pot: number; // Main pot amount
  sidePots?: Array<{ amount: number; eligibleSeats: number[] }>; // Side pots
  pots?: Pot[]; // Legacy format (for backward compatibility)
  currentActorSeat: number | null;
  buttonSeat: number; // Dealer button seat
  dealerSeat?: number; // Alias for buttonSeat (for backward compatibility)
  sbSeat: number;
  bbSeat: number;
  actionDeadline?: number | null;
  minRaise: number;
  lastRaise: number;
  betsThisRound: number[];
  currentRound: "preflop" | "flop" | "turn" | "river" | "showdown";
  handNumber: number;
  winnerIds?: string[];
  winningHand?: string;
  config?: {
    maxPlayers: number;
    smallBlind: number;
    bigBlind: number;
    turnTimer: number;
  };
  // Frontend-specific fields
  left_players?: string[];
  currentPhase?: string; // Actual phase from server (may be "waiting")
}
