// Tournament Status Types
export type TournamentStatusType =
  | "setup" // Initial state, host configuring
  | "registration" // Registration open, players can join
  | "active" // Tournament running, tables active
  | "paused" // Temporarily paused
  | "completed" // Tournament finished
  | "cancelled"; // Tournament cancelled

// Participant Status Types
export type ParticipantStatus =
  | "registered" // Signed up, waiting for tournament to start
  | "active" // Playing in tournament
  | "eliminated" // Busted out
  | "transferred"; // Being moved to another table

// Admin Action Types
export type TournamentAdminActionType =
  | "UPDATE_SETTINGS" // Update tournament settings during setup
  | "OPEN_REGISTRATION" // setup → registration
  | "START_TOURNAMENT" // registration → active
  | "PAUSE_TOURNAMENT" // active → paused
  | "RESUME_TOURNAMENT" // paused → active
  | "CANCEL_TOURNAMENT" // any → cancelled
  | "REGISTER_PLAYER" // Host registers another player
  | "TRANSFER_PLAYER" // Manual player transfer
  | "BAN_PLAYER"; // Host bans a player

// Blind Level
export interface BlindLevel {
  small: number;
  big: number;
}

// Tournament Data (matches database)
export interface TournamentData {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  max_players: number | null;
  max_players_per_table: number;
  starting_stack: number;
  blind_structure_template: BlindLevel[];
  blind_level_duration_minutes: number;
  status: TournamentStatusType;
  current_blind_level: number;
  level_ends_at: string | null;
  started_at: string | null;
  created_at: string;
  updated_at: string;
}

// Tournament Status Object (runtime state) - detailed info separate from status string
export interface TournamentStatusInfo {
  currentBlindLevel: number;
  levelEndsAt: string | null;
  totalPlayers: number;
  activePlayers: number;
  tableCount: number;
}

/**
 * Type guard to check if status is TournamentStatusInfo (object) vs TournamentStatusType (string)
 */
export function isStatusInfo(status: TournamentStatusType | TournamentStatusInfo): status is TournamentStatusInfo {
  return typeof status === "object" && status !== null && "currentBlindLevel" in status;
}

/**
 * Extract status string from either format
 */
export function getStatusString(status: TournamentStatusType | TournamentStatusInfo | undefined, fallback: TournamentStatusType = "registration"): TournamentStatusType {
  if (!status) return fallback;
  if (typeof status === "string") return status;
  // If it's an object with a nested status property (legacy format)
  if ("status" in status && typeof (status as Record<string, unknown>).status === "string") {
    return (status as Record<string, unknown>).status as TournamentStatusType;
  }
  return fallback;
}

/**
 * Extract status info from response, handling both formats
 */
export function getStatusInfo(response: { status?: TournamentStatusType | TournamentStatusInfo; statusInfo?: TournamentStatusInfo }): TournamentStatusInfo | null {
  // Prefer explicit statusInfo field
  if (response.statusInfo) return response.statusInfo;
  // Fall back to status if it's an object
  if (response.status && isStatusInfo(response.status)) return response.status;
  return null;
}

// Participant (matches database + profiles join)
export interface Participant {
  id: string; // Participant record ID
  user_id: string; // User's UUID
  tournament_id: string;
  status: ParticipantStatus;
  current_stack: number;
  current_table_id: string | null;
  current_seat: number | null;
  eliminated_at: string | null;
  final_chips: number | null;
  profiles?: {
    username: string;
  };
}

// Table Player (simplified player info for table state)
export interface TablePlayer {
  id: string;
  seat: number;
  chips: number;
  status: string;
}

// Table State
export interface TableState {
  tableId: string;
  status: string;
  currentPhase: string;
  playerCount: number;
  activePlayerCount: number;
  smallBlind: number;
  bigBlind: number;
  handNumber: number;
  isPaused: boolean;
  tournamentId: string;
  tournamentTableIndex: number;
  players: TablePlayer[];
}

// Tournament State (full state from get_tournament_state)
export interface TournamentState {
  tournament: TournamentData;
  participants: Participant[];
  tables: TableState[];
  status: TournamentStatusInfo;
  hostId: string;
  canRegister: boolean;
}

// Leaderboard Entry
export interface LeaderboardEntry {
  rank: number;
  odanUserId: string;
  username: string;
  chips: number;
  status: ParticipantStatus;
  tableId?: string;
}

// Tournament Leaderboard
export interface TournamentLeaderboard {
  tournamentId: string;
  leaderboard: LeaderboardEntry[];
  totalPlayers: number;
  activePlayers: number;
}

