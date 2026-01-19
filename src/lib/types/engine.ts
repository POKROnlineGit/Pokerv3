/**
 * Type definitions for TexasHoldemEngine
 * These types match the actual JavaScript implementation from shared-backend
 */

// =============================================================================
// CORE CARD & PLAYER TYPES
// =============================================================================

export interface EngineCard {
  suit: "hearts" | "diamonds" | "clubs" | "spades";
  rank: "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K" | "A";
  value: number;
  display: string; // e.g., "Ah", "Kd"
}

export type PlayerStatus =
  | "ACTIVE"
  | "DISCONNECTED"
  | "LEFT"
  | "REMOVED"
  | "WAITING_FOR_NEXT_HAND"
  | "ELIMINATED";

export interface EnginePlayer {
  id: string;
  username: string;
  name?: string; // Legacy alias for username
  seat: number;
  chips: number;
  currentBet: number;
  totalBet: number;
  totalBetThisHand?: number; // Alternative field name
  holeCards: EngineCard[] | string[] | ("HIDDEN" | null)[];
  folded: boolean;
  allIn: boolean;
  isBot: boolean;
  isOffline: boolean;
  isGhost: boolean;
  status: PlayerStatus;
  eligibleToBet?: boolean;
  leaving?: boolean;
  leavingAfterRound?: boolean;
  left?: boolean;
  revealedIndices?: number[];
  hasActed?: boolean;
  playerHandType?: string;
  disconnected?: boolean;
  disconnectTimestamp?: number;
}

export interface EnginePot {
  amount: number;
  eligiblePlayers: string[]; // Player IDs
  contributors?: string[];
  winners?: string[];
}

// =============================================================================
// GAME CONTEXT (Full engine state)
// =============================================================================

export interface EngineConfig {
  /** Blind structure (backend format) */
  blinds?: { small: number; big: number };
  /** Buy-in amount */
  buyIn: number;
  /** Maximum players */
  maxPlayers: number;
  /** Action timeout in milliseconds */
  actionTimeoutMs?: number;
  /** Variant identifier */
  variantSlug?: string;
  /** Whether private game */
  isPrivate?: boolean;
  /** Host user ID */
  hostId?: string;
  /** Tournament ID */
  tournamentId?: string;
  /** Table index in tournament */
  tournamentTableIndex?: number;
  /** Starting stack (tournaments) */
  startingStack?: number;
  // Legacy fields for backwards compatibility
  smallBlind?: number;
  bigBlind?: number;
  turnTimer?: number;
}

export interface ShowdownResults {
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
}

export interface Spectator {
  odanUserId: string;
  username: string;
  joinedAt: string;
}

export interface PendingRequest {
  odanUserId: string;
  odanRequestId: string;
  username: string;
  requestedAt: string;
  type: "join" | "rejoin";
}

export interface EngineContext {
  gameId: string;
  type?: string; // e.g., "holdem", "plo"
  status: "waiting" | "starting" | "active" | "finished" | "complete";
  currentPhase: "preflop" | "flop" | "turn" | "river" | "showdown" | "waiting";
  players: EnginePlayer[];
  communityCards: EngineCard[] | string[];
  pots: EnginePot[];
  currentActorSeat: number | null;
  firstActorSeat?: number | null;
  buttonSeat: number;
  sbSeat?: number;
  bbSeat?: number;
  actionDeadline?: string | null; // ISO timestamp
  minRaise: number;
  lastRaiseAmount?: number;
  bigBlind: number;
  smallBlind: number;
  buyIn?: number;
  maxPlayers?: number;
  handNumber: number;
  handHistory?: unknown[];
  /** Remaining deck (only on server, removed before sending to clients) */
  deck?: string[];
  /** Status message */
  message?: string | null;
  config?: EngineConfig;
  showdownResults?: ShowdownResults;

  // Private game fields
  isPrivate?: boolean;
  hostId?: string | null;
  isPaused?: boolean;
  pendingRequests?: PendingRequest[];
  spectators?: Spectator[];
  joinCode?: string;

  // Tournament fields
  tournamentId?: string | null;
  tournamentTableIndex?: number;

  // Players who have left (for preventing re-redirect)
  left_players?: string[];

  // Legacy/computed fields
  dealerSeat?: number; // Alias for buttonSeat
  highBet?: number;
  winnerIds?: string[];
  winningHand?: string;
}

// =============================================================================
// EFFECT TYPES
// =============================================================================

export const EffectType = {
  PERSIST: "PERSIST",
  SCHEDULE_TRANSITION: "SCHEDULE_TRANSITION",
  START_TIMER: "START_TIMER",
  START_RECONNECT_TIMER: "START_RECONNECT_TIMER",
  CANCEL_RECONNECT_TIMER: "CANCEL_RECONNECT_TIMER",
  GAME_END: "GAME_END",
  READY_FOR_TRANSFER: "READY_FOR_TRANSFER",
  PLAYER_ELIMINATED_FROM_TOURNAMENT: "PLAYER_ELIMINATED_FROM_TOURNAMENT",
} as const;

