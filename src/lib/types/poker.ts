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

// Player Status Types
export type PlayerStatus =
  | "ACTIVE"
  | "DISCONNECTED"
  | "LEFT"
  | "REMOVED"
  | "WAITING_FOR_NEXT_HAND"
  | "ELIMINATED";

export interface Player {
  id: string;
  username: string;
  seat: number;
  chips: number;
  currentBet: number; // Matches engine schema
  totalBet: number;
  totalBetThisHand?: number; // Alternative field name from engine
  holeCards: (string | "HIDDEN" | null)[]; // Can contain card strings, "HIDDEN", or null
  folded: boolean;
  allIn: boolean;
  isBot?: boolean;
  leaving?: boolean;
  leavingAfterRound?: boolean; // Tournament: leaving after current hand
  playerHandType?: string;
  revealedIndices?: number[]; // Array of card indices that have been revealed during showdown

  // UI-Specific Injected Fields (Fixes missing buttons/bets)
  bet?: number; // Visual bet amount (alias for currentBet)
  wager?: number; // Alias for currentBet (legacy)
  betAmount?: number; // Alias for currentBet (legacy)
  isDealer?: boolean; // Visual dealer button
  isSb?: boolean; // Visual SB button
  isBb?: boolean; // Visual BB button

  // Ghost State / Disconnect Fields
  disconnected?: boolean;
  left?: boolean;
  isGhost?: boolean;
  isOffline?: boolean;
  disconnectTimestamp?: number;

  // Player Status
  status?: PlayerStatus;

  // Engine internal fields
  eligibleToBet?: boolean;
  hasActed?: boolean;
}

export interface Pot {
  amount: number;
  contributors: string[];
  eligiblePlayers?: string[]; // Alternative field from engine
  winners?: string[];
}

// Spectator type for private games
export interface GameSpectator {
  odanUserId: string;
  username: string;
  joinedAt: string;
}

// Pending join request for private games
export interface PendingJoinRequest {
  odanUserId: string;
  odanRequestId: string;
  username: string;
  requestedAt: string;
  type: "join" | "rejoin";
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
  actionDeadline?: number | string | null; // Can be timestamp number or ISO string
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

  // Private game fields
  isPrivate?: boolean;
  joinCode?: string; // Short alphanumeric code for joining private games
  hostId?: string; // Host user ID for private games
  isPaused?: boolean;
  pendingRequests?: PendingJoinRequest[];
  spectators?: GameSpectator[];

  // Tournament fields
  tournamentId?: string | null; // Set if this game is part of a tournament
  tournamentTableIndex?: number;

  // Showdown results
  showdownResults?: {
    winners: Array<{
      playerId: string;
      seat: number;
      amount: number;
      handType: string;
    }>;
    distributions: Array<{
      potIndex: number;
      winners: string[];
      amount: number;
    }>;
    rankings: Array<{
      playerId: string;
      seat: number;
      handType: string;
      rank: number;
    }>;
  };
}

// ============================================
// SOCKET CALLBACK RESPONSE TYPES
// ============================================

export interface SocketGameResponse {
  success?: boolean;
  error?: string;
  gameState?: GameState;
}

export interface QueueUpdatePayload {
  position?: number;
  estimatedWait?: number;
  status?: string;
  gameId?: string;
  message?: string;
}