// Settings for UPDATE_SETTINGS action
export interface TournamentSettings {
  maxPlayers?: number;
  maxPlayersPerTable?: number;
  startingStack?: number;
  blindStructureTemplate?: BlindLevel[];
  blindLevelDurationMinutes?: number;
}

// ============================================
// EVENT PAYLOAD TYPES
// ============================================

// Status & Registration Events
export interface TournamentStatusChangedEvent {
  tournamentId: string;
  status: TournamentStatusType;
  previousStatus: TournamentStatusType;
  timestamp: string;
}

export interface TournamentPlayerRegisteredEvent {
  tournamentId: string;
  playerId: string;
  participantCount: number;
  timestamp: string;
}

export interface TournamentPlayerUnregisteredEvent {
  tournamentId: string;
  playerId: string;
  participantCount: number;
  timestamp: string;
}

export interface TournamentParticipantCountChangedEvent {
  tournamentId: string;
  participantCount: number;
  timestamp: string;
}

// Tournament Gameplay Events
export interface TournamentBlindLevelAdvancedEvent {
  tournamentId: string;
  level: number; // 0-indexed
  smallBlind: number;
  bigBlind: number;
  levelEndsAt: string; // ISO timestamp when this level ends
  timestamp: string;
}

export interface TournamentLevelWarningEvent {
  tournamentId: string;
  timeRemainingMs: number; // Milliseconds until next level
  currentLevel: number;
  timestamp: string;
}

export interface TournamentPlayerEliminatedEvent {
  tournamentId: string;
  playerId: string;
  tableId: string;
  finishPosition: number;
  prizeAmount?: number;
  timestamp: string;
}

export interface TournamentPlayerTransferredEvent {
  tournamentId: string;
  playerId: string;
  sourceTableId: string;
  targetTableId: string;
  targetSeat: number;
  timestamp: string;
}

export interface TournamentTablesBalancedEvent {
  tournamentId: string;
  timestamp: string;
}

export interface TournamentTablesMergedEvent {
  tournamentId: string;
  closedTableId: string;
  targetTableId: string;
  timestamp: string;
}

export interface TournamentCompletedEvent {
  tournamentId: string;
  winnerId: string;
  winnerUsername?: string | null;
  results: Array<{
    playerId: string;
    position: number;
    prize?: number;
  }>;
  timestamp: string;
}

export interface TournamentCancelledEvent {
  tournamentId: string;
  reason: string;
  timestamp: string;
}

export interface TournamentPlayerBannedEvent {
  tournamentId: string;
  playerId: string;
  reason?: string;
  wasActive: boolean;
  tableId?: string | null;
  participantCount: number;
  timestamp: string;
}

export interface TournamentPlayerLeftEvent {
  tournamentId: string;
  playerId: string;
  wasActive: boolean;
  tableId?: string | null;
  participantCount: number;
  timestamp: string;
}

// Reconnection Payloads
export interface TournamentReconnectedPayload {
  tournamentId: string;
  status: "registration" | "active" | "paused";
  title: string;
  currentTableId: string | null;
  isPlaying: boolean;
  message: string;
}

export interface GameReconnectedPayload {
  gameId: string;
  tournamentId: string | null;
  message: string;
}

// Check Tournament Status Response
export interface TournamentStatusCheckResponse {
  inTournament: boolean;
  tournamentId: string | null;
  status: string | null;
  title: string | null;
  currentTableId: string | null;
  isPlaying: boolean;
}

// Tournament Event Types (for tournamentEvent wrapper)
export type TournamentEventType =
  | "TOURNAMENT_BLIND_LEVEL_ADVANCED"
  | "TOURNAMENT_PLAYER_ELIMINATED"
  | "TOURNAMENT_PLAYER_TRANSFERRED"
  | "TOURNAMENT_TABLES_BALANCED"
  | "TOURNAMENT_TABLES_MERGED"
  | "TOURNAMENT_LEVEL_WARNING"
  | "TOURNAMENT_STATUS_CHANGED"
  | "TOURNAMENT_PLAYER_REGISTERED"
  | "TOURNAMENT_PLAYER_UNREGISTERED"
  | "TOURNAMENT_PARTICIPANT_COUNT_CHANGED"
  | "TOURNAMENT_COMPLETED"
  | "TOURNAMENT_CANCELLED"
  | "TOURNAMENT_PLAYER_BANNED"
  | "TOURNAMENT_PLAYER_LEFT";

// Full State Event (from tournamentState socket event)
export interface TournamentStateEvent {
  tournamentId: string;
  tournament: TournamentData;
  participants: Participant[];
  tables: TournamentTableInfo[] | TableState[];
  status: TournamentStatusInfo | TournamentStatusType;
  hostId: string;
  canRegister?: boolean;
  timestamp: string;
}