export type EffectTypeName = (typeof EffectType)[keyof typeof EffectType];

export interface BaseEffect {
  type: EffectTypeName;
}

export interface TransitionEffect extends BaseEffect {
  type: "SCHEDULE_TRANSITION";
  targetPhase: string;
  delayMs: number;
}

export interface TimerEffect extends BaseEffect {
  type: "START_TIMER";
  timerType: "ACTION_TIMEOUT" | "RECONNECT_TIMER" | "TRANSITION";
  playerId?: string;
  duration?: number;
}

export interface ReconnectTimerEffect extends BaseEffect {
  type: "START_RECONNECT_TIMER" | "CANCEL_RECONNECT_TIMER";
  playerId: string;
  duration?: number;
}

export interface GameEndEffect extends BaseEffect {
  type: "GAME_END";
  reason: string;
  winnerId?: string;
}

export interface PersistEffect extends BaseEffect {
  type: "PERSIST";
}

export interface ReadyForTransferEffect extends BaseEffect {
  type: "READY_FOR_TRANSFER";
  playerId: string;
}

export interface PlayerEliminatedEffect extends BaseEffect {
  type: "PLAYER_ELIMINATED_FROM_TOURNAMENT";
  playerId: string;
  tournamentId: string;
}

export type Effect =
  | TransitionEffect
  | TimerEffect
  | ReconnectTimerEffect
  | GameEndEffect
  | PersistEffect
  | ReadyForTransferEffect
  | PlayerEliminatedEffect
  | BaseEffect;

// =============================================================================
// EVENT TYPES
// =============================================================================

export const EventType = {
  PLAYER_ACTION: "PLAYER_ACTION",
  PLAYER_STATUS_UPDATE: "PLAYER_STATUS_UPDATE",
  PLAYER_ELIMINATED: "PLAYER_ELIMINATED",
  PLAYER_MOVED_TO_SPECTATOR: "PLAYER_MOVED_TO_SPECTATOR",
  STATE_CHANGED: "STATE_CHANGED",
  DEAL_STREET: "DEAL_STREET",
  GAME_FINISHED: "GAME_FINISHED",
  ERROR: "ERROR",
  // Tournament Events
  TOURNAMENT_BLIND_LEVEL_ADVANCED: "TOURNAMENT_BLIND_LEVEL_ADVANCED",
  TOURNAMENT_PLAYER_ELIMINATED: "TOURNAMENT_PLAYER_ELIMINATED",
  TOURNAMENT_PLAYER_TRANSFERRED: "TOURNAMENT_PLAYER_TRANSFERRED",
  TOURNAMENT_TABLES_BALANCED: "TOURNAMENT_TABLES_BALANCED",
  TOURNAMENT_TABLES_MERGED: "TOURNAMENT_TABLES_MERGED",
  TOURNAMENT_LEVEL_WARNING: "TOURNAMENT_LEVEL_WARNING",
  TOURNAMENT_STATUS_CHANGED: "TOURNAMENT_STATUS_CHANGED",
  TOURNAMENT_PLAYER_REGISTERED: "TOURNAMENT_PLAYER_REGISTERED",
  TOURNAMENT_PLAYER_UNREGISTERED: "TOURNAMENT_PLAYER_UNREGISTERED",
  TOURNAMENT_PARTICIPANT_COUNT_CHANGED: "TOURNAMENT_PARTICIPANT_COUNT_CHANGED",
  TOURNAMENT_COMPLETED: "TOURNAMENT_COMPLETED",
  TOURNAMENT_CANCELLED: "TOURNAMENT_CANCELLED",
  TOURNAMENT_PLAYER_BANNED: "TOURNAMENT_PLAYER_BANNED",
  TOURNAMENT_PLAYER_LEFT: "TOURNAMENT_PLAYER_LEFT",
} as const;

export type EventTypeName = (typeof EventType)[keyof typeof EventType];

export interface GameEvent {
  type: EventTypeName | string;
  data?: unknown;
  payload?: unknown; // Alternative field for data
  timestamp?: string; // ISO timestamp
  message?: string;
}

// =============================================================================
// ACTION TYPES
// =============================================================================

export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "allin";

export interface EngineAction {
  type: ActionType;
  seat: number;
  amount?: number;
  playerId?: string;
}

// =============================================================================
// GAME RESULT (Engine output)
// =============================================================================

export interface GameResult {
  success: boolean;
  state: EngineContext;
  events: GameEvent[];
  effects: Effect[];
}

// =============================================================================
// TRANSITION OVERRIDES (For replay/testing)
// =============================================================================

export interface TransitionOverrides {
  holeCards?: Record<number, EngineCard[]>;
  communityCards?: EngineCard[];
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Type guard for checking if a value is an Error with a message
 */
export function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  );
}

/**
 * Safely extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error)) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unknown error occurred";
}
