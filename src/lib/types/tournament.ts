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

// Tournament Status Object (runtime state)
export interface TournamentStatusInfo {
  tournamentId: string;
  status: TournamentStatusType;
  currentBlindLevel: number;
  levelEndsAt: string | null;
  tableCount: number;
  totalPlayers: number;
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
  user_id: string;
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
  // Aliases for compatibility
  userId?: string;
  fromTableId?: string;
  toTableId?: string;
  newTableId?: string;
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

// Full State Event
export interface TournamentStateEvent {
  tournamentId: string;
  tournament: TournamentData | Tournament;
  participants: TournamentPlayer[] | Participant[];
  tables: TournamentTableInfo[] | TableState[];
  status: TournamentStatusInfo | TournamentStatusType;
  hostId: string;
  canRegister?: boolean;
  timestamp: string;
}

// ============================================
// LEGACY/COMPATIBILITY TYPES (for existing code)
// ============================================

// Tournament interface with both snake_case and camelCase for compatibility
export interface Tournament {
  // Primary fields (snake_case from backend)
  id?: string;
  host_id?: string;
  title?: string;
  description?: string | null;
  status?: TournamentStatusType;
  max_players?: number | null;
  max_players_per_table?: number;
  starting_stack?: number;
  blind_structure_template?: BlindLevel[];
  blind_level_duration_minutes?: number;
  current_blind_level?: number;
  level_ends_at?: string | null;
  created_at?: string;
  started_at?: string | null;
  ended_at?: string | null;
  updated_at?: string;

  // Compatibility aliases (camelCase)
  tournamentId?: string;
  hostId?: string;
  name?: string;
  maxPlayers?: number;
  maxPlayersPerTable?: number;
  startingStack?: number;
  blindStructureTemplate?: BlindLevel[];
  blindLevelDurationMinutes?: number;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;

  // Legacy config object (deprecated)
  config?: {
    startingStack?: number;
    blinds?: { small: number; big: number };
    maxPlayers?: number;
    minPlayers?: number;
    maxPlayersPerTable?: number;
  };
}

// TournamentPlayer - Legacy compatibility
export interface TournamentPlayer {
  // Backend snake_case
  id?: string;
  user_id?: string;
  tournament_id?: string;
  current_table_id?: string | null;
  current_game_id?: string | null;
  current_stack?: number | null;
  current_seat?: number | null;
  eliminated_at?: string | null;
  final_chips?: number | null;

  // Compatibility camelCase
  userId?: string;
  tableId?: string;
  gameId?: string;
  username?: string;
  chips?: number;
  position?: number;
  eliminatedAt?: string;
  rebuyCount?: number;
  status?: ParticipantStatus;
  profiles?: {
    username: string;
  };
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

// TournamentStateResponse - Legacy compatibility for existing pages
export interface TournamentStateResponse {
  tournament: Tournament;
  participants: TournamentPlayer[];
  tables: TournamentTableInfo[];
  status: TournamentStatusType | TournamentStatusInfo;
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