// ============================================
// LEGACY/COMPATIBILITY TYPES (for existing code)
// ============================================

// ============================================
// UTILITY FUNCTIONS FOR TYPE NORMALIZATION
// ============================================

/**
 * Normalize participant data from backend (handles both snake_case and camelCase)
 * Use this when receiving participant data from socket or API
 */
export function normalizeParticipant(p: Participant | TournamentData | Record<string, unknown>): NormalizedParticipant {
  const raw = p as Record<string, unknown>;
  return {
    id: (raw.id as string) || "",
    odanUserId: (raw.user_id as string) || (raw.userId as string) || (raw.odanUserId as string) || "",
    odanTournamentId: (raw.tournament_id as string) || (raw.tournamentId as string) || (raw.odanTournamentId as string) || "",
    status: (raw.status as ParticipantStatus) || "registered",
    currentStack: (raw.current_stack as number) ?? (raw.currentStack as number) ?? 0,
    currentTableId: (raw.current_table_id as string | null) ?? (raw.currentTableId as string | null) ?? (raw.tableId as string | null) ?? null,
    currentSeat: (raw.current_seat as number | null) ?? (raw.currentSeat as number | null) ?? null,
    eliminatedAt: (raw.eliminated_at as string | null) ?? (raw.eliminatedAt as string | null) ?? null,
    finalChips: (raw.final_chips as number | null) ?? (raw.finalChips as number | null) ?? null,
    username: (raw.username as string) || (raw.profiles as { username: string })?.username || "Unknown",
  };
}

/**
 * Normalize tournament data from backend
 */
export function normalizeTournament(t: TournamentData | Record<string, unknown>): NormalizedTournament {
  const raw = t as Record<string, unknown>;
  return {
    id: (raw.id as string) || "",
    hostId: (raw.host_id as string) || (raw.hostId as string) || "",
    title: (raw.title as string) || (raw.name as string) || "",
    description: (raw.description as string | null) ?? null,
    maxPlayers: (raw.max_players as number | null) ?? (raw.maxPlayers as number | null) ?? null,
    maxPlayersPerTable: (raw.max_players_per_table as number) ?? (raw.maxPlayersPerTable as number) ?? 9,
    startingStack: (raw.starting_stack as number) ?? (raw.startingStack as number) ?? 0,
    blindStructureTemplate: (raw.blind_structure_template as BlindLevel[]) || (raw.blindStructureTemplate as BlindLevel[]) || [],
    blindLevelDurationMinutes: (raw.blind_level_duration_minutes as number) ?? (raw.blindLevelDurationMinutes as number) ?? 10,
    status: (raw.status as TournamentStatusType) || "setup",
    currentBlindLevel: (raw.current_blind_level as number) ?? (raw.currentBlindLevel as number) ?? 0,
    levelEndsAt: (raw.level_ends_at as string | null) ?? (raw.levelEndsAt as string | null) ?? null,
    startedAt: (raw.started_at as string | null) ?? (raw.startedAt as string | null) ?? null,
    createdAt: (raw.created_at as string) || (raw.createdAt as string) || "",
    updatedAt: (raw.updated_at as string) || (raw.updatedAt as string) || "",
  };
}

// ============================================
// NORMALIZED TYPES (use these in components)
// ============================================

/**
 * Normalized participant - use this in components after calling normalizeParticipant()
 */
export interface NormalizedParticipant {
  id: string;
  odanUserId: string;
  odanTournamentId: string;
  status: ParticipantStatus;
  currentStack: number;
  currentTableId: string | null;
  currentSeat: number | null;
  eliminatedAt: string | null;
  finalChips: number | null;
  username: string;
}

/**
 * Normalized tournament - use this in components after calling normalizeTournament()
 */
