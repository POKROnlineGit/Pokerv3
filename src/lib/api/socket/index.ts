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

// NOTE: Club socket hooks have been migrated to HTTP API
// Use useClubApi and useClubRealtime from '@/lib/api/http' instead
// The socket-based club hooks are deprecated and will be removed

// Types
export type * from "./types";

// Utilities
export * from "./utils";
