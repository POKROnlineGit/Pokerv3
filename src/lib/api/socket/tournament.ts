"use client";

import { useSocket } from "./client";
import { useCallback, useEffect, useState } from "react";
import {
  Tournament,
  TournamentState,
  TournamentStateResponse,
  TournamentLeaderboard,
  TournamentAdminActionType,
} from "@/lib/types/tournament";

/**
 * Hook for tournament socket operations
 */
export function useTournamentSocket() {
  const socket = useSocket();

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
            resolve(response);
          }
        );
      });
    },
    [socket]
  );

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
            resolve(response);
          }
        );
      });
    },
    [socket]
  );

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
            resolve(response);
          }
        );
      });
    },
    [socket]
  );

  const getActiveTournaments = useCallback(
    (
      status?: Tournament["status"]
    ): Promise<{ tournaments: Tournament[] } | { error: string }> => {
      return new Promise((resolve) => {
        if (!socket.connected) socket.connect();

        // Backend filters by 'active', 'registration', 'paused' if no status provided
        socket.emit("get_active_tournaments", { status }, (response: any) => {
          resolve(response);
        });
      });
    },
    [socket]
  );

  const getTournamentLeaderboard = useCallback(
    (
      tournamentId: string
    ): Promise<{ leaderboard: TournamentLeaderboard } | { error: string }> => {
      return new Promise((resolve) => {
        if (!socket.connected) socket.connect();

        socket.emit(
          "get_tournament_leaderboard",
          { tournamentId },
          (response: any) => {
            resolve(response);
          }
        );
      });
    },
    [socket]
  );

  const tournamentAdminAction = useCallback(
    (
      tournamentId: string,
      actionType: TournamentAdminActionType,
      data?: any
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
          if (!data || typeof data !== "object") {
            resolve({
              error: "Settings object is required for UPDATE_SETTINGS action",
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

  const updateTournamentSettings = useCallback(
    (
      tournamentId: string,
      settings: {
        maxPlayers?: number;
        maxPlayersPerTable?: number;
        startingStack?: number;
        blindStructureTemplate?: Array<{ small: number; big: number }>;
        blindLevelDurationMinutes?: number;
      }
    ): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        if (!socket.connected) socket.connect();

        // Validate tournamentId
        if (!tournamentId || typeof tournamentId !== "string") {
          resolve({ error: "Tournament ID is required" });
          return;
        }

        // Validate settings object
        if (!settings || typeof settings !== "object") {
          resolve({ error: "Settings must be an object" });
          return;
        }

        socket.emit(
          "tournament_admin_action",
          {
            tournamentId,
            type: "UPDATE_SETTINGS",
            settings,
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

  return {
    createTournament,
    registerTournament,
    unregisterTournament,
    getTournamentState,
    getActiveTournaments,
    getTournamentLeaderboard,
    tournamentAdminAction,
    updateTournamentSettings,
  };
}

/**
 * Hook to listen for tournament events
 * Automatically joins the tournament room and listens for status changes
 */
export function useTournamentEvents(tournamentId?: string) {
  const socket = useSocket();
  const [tournamentUpdate, setTournamentUpdate] = useState<Tournament | null>(
    null
  );
  const [statusChange, setStatusChange] = useState<{
    tournamentId: string;
    status: Tournament["status"];
    previousStatus?: Tournament["status"];
  } | null>(null);

  useEffect(() => {
    if (!tournamentId) return;

    // Ensure socket is connected
    if (!socket.connected) {
      socket.connect();
    }

    // Join tournament room when connected
    const joinTournamentRoom = () => {
      // Emit join_tournament event to backend (backend will handle socket.join)
      socket.emit("join_tournament", { tournamentId });
    };

    // Join room immediately if already connected, otherwise wait for connection
    if (socket.connected) {
      joinTournamentRoom();
    } else {
      socket.once("connect", joinTournamentRoom);
    }

    const handleTournamentUpdate = (data: Tournament) => {
      if (data.tournamentId === tournamentId) {
        setTournamentUpdate(data);
      }
    };

    const handleTournamentStarted = (data: {
      tournamentId: string;
      gameId?: string;
    }) => {
      if (data.tournamentId === tournamentId) {
        // Tournament started - redirect to game if player is assigned
      }
    };

    const handlePlayerEliminated = (data: {
      tournamentId: string;
      playerId: string;
    }) => {
      if (data.tournamentId === tournamentId) {
        // Update tournament state
      }
    };

    // Listen for TOURNAMENT_STATUS_CHANGED event (backend sends this exact event name)
    const handleStatusChanged = (data: {
      tournamentId: string;
      status: Tournament["status"];
      previousStatus?: Tournament["status"];
    }) => {
      if (data.tournamentId === tournamentId) {
        setStatusChange({
          tournamentId: data.tournamentId,
          status: data.status,
          previousStatus: data.previousStatus,
        });
        // Also update tournament update if we have it (use functional update to avoid stale closure)
        setTournamentUpdate((prev) => {
          if (prev && prev.tournamentId === tournamentId) {
            return {
              ...prev,
              status: data.status,
            };
          }
          return prev;
        });
      }
    };

    // Listen for error events from tournament admin actions
    const handleError = (error: {
      message?: string;
      tournamentId?: string;
    }) => {
      if (error.tournamentId === tournamentId) {
        console.error("[Tournament] Admin action error:", error.message);
        // Error is logged, but we don't update state here
        // Components should handle errors via callback responses
      }
    };

    socket.on("tournament_update", handleTournamentUpdate);
    socket.on("tournament_started", handleTournamentStarted);
    socket.on("tournament_player_eliminated", handlePlayerEliminated);
    socket.on("TOURNAMENT_STATUS_CHANGED", handleStatusChanged);
    // Also listen for lowercase version for backward compatibility
    socket.on("tournament_status_changed", handleStatusChanged);
    socket.on("error", handleError);

    return () => {
      socket.off("tournament_update", handleTournamentUpdate);
      socket.off("tournament_started", handleTournamentStarted);
      socket.off("tournament_player_eliminated", handlePlayerEliminated);
      socket.off("TOURNAMENT_STATUS_CHANGED", handleStatusChanged);
      socket.off("tournament_status_changed", handleStatusChanged);
      socket.off("error", handleError);
      socket.off("connect", joinTournamentRoom);

      // Leave tournament room when unmounting
      socket.emit("leave_tournament", { tournamentId });
    };
  }, [socket, tournamentId]);

  return { tournamentUpdate, statusChange };
}