export interface NormalizedTournament {
  id: string;
  hostId: string;
  title: string;
  description: string | null;
  maxPlayers: number | null;
  maxPlayersPerTable: number;
  startingStack: number;
  blindStructureTemplate: BlindLevel[];
  blindLevelDurationMinutes: number;
  status: TournamentStatusType;
  currentBlindLevel: number;
  levelEndsAt: string | null;
  startedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Table Info - flexible to accommodate both simple and full table states
export interface TournamentTableInfo {
  tableId: string;
  gameId?: string;
  players?: number | TablePlayer[];
  maxPlayers?: number;
  status?: string;
  currentPhase?: string;
  playerCount?: number;
  activePlayerCount?: number;
  smallBlind?: number;
  bigBlind?: number;
  handNumber?: number;
  isPaused?: boolean;
  tournamentId?: string;
  tournamentTableIndex?: number;
}

// TournamentStateResponse - Response from get_tournament_state
// Note: tournament and participants come as raw database format (snake_case)
// Use normalizeTournament() and normalizeParticipant() to convert
export interface TournamentStateResponse {
  /** Tournament ID (may be included in broadcast events) */
  tournamentId?: string;
  tournament: TournamentData;
  participants: Participant[];
  tables: TournamentTableInfo[] | TableState[];
  /** Status string (preferred) or legacy object format */
  status: TournamentStatusType | TournamentStatusInfo;
  /** Detailed status info (new format from backend) */
  statusInfo?: TournamentStatusInfo;
  hostId: string;
  canRegister?: boolean;
  timestamp?: string;
}

// ============================================
// Active Status Check Types (consolidated check)
// ============================================

export interface ActiveStatusGameInfo {
  gameId: string;
  isTournament: boolean;
  tournamentId: string | null;
  status: "active" | "starting" | "waiting";
}

export interface ActiveStatusTournamentInfo {
  tournamentId: string;
  title: string;
  status: "setup" | "registration" | "active" | "paused";
  isHost: boolean;
  isParticipant: boolean;
  participantStatus: "registered" | "active" | null;
  tableId: string | null; // Only set when in active tournament game
}

export interface ActiveStatusQueueInfo {
  queueType: string;
  position: number;
  joinedAt: number;
}

export interface ActiveStatusResponse {
  game: ActiveStatusGameInfo | null;
  tournament: ActiveStatusTournamentInfo | null;
  queue: ActiveStatusQueueInfo | null;
  error?: string;
}

// ============================================
// TOURNAMENT RESULTS TYPES
// ============================================

export interface TournamentResultsResponse {
  tournament: {
    id: string;
    title: string;
    status: string;
    hostId: string;
    startedAt: string | null;
    endedAt: string | null;
    startingStack: number;
    maxPlayers: number;
  };
  participants: TournamentResultParticipant[];
  isEnded: boolean;
}

export interface TournamentResultParticipant {
  odanUserId: string;
  username: string;
  placement: number | null;
  finalStack: number;
  status: string;
  eliminatedAt: string | null;
  rebuyCount: number;
}

// ============================================
// SOCKET CALLBACK RESPONSE TYPES
// ============================================

/**
 * Base response type for socket callbacks
 */
export interface SocketCallbackResponse {
  success?: boolean;
  // Backward-compatible: older handlers returned `error` as a string.
  // New standardized socket responses return `error` as an object.
  error?: string | { code?: string; message?: string };
  // New standardized socket responses wrap payloads in `data`
  data?: unknown;
}

/**
 * Create tournament callback response
 */
export interface CreateTournamentResponse extends SocketCallbackResponse {
  tournamentId?: string;
}

/**
 * Register/Unregister tournament callback response
 */
export interface TournamentRegistrationResponse extends SocketCallbackResponse {
  // success or error only
}

/**
 * Admin action callback response
 */
export interface TournamentAdminActionResponse extends SocketCallbackResponse {
  // success or error only
}

/**
 * Get tournament state callback response
 */
export interface GetTournamentStateResponse extends SocketCallbackResponse {
  tournament?: TournamentData;
  participants?: Participant[];
  tables?: TournamentTableInfo[] | TableState[];
  status?: TournamentStatusType | TournamentStatusInfo;
  statusInfo?: TournamentStatusInfo;
  hostId?: string;
  canRegister?: boolean;
}

/**
 * Get tournament results callback response
 */
export interface GetTournamentResultsResponse extends SocketCallbackResponse {
  tournament?: TournamentResultsResponse["tournament"];
  participants?: TournamentResultParticipant[];
  isEnded?: boolean;
}

/**
 * Join tournament room callback response
 */
export interface JoinTournamentRoomResponse extends SocketCallbackResponse {
  // success or error only
}

/**
 * Leave tournament room callback response
 */
export interface LeaveTournamentRoomResponse extends SocketCallbackResponse {
  // success or error only
}

/**
 * Join/Leave game callback response
 */
export interface GameRoomResponse extends SocketCallbackResponse {
  // success or error only
}

/**
 * Get game state callback response
 */
export interface GetGameStateResponse extends SocketCallbackResponse {
  gameState?: import("./poker").GameState;
}

/**
 * Tournament spectate room callback response
 */
export interface SpectatorRoomResponse extends SocketCallbackResponse {
  // success or error only
}
