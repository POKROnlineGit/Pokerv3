export type ActionType =
  | "fold"
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "allin"
  | "reveal";

// Re-export Card type from utils (if needed by components)
export type { Card } from "@/lib/utils/pokerUtils";

export interface ActionValidation {
  valid: boolean;
  error?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface Player {
  id: string;
  username: string;
  seat: number;
  chips: number;
  currentBet: number; // Matches engine schema
  totalBet: number;
  holeCards: (string | "HIDDEN" | null)[]; // Can contain card strings, "HIDDEN", or null
  folded: boolean;
  allIn: boolean;
  isBot?: boolean;
  leaving?: boolean;
  playerHandType?: string;
  revealedIndices?: number[]; // Array of card indices that have been revealed during showdown

  // UI-Specific Injected Fields (Fixes missing buttons/bets)
  bet?: number; // Visual bet amount (alias for currentBet)
  isDealer?: boolean; // Visual dealer button
  isSb?: boolean; // Visual SB button
  isBb?: boolean; // Visual BB button

  // Ghost State / Disconnect Fields
  disconnected?: boolean;
  left?: boolean;
  isGhost?: boolean;
  disconnectTimestamp?: number;

  // Player Status
  status?:
    | "ACTIVE"
    | "DISCONNECTED"
    | "LEFT"
    | "REMOVED"
    | "WAITING_FOR_NEXT_HAND";
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
  lastRaiseAmount?: number; // Amount of the last raise (on top, not total bet). For opening bets, this equals the bet amount.
  betsThisRound: number[];
  currentPhase: "preflop" | "flop" | "turn" | "river" | "showdown" | "waiting";
  handNumber: number;
  winnerIds?: string[];
  winningHand?: string;
  config?: {
    maxPlayers: number;
    smallBlind: number;
    bigBlind: number;
    turnTimer: number;
  };
  // Game constraint fields (needed by ActionPopup)
  bigBlind?: number;
  smallBlind?: number;
  highBet?: number;
  // Frontend-specific fields
  left_players?: string[];
  isPrivate?: boolean; // Whether this is a private game
  joinCode?: string; // Short alphanumeric code for joining private games
  // Tournament fields
  tournamentId?: string | null; // Set if this game is part of a tournament
}
