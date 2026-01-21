/**
 * Socket event types for game-related events
 * These types define the payloads received from the server
 */

import type { GameState, Player, PendingJoinRequest, GameSpectator, Pot } from "@/lib/types/poker";

// ============================================
// SERVER POT FORMAT
// ============================================

export interface ServerPot {
  amount: number;
  eligiblePlayers?: string[];
  contributors?: string[];
}

// ============================================
// GAME STATE EVENTS
// ============================================

/**
 * Game state as received from the server
 * Uses server pot format which is normalized by the client
 */
export interface GameStateEvent extends Omit<GameState, 'pots' | 'phase'> {
  // Server sends pots in a different format than the client expects
  pots?: ServerPot[];
  // Server may send phase as any string
  phase?: "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown" | "complete" | string;
}

/**
 * Sync game event sent after reconnection
 */
export type SyncGameEvent = GameStateEvent;

// ============================================
// TIMER EVENTS
// ============================================

export interface TurnTimerStartedEvent {
  deadline: number; // Unix timestamp in milliseconds
  duration: number; // Duration in seconds
  activeSeat: number; // Seat number of the player whose turn it is
}

export interface TimeoutEvent {
  seconds: number; // Seconds remaining before auto-fold
}

// ============================================
// PLAYER STATUS EVENTS
// ============================================

export type PlayerStatusType =
  | "ACTIVE"
  | "WAITING_FOR_NEXT_HAND"
  | "DISCONNECTED"
  | "LEFT"
  | "REMOVED"
  | "ELIMINATED";

export interface PlayerStatusUpdateEvent {
  playerId: string;
  status: PlayerStatusType;
  action?: string; // Optional action taken (e.g., "FOLD")
  timestamp?: number;
  message?: string;
  seat?: number;
  chips?: number;
}

export interface PlayerMovedToSpectatorEvent {
  gameId: string;
  playerId: string;
  playerName: string;
  seat: number;
  reason: string;
}

export interface PlayerEliminatedEvent {
  playerId: string;
}

export interface SeatVacatedEvent {
  seatIndex: number;
}

// ============================================
// STREET & HAND EVENTS
// ============================================

export interface DealStreetEvent {
  cards: string[];
  round: "preflop" | "flop" | "turn" | "river";
  communityCards: string[];
}

export interface HandRunoutEvent {
  winnerId: string;
  board: string[];
}

// ============================================
// GAME LIFECYCLE EVENTS
// ============================================

export interface GameFinishedPayload {
  reason: string;
  winnerId: string | null;
  returnUrl: string;
  timestamp: string;
  stats?: {
    totalHands: number;
    startingStacks: Record<string, number>;
    finalStacks: Record<string, number>;
    chipChanges: Record<string, number>;
    stackHistoryByPlayer: Record<string, Record<number, number>>;
  };
}

export interface GameFinishedEvent {
  gameId?: string;
  reason?: string;
  message?: string;
  payload?: GameFinishedPayload;
  winnerId?: string | null;
  returnUrl?: string;
  timestamp?: string;
  stats?: GameFinishedPayload["stats"];
}

export interface GameEndedEvent {
  message?: string;
  reason?: string;
}

export interface GameReconnectedEvent {
  gameId: string;
  message?: string;
}

export interface NavigateEvent {
  path: string;
}

// ============================================
// QUEUE EVENTS
// ============================================

export interface MatchFoundEvent {
  gameId: string;
}

export interface QueueUpdateEvent {
  position?: number;
  estimatedWait?: number;
  status?: string;
  gameId?: string;
  message?: string;
}

export interface QueueInfoEvent {
  queueType: string;
  count: number;
  needed: number;
  target: number;
}

// ============================================
// ERROR EVENTS
// ============================================

export interface SocketErrorEvent {
  error?: string;
  message?: string;
}

// ============================================
// PRIVATE GAME EVENTS
// ============================================

export interface PrivateGameStateEvent extends GameState {
  isPrivate: boolean;
  hostId: string;
  isPaused: boolean;
  pendingRequests: PendingJoinRequest[];
  spectators: GameSpectator[];
  joinCode?: string;
}

// ============================================
// ACTION PAYLOADS (client to server)
// ============================================

export interface JoinGamePayload {
  gameId: string;
}

export interface PlayerActionPayload {
  gameId: string;
  type: "fold" | "check" | "call" | "bet" | "raise" | "allin" | "reveal";
  amount?: number;
  seat?: number;
  index?: number; // For reveal action
  isAllInCall?: boolean;
}

export interface AdminActionPayload {
  gameId: string;
  type: string;
  [key: string]: unknown;
}

export interface RequestSeatPayload {
  gameId: string;
}

export interface HostSelfSeatPayload {
  gameId: string;
  seatIndex?: number | null;
}

// ============================================
// CALLBACK RESPONSE TYPES
// ============================================

export interface SocketCallbackResponse {
  success?: boolean;
  error?: string | { message?: string; code?: string };
  message?: string;
  data?: unknown;
}

export interface JoinGameResponse extends SocketCallbackResponse {
  gameState?: GameState;
}
