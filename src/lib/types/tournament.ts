export type TournamentStatus =
  | "setup" // Initial state, host configuring
  | "registration" // Registration open, players can join
  | "active" // Tournament running, tables active
  | "paused" // Temporarily paused
  | "completed" // Tournament finished
  | "cancelled"; // Tournament cancelled

export type TournamentAdminActionType =
  | "UPDATE_SETTINGS" // Update tournament settings during setup
  | "OPEN_REGISTRATION" // setup → registration
  | "START_TOURNAMENT" // registration → active
  | "PAUSE_TOURNAMENT" // active → paused
  | "RESUME_TOURNAMENT" // paused → active
  | "CANCEL_TOURNAMENT"; // any → cancelled

export interface Tournament {
  id?: string; // Backend uses 'id', but we also support 'tournamentId' for compatibility
  tournamentId?: string; // For compatibility with existing code
  host_id: string; // Backend snake_case
  hostId?: string; // For compatibility
  title?: string; // Backend uses 'title'
  name?: string; // For compatibility
  description?: string | null;
  status: TournamentStatus;
  max_players?: number | null; // Backend snake_case
  maxPlayers?: number; // For compatibility
  max_players_per_table?: number; // Backend snake_case
  maxPlayersPerTable?: number; // For compatibility
  starting_stack?: number; // Backend snake_case
  startingStack?: number; // For compatibility
  blind_structure_template?: Array<{ small: number; big: number }>; // Backend snake_case
  blindStructureTemplate?: Array<{ small: number; big: number }>; // For compatibility
  blind_level_duration_minutes?: number; // Backend snake_case
  blindLevelDurationMinutes?: number; // For compatibility
  current_blind_level?: number;
  level_ends_at?: string | null;
  rebuy_count_limit?: number;
  rebuy_window_minutes?: number;
  created_at?: string; // Backend snake_case
  createdAt?: string; // For compatibility
  started_at?: string | null; // Backend snake_case
  startedAt?: string; // For compatibility
  ended_at?: string | null; // Backend snake_case
  finishedAt?: string; // For compatibility
  paused_at?: string | null;
  pausedBlindLevel?: number;
  pausedTimeRemaining?: number; // seconds remaining in current blind level
  // Legacy config object (may not be present in backend response)
  config?: {
    startingStack: number;
    blinds: { small: number; big: number };
    maxPlayers: number;
    minPlayers: number;
    maxPlayersPerTable?: number;
    startTime?: string;
    blindLevels?: Array<{
      level: number;
      small: number;
      big: number;
      duration: number;
    }>;
  };
  registeredPlayers?: number;
  currentPlayers?: number;
  tables?: Array<{
    tableId: string;
    gameId: string;
    players: number;
    maxPlayers: number;
  }>;
  prizePool?: number;
}

export interface TournamentPlayer {
  userId: string;
  username: string;
  chips: number;
  position: number; // Current position/rank
  tableId?: string;
  gameId?: string;
  eliminatedAt?: string;
  rebuyCount?: number;
}

export interface TournamentLeaderboard {
  tournamentId: string;
  players: TournamentPlayer[];
  totalPlayers: number;
  currentPlayers: number;
  prizePool: number;
  payouts?: Array<{
    position: number;
    amount: number;
  }>;
}

// Raw response from backend get_tournament_state
export interface TournamentStateResponse {
  tournament: Tournament;
  participants: TournamentPlayer[]; // Array of registered/active players
  tables: Array<{
    tableId: string;
    gameId: string;
    players: number;
    maxPlayers: number;
  }>;
  status: TournamentStatus;
  hostId: string;
  canRegister?: boolean; // Whether the current user can register
}

// Computed state for frontend use
export interface TournamentState {
  tournament: Tournament;
  participants: TournamentPlayer[];
  tables: Array<{
    tableId: string;
    gameId: string;
    players: number;
    maxPlayers: number;
  }>;
  status: TournamentStatus;
  hostId: string;
  // Computed fields
  currentPlayer?: TournamentPlayer;
  isRegistered: boolean;
  isHost: boolean;
  canRegister: boolean;
  canUnregister: boolean;
  canStart: boolean; // Host can start tournament
  canPause: boolean; // Host can pause tournament
  canResume: boolean; // Host can resume tournament
  canCancel: boolean; // Host can cancel tournament
}
