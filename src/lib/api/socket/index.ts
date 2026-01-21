/**
 * Socket module barrel export
 *
 * Main feature hooks:
 * - useOnlineGameSocket: For online multiplayer games
 * - usePrivateGameSocket: For private games with host controls
 * - useQueueSocket: For matchmaking queue
 *
 * Existing exports:
 * - useSocket, getSocket: From client.ts
 * - useTournamentSocket, useTournamentEvents: From tournament.ts
 */

// Feature hooks
export { useOnlineGameSocket } from "./game";
export type {
  UseOnlineGameSocketOptions,
  UseOnlineGameSocketReturn,
} from "./game";

export { usePrivateGameSocket } from "./private";
export type {
  UsePrivateGameSocketOptions,
  UsePrivateGameSocketReturn,
} from "./private";

export { useQueueSocket } from "./queue";
export type {
  QueueStatus,
  UseQueueSocketOptions,
  UseQueueSocketReturn,
} from "./queue";

// Base hooks
export {
  useGameSocket,
  useGameState,
  useGameEvents,
  useTurnTimer,
  useDisconnectTimers,
} from "./hooks";

// Re-export existing functionality
export {
  getSocket,
  useSocket,
  disconnectSocket,
  isSocketConnected,
  checkActiveStatus,
  useActiveStatus,
} from "./client";

export { useTournamentSocket, useTournamentEvents } from "./tournament";

// Types
export type * from "./types";

// Utilities
export * from "./utils";
