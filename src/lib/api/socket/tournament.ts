"use client";

import { useSocket } from "./client";
import { useCallback, useEffect, useState } from "react";
import {
  TournamentState,
  TournamentStateResponse,
  TournamentLeaderboard,
  TournamentAdminActionType,
  TournamentSettings,
  TournamentStatusChangedEvent,
  TournamentPlayerRegisteredEvent,
  TournamentPlayerUnregisteredEvent,
  TournamentParticipantCountChangedEvent,
  TournamentBlindLevelAdvancedEvent,
  TournamentPlayerEliminatedEvent,
  TournamentPlayerTransferredEvent,
  TournamentTablesBalancedEvent,
  TournamentTablesMergedEvent,
  TournamentLevelWarningEvent,
  TournamentCompletedEvent,
  TournamentCancelledEvent,
  TournamentPlayerBannedEvent,
  TournamentPlayerLeftEvent,
  TournamentStateEvent,
  TournamentStatusType,
  Tournament,
} from "@/lib/types/tournament";

/**
 * Hook for tournament socket operations
 * Provides all emit functions for tournament management
 */
export function useTournamentSocket() {
  const socket = useSocket();

  // ============================================
  // TOURNAMENT MANAGEMENT
  // ============================================

  /**
   * Create a new tournament
   * Host is automatically joined to tournament room
   */
  const createTournament = useCallback(
    (payload: {
      title: string;
      description?: string;
    }): Promise<{ tournamentId: string } | { error: string }> => {
      return new Promise((resolve) => {
        if (!socket.connected) socket.connect();

        socket.emit("create_tournament", payload, (response: any) => {
          resolve(response);
        });
      });
    },
    [socket]
  );

  /**
   * Tournament admin actions (host only)
   * - UPDATE_SETTINGS: Update tournament configuration (only in setup status)
   * - OPEN_REGISTRATION: Move from setup to registration status
   * - START_TOURNAMENT: Start the tournament (creates tables, assigns players)
   * - PAUSE_TOURNAMENT: Pause the tournament
   * - RESUME_TOURNAMENT: Resume paused tournament
   * - CANCEL_TOURNAMENT: Cancel the tournament
   * - REGISTER_PLAYER: Host can register another player
   * - TRANSFER_PLAYER: Manually transfer player between tables
   */
  const tournamentAdminAction = useCallback(
    (
      tournamentId: string,
      actionType: TournamentAdminActionType,
      data?: Record<string, any>
    ): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        if (!socket.connected) socket.connect();

        // Validate payload before sending
        if (!tournamentId || typeof tournamentId !== "string") {
          resolve({ error: "Tournament ID is required" });
          return;
        }

        if (!actionType || typeof actionType !== "string") {
          resolve({ error: "Admin action type is required" });
          return;
        }

        // For UPDATE_SETTINGS, validate settings object
        if (actionType === "UPDATE_SETTINGS") {
          if (!data?.settings || typeof data.settings !== "object") {
            resolve({
              error: "Settings object is required for UPDATE_SETTINGS action",
            });
            return;
          }
        }

        // For REGISTER_PLAYER, validate playerId
        if (actionType === "REGISTER_PLAYER") {
          if (!data?.playerId) {
            resolve({
              error: "Player ID is required for REGISTER_PLAYER action",
            });
            return;
          }
        }

        // For TRANSFER_PLAYER, validate required fields
        if (actionType === "TRANSFER_PLAYER") {
          if (!data?.playerId || !data?.sourceTableId || !data?.targetTableId) {
            resolve({
              error:
                "Player ID, source table ID, and target table ID are required for TRANSFER_PLAYER action",
            });
            return;
          }
        }

        const payload = {
          tournamentId,
          type: actionType,
          ...data,
        };

        socket.emit("tournament_admin_action", payload, (response: any) => {
          if (response?.error) {
            resolve({ error: response.error });
          } else {
            resolve({ success: true });
          }
        });
      });
    },
    [socket]
  );

  /**
   * Update tournament settings (convenience wrapper for UPDATE_SETTINGS action)
   */
  const updateTournamentSettings = useCallback(
    (
      tournamentId: string,
      settings: TournamentSettings
    ): Promise<{ success: boolean } | { error: string }> => {
      return tournamentAdminAction(tournamentId, "UPDATE_SETTINGS", {
        settings,
      });
    },
    [tournamentAdminAction]
  );

  /**
   * Host registers another player for the tournament
   */
  const registerPlayerByHost = useCallback(
    (
      tournamentId: string,
      playerId: string
    ): Promise<{ success: boolean } | { error: string }> => {
      return tournamentAdminAction(tournamentId, "REGISTER_PLAYER", {
        playerId,
      });
    },
    [tournamentAdminAction]
  );

  /**
   * Manually transfer a player between tables
   */
  const transferPlayer = useCallback(
    (
      tournamentId: string,
      playerId: string,
      sourceTableId: string,
      targetTableId: string
    ): Promise<{ success: boolean } | { error: string }> => {
      return tournamentAdminAction(tournamentId, "TRANSFER_PLAYER", {
        playerId,
        sourceTableId,
        targetTableId,
      });
    },
    [tournamentAdminAction]
  );

  /**
   * Ban a player from the tournament (host only)
   * Works in both registration and active states
   */
  const banPlayer = useCallback(
    (
      tournamentId: string,
      playerId: string,
      reason?: string
    ): Promise<{ success: boolean } | { error: string }> => {
      return tournamentAdminAction(tournamentId, "BAN_PLAYER", {
        playerId,
        reason,
      });
    },
    [tournamentAdminAction]
  );

  // ============================================
  // PLAYER REGISTRATION
  // ============================================

  /**
   * Register for a tournament
   * Player is automatically joined to tournament room
   */
  const registerTournament = useCallback(
    (
      tournamentId: string
    ): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        if (!socket.connected) socket.connect();

        socket.emit(
          "register_tournament",
          { tournamentId },
          (response: any) => {
            if (response?.error) {
              resolve({ error: response.error });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    },
    [socket]
  );

  /**
   * Unregister from a tournament (only before start)
   */
  const unregisterTournament = useCallback(
    (
      tournamentId: string
    ): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        if (!socket.connected) socket.connect();

        socket.emit(
          "unregister_tournament",
          { tournamentId },
          (response: any) => {
            if (response?.error) {
              resolve({ error: response.error });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    },
    [socket]
  );

  // ============================================
  // STATE QUERIES
  // ============================================

  /**
   * Get complete tournament state
   */
  const getTournamentState = useCallback(
    (
      tournamentId: string
    ): Promise<TournamentStateResponse | { error: string }> => {
      return new Promise((resolve) => {
        if (!socket.connected) socket.connect();

        socket.emit(
          "get_tournament_state",
          { tournamentId },
          (response: any) => {
            if (response?.error) {
              resolve({ error: response.error });
            } else {
              resolve(response);
            }
          }
        );
      });
    },
    [socket]
  );

  /**
   * Get list of active/joinable tournaments
   * @param status Optional filter: "setup", "registration", "active", "paused"
   */
  const getActiveTournaments = useCallback(
    (
      status?: TournamentStatusType
    ): Promise<{ tournaments: Tournament[] } | { error: string }> => {
      return new Promise((resolve) => {
        if (!socket.connected) socket.connect();

        socket.emit("get_active_tournaments", { status }, (response: any) => {
          if (response?.error) {
            resolve({ error: response.error });
          } else {
            resolve(response);
          }
        });
      });
    },
    [socket]
  );

  /**
   * Get sorted leaderboard (by chip count)
   */
  const getTournamentLeaderboard = useCallback(
    (
      tournamentId: string
    ): Promise<TournamentLeaderboard | { error: string }> => {
      return new Promise((resolve) => {
        if (!socket.connected) socket.connect();

        socket.emit(
          "get_tournament_leaderboard",
          { tournamentId },
          (response: any) => {
            if (response?.error) {
              resolve({ error: response.error });
            } else {
              resolve(response);
            }
          }
        );
      });
    },
    [socket]
  );

  // ============================================
  // ROOM MANAGEMENT
  // ============================================

  /**
   * Join tournament room for real-time updates
   */
  const joinTournamentRoom = useCallback(
    (
      tournamentId: string
    ): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        if (!socket.connected) socket.connect();

        socket.emit(
          "join_tournament_room",
          { tournamentId },
          (response: any) => {
            if (response?.error) {
              resolve({ error: response.error });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    },
    [socket]
  );

  /**
   * Leave tournament room when navigating away
   */
  const leaveTournamentRoom = useCallback(
    (
      tournamentId: string
    ): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        if (!socket.connected) socket.connect();

        socket.emit(
          "leave_tournament_room",
          { tournamentId },
          (response: any) => {
            if (response?.error) {
              resolve({ error: response.error });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    },
    [socket]
  );

  // ============================================
  // GAME/TABLE ACTIONS
  // ============================================

  /**
   * Join assigned table when tournament starts
   */
  const joinTable = useCallback(
    (tableId: string): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        if (!socket.connected) socket.connect();

        socket.emit("joinGame", { gameId: tableId }, (response: any) => {
          if (response?.error) {
            resolve({ error: response.error });
          } else {
            resolve({ success: true });
          }
        });
      });
    },
    [socket]
  );

  /**
   * Leave a table
   */
  const leaveTable = useCallback(
    (tableId: string): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        if (!socket.connected) socket.connect();

        socket.emit("leaveGame", { gameId: tableId }, (response: any) => {
          if (response?.error) {
            resolve({ error: response.error });
          } else {
            resolve({ success: true });
          }
        });
      });
    },
    [socket]
  );

  /**
   * Submit poker action (fold, call, raise, etc.)
   */
  const submitAction = useCallback(
    (
      tableId: string,
      action: "fold" | "check" | "call" | "raise" | "all_in",
      amount?: number
    ): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        if (!socket.connected) socket.connect();

        socket.emit(
          "playerAction",
          {
            gameId: tableId,
            action,
            amount,
          },
          (response: any) => {
            if (response?.error) {
              resolve({ error: response.error });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    },
    [socket]
  );

  // ============================================
  // STATUS CHECK
  // ============================================

  /**
   * Check if user is currently in a tournament
   * Returns tournament info if in a tournament
   */
  const checkTournamentStatus = useCallback((): Promise<{
    inTournament: boolean;
    tournamentId: string | null;
    status: string | null;
    title: string | null;
    currentTableId: string | null;
    isPlaying: boolean;
  }> => {
    return new Promise((resolve) => {
      if (!socket.connected) socket.connect();

      socket.emit("check_tournament_status", {}, (response: any) => {
        resolve({
          inTournament: response?.inTournament || false,
          tournamentId: response?.tournamentId || null,
          status: response?.status || null,
          title: response?.title || null,
          currentTableId: response?.currentTableId || null,
          isPlaying: response?.isPlaying || false,
        });
      });
    });
  }, [socket]);

  return {
    // Tournament management
    createTournament,
    tournamentAdminAction,
    updateTournamentSettings,
    registerPlayerByHost,
    transferPlayer,
    banPlayer,

    // Player registration
    registerTournament,
    unregisterTournament,

    // State queries
    getTournamentState,
    getActiveTournaments,
    getTournamentLeaderboard,

    // Room management
    joinTournamentRoom,
    leaveTournamentRoom,

    // Game/table actions
    joinTable,
    leaveTable,
    submitAction,

    // Status check
    checkTournamentStatus,
  };
}

/**
 * Hook to listen for tournament events
 * Automatically joins/leaves tournament room and listens for all tournament events
 */
export function useTournamentEvents(
  tournamentId?: string,
  options?: {
    currentUserId?: string | null;
    onTournamentStarted?: (tournamentId: string) => void;
    onPlayerTransferred?: (data: TournamentPlayerTransferredEvent) => void;
    onTournamentCompleted?: (data: TournamentCompletedEvent) => void;
    onPlayerEliminated?: (data: TournamentPlayerEliminatedEvent) => void;
    onLevelWarning?: (data: TournamentLevelWarningEvent) => void;
    onPlayerBanned?: (data: TournamentPlayerBannedEvent) => void;
    onPlayerLeft?: (data: TournamentPlayerLeftEvent) => void;
  }
) {
  const socket = useSocket();
  const {
    currentUserId,
    onTournamentStarted,
    onPlayerTransferred,
    onTournamentCompleted,
    onPlayerEliminated,
    onLevelWarning,
    onPlayerBanned,
    onPlayerLeft,
  } = options || {};

  // State for real-time updates
  const [tournamentState, setTournamentState] =
    useState<TournamentStateResponse | null>(null);
  const [statusChange, setStatusChange] =
    useState<TournamentStatusChangedEvent | null>(null);
  const [participantCount, setParticipantCount] = useState<number | null>(null);
  const [blindLevel, setBlindLevel] =
    useState<TournamentBlindLevelAdvancedEvent | null>(null);
  const [playerEliminated, setPlayerEliminated] =
    useState<TournamentPlayerEliminatedEvent | null>(null);
  const [tablesMerged, setTablesMerged] =
    useState<TournamentTablesMergedEvent | null>(null);
  const [levelWarning, setLevelWarning] =
    useState<TournamentLevelWarningEvent | null>(null);
  const [tournamentStarted, setTournamentStarted] = useState<boolean>(false);
  const [tournamentCompleted, setTournamentCompleted] =
    useState<TournamentCompletedEvent | null>(null);
  const [tournamentCancelled, setTournamentCancelled] =
    useState<TournamentCancelledEvent | null>(null);
  const [playerBanned, setPlayerBanned] =
    useState<TournamentPlayerBannedEvent | null>(null);
  const [playerLeft, setPlayerLeft] =
    useState<TournamentPlayerLeftEvent | null>(null);

  useEffect(() => {
    if (!tournamentId) return;

    // Ensure socket is connected
    if (!socket.connected) {
      socket.connect();
    }

    // Join tournament room when connected
    const joinRoom = () => {
      socket.emit("join_tournament_room", { tournamentId }, (response: any) => {
        if (response?.error) {
          console.error("[Tournament] Failed to join room:", response.error);
        }
      });
    };

    // Join room immediately if already connected, otherwise wait for connection
    if (socket.connected) {
      joinRoom();
    } else {
      socket.once("connect", joinRoom);
    }

    // ============================================
    // STATUS & REGISTRATION EVENTS
    // ============================================

    const handleStatusChanged = (data: TournamentStatusChangedEvent) => {
      if (data.tournamentId === tournamentId) {
        setStatusChange(data);
        // Handle tournament start: registration → active
        if (
          data.status === "active" &&
          data.previousStatus === "registration"
        ) {
          setTournamentStarted(true);
          onTournamentStarted?.(data.tournamentId);
        }
      }
    };

    const handlePlayerRegistered = (data: TournamentPlayerRegisteredEvent) => {
      if (data.tournamentId === tournamentId) {
        setParticipantCount(data.participantCount);
      }
    };

    const handlePlayerUnregistered = (
      data: TournamentPlayerUnregisteredEvent
    ) => {
      if (data.tournamentId === tournamentId) {
        setParticipantCount(data.participantCount);
      }
    };

    const handleParticipantCountChanged = (
      data: TournamentParticipantCountChangedEvent
    ) => {
      if (data.tournamentId === tournamentId) {
        setParticipantCount(data.participantCount);
      }
    };

    // ============================================
    // TOURNAMENT GAMEPLAY EVENTS
    // ============================================

    const handleBlindLevelAdvanced = (
      data: TournamentBlindLevelAdvancedEvent
    ) => {
      if (data.tournamentId === tournamentId) {
        setBlindLevel(data);
      }
    };

    const handleLevelWarning = (data: TournamentLevelWarningEvent) => {
      if (data.tournamentId === tournamentId) {
        setLevelWarning(data);
        onLevelWarning?.(data);
      }
    };

    const handlePlayerEliminated = (data: TournamentPlayerEliminatedEvent) => {
      if (data.tournamentId === tournamentId) {
        setPlayerEliminated(data);
        onPlayerEliminated?.(data);
      }
    };

    const handlePlayerTransferred = (
      data: TournamentPlayerTransferredEvent
    ) => {
      if (data.tournamentId === tournamentId) {
        // Normalize the playerId field
        const playerId = data.playerId || data.userId;
        // Check if this is the current user being transferred
        if (currentUserId && playerId === currentUserId) {
          onPlayerTransferred?.(data);
        }
      }
    };

    const handleTablesBalanced = (data: TournamentTablesBalancedEvent) => {
      if (data.tournamentId === tournamentId) {
        // Server will send tournamentState event after balancing
      }
    };

    const handleTablesMerged = (data: TournamentTablesMergedEvent) => {
      if (data.tournamentId === tournamentId) {
        setTablesMerged(data);
      }
    };

    const handleTournamentCompleted = (data: TournamentCompletedEvent) => {
      if (data.tournamentId === tournamentId) {
        setTournamentCompleted(data);
        onTournamentCompleted?.(data);
      }
    };

    const handleTournamentCancelled = (data: TournamentCancelledEvent) => {
      if (data.tournamentId === tournamentId) {
        setTournamentCancelled(data);
      }
    };

    const handlePlayerBanned = (data: TournamentPlayerBannedEvent) => {
      if (data.tournamentId === tournamentId) {
        setPlayerBanned(data);
        setParticipantCount(data.participantCount);
        onPlayerBanned?.(data);
      }
    };

    const handlePlayerLeft = (data: TournamentPlayerLeftEvent) => {
      if (data.tournamentId === tournamentId) {
        setPlayerLeft(data);
        setParticipantCount(data.participantCount);
        onPlayerLeft?.(data);
      }
    };

    // ============================================
    // STATE BROADCAST EVENT (SOURCE OF TRUTH)
    // ============================================

    const handleTournamentState = (data: TournamentStateEvent) => {
      if (data.tournamentId === tournamentId) {
        // Full state refresh - SERVER IS THE SOURCE OF TRUTH
        setTournamentState({
          tournament: data.tournament,
          participants: data.participants,
          tables: data.tables,
          status: data.status,
          hostId: data.hostId,
          canRegister: data.canRegister,
          timestamp: data.timestamp,
        });
        // Reset incremental state
        setParticipantCount(data.participants.length);
        setBlindLevel(null);
        setPlayerEliminated(null);
        setTablesMerged(null);
        setLevelWarning(null);
      }
    };

    // ============================================
    // ERROR EVENT
    // ============================================

    const handleError = (error: { message?: string; tournamentId?: string }) => {
      if (!error.tournamentId || error.tournamentId === tournamentId) {
        console.error("[Tournament] Error:", error.message);
      }
    };

    // ============================================
    // REGISTER ALL EVENT LISTENERS
    // ============================================

    socket.on("TOURNAMENT_STATUS_CHANGED", handleStatusChanged);
    socket.on("TOURNAMENT_PLAYER_REGISTERED", handlePlayerRegistered);
    socket.on("TOURNAMENT_PLAYER_UNREGISTERED", handlePlayerUnregistered);
    socket.on(
      "TOURNAMENT_PARTICIPANT_COUNT_CHANGED",
      handleParticipantCountChanged
    );
    socket.on("TOURNAMENT_BLIND_LEVEL_ADVANCED", handleBlindLevelAdvanced);
    socket.on("TOURNAMENT_LEVEL_WARNING", handleLevelWarning);
    socket.on("TOURNAMENT_PLAYER_ELIMINATED", handlePlayerEliminated);
    socket.on("TOURNAMENT_PLAYER_TRANSFERRED", handlePlayerTransferred);
    socket.on("TOURNAMENT_TABLES_BALANCED", handleTablesBalanced);
    socket.on("TOURNAMENT_TABLES_MERGED", handleTablesMerged);
    socket.on("TOURNAMENT_COMPLETED", handleTournamentCompleted);
    socket.on("TOURNAMENT_CANCELLED", handleTournamentCancelled);
    socket.on("TOURNAMENT_PLAYER_BANNED", handlePlayerBanned);
    socket.on("TOURNAMENT_PLAYER_LEFT", handlePlayerLeft);
    socket.on("tournamentState", handleTournamentState);
    socket.on("error", handleError);

    // ============================================
    // CLEANUP
    // ============================================

    return () => {
      socket.off("TOURNAMENT_STATUS_CHANGED", handleStatusChanged);
      socket.off("TOURNAMENT_PLAYER_REGISTERED", handlePlayerRegistered);
      socket.off("TOURNAMENT_PLAYER_UNREGISTERED", handlePlayerUnregistered);
      socket.off(
        "TOURNAMENT_PARTICIPANT_COUNT_CHANGED",
        handleParticipantCountChanged
      );
      socket.off("TOURNAMENT_BLIND_LEVEL_ADVANCED", handleBlindLevelAdvanced);
      socket.off("TOURNAMENT_LEVEL_WARNING", handleLevelWarning);
      socket.off("TOURNAMENT_PLAYER_ELIMINATED", handlePlayerEliminated);
      socket.off("TOURNAMENT_PLAYER_TRANSFERRED", handlePlayerTransferred);
      socket.off("TOURNAMENT_TABLES_BALANCED", handleTablesBalanced);
      socket.off("TOURNAMENT_TABLES_MERGED", handleTablesMerged);
      socket.off("TOURNAMENT_COMPLETED", handleTournamentCompleted);
      socket.off("TOURNAMENT_CANCELLED", handleTournamentCancelled);
      socket.off("TOURNAMENT_PLAYER_BANNED", handlePlayerBanned);
      socket.off("TOURNAMENT_PLAYER_LEFT", handlePlayerLeft);
      socket.off("tournamentState", handleTournamentState);
      socket.off("error", handleError);
      socket.off("connect", joinRoom);

      // Leave tournament room when unmounting
      socket.emit("leave_tournament_room", { tournamentId }, (response: any) => {
        if (response?.error) {
          console.error("[Tournament] Failed to leave room:", response.error);
        }
      });
    };
  }, [
    socket,
    tournamentId,
    currentUserId,
    onTournamentStarted,
    onPlayerTransferred,
    onTournamentCompleted,
    onPlayerEliminated,
    onLevelWarning,
    onPlayerBanned,
    onPlayerLeft,
  ]);

  return {
    tournamentState,
    statusChange,
    participantCount,
    blindLevel,
    playerEliminated,
    tablesMerged,
    levelWarning,
    tournamentStarted,
    tournamentCompleted,
    tournamentCancelled,
    playerBanned,
    playerLeft,
  };
}
