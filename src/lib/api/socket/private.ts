"use client";

/**
 * Feature hook for private games
 * Extends online game functionality with host/admin controls
 */

import { useEffect, useCallback, useRef, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "../supabase/client";
import { useToast } from "@/lib/hooks";
import { connectSocketWithAuth, getSocket } from "./client";

import { useGameState } from "./hooks/useGameState";
import { useTurnTimer } from "./hooks/useTurnTimer";
import { useDisconnectTimers } from "./hooks/useDisconnectTimers";
import { useGameEvents } from "./hooks/useGameEvents";

import type { GameState, ActionType, PendingJoinRequest } from "@/lib/types/poker";
import type {
  GameStateEvent,
  SyncGameEvent,
  PlayerStatusUpdateEvent,
  PlayerMovedToSpectatorEvent,
  SocketErrorEvent,
  TurnTimerStartedEvent,
  AdminActionPayload,
} from "./types/game";

// Helper type for adminAction function signature
type AdminActionFunction = <T extends AdminActionPayload["type"]>(
  type: T,
  payload?: Omit<Extract<AdminActionPayload, { type: T }>, "gameId" | "type">
) => void;
import { getErrorMessage } from "./utils/errors";

// ============================================
// TYPES
// ============================================

export interface UsePrivateGameSocketOptions {
  onError?: (error: string) => void;
}

export interface UsePrivateGameSocketReturn {
  // State
  gameState: GameState | null;
  isSyncing: boolean;
  turnTimer: { deadline: number; duration: number; activeSeat: number } | null;
  playerDisconnectTimers: Record<string, number>;
  currentUserId: string | null;
  isHeadsUp: boolean;

  // Computed
  isHost: boolean;
  isSpectator: boolean;
  isSeated: boolean;
  isHostSpectator: boolean;
  hasPendingRequest: boolean;
  pendingRequests: PendingJoinRequest[];
  wasRejected: boolean;

  // Player Actions
  sendAction: (action: ActionType, amount?: number, isAllInCall?: boolean) => void;
  revealCard: (cardIndex: number) => void;
  requestSeat: () => void;
  hostSitDown: (seatIndex?: number | null) => void;

  // Host Actions
  adminAction: AdminActionFunction;
  approveRequest: (request: PendingJoinRequest) => void;
  rejectRequest: (userId: string) => void;
  kickPlayer: (playerId: string) => void;
  updateStack: (seat: number, amount: number) => void;
  updateBlinds: (smallBlind: number, bigBlind: number) => void;
  togglePause: () => void;
  startGame: () => void;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

/**
 * Hook for private game socket functionality
 * Provides all online game features plus host controls
 */
export function usePrivateGameSocket(
  gameId: string,
  options: UsePrivateGameSocketOptions = {}
): UsePrivateGameSocketReturn {
  const { onError } = options;

  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClientComponentClient();

  const socket = getSocket();

  // Local state
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(true);
  const [wasRejected, setWasRejected] = useState(false);

  const wasPlayerRef = useRef(false);
  const mountedRef = useRef(true);

  // Base hooks
  const { gameState, setRawGameState } = useGameState({ gameId });

  const {
    turnTimer,
    handleTurnTimerStarted,
    clearTimerIfActorChanged,
    clearTimerIfPaused,
  } = useTurnTimer();

  const {
    timers: playerDisconnectTimers,
    startTimer: startDisconnectTimer,
    clearTimer: clearDisconnectTimer,
    clearAllTimers: clearAllDisconnectTimers,
  } = useDisconnectTimers();

  // Computed properties
  const isHost = useMemo(
    () => gameState?.hostId === currentUserId,
    [gameState?.hostId, currentUserId]
  );

  const isPaused = useMemo(
    () => gameState?.isPaused || false,
    [gameState?.isPaused]
  );

  const pendingRequests = useMemo(
    () => gameState?.pendingRequests || [],
    [gameState?.pendingRequests]
  );

  const isSeated = useMemo(
    () => gameState?.players.some((p) => p.id === currentUserId) || false,
    [gameState?.players, currentUserId]
  );

  const isSpectator = useMemo(
    () => (gameState?.isPrivate && !isSeated) || false,
    [gameState?.isPrivate, isSeated]
  );

  const isHostSpectator = useMemo(
    () => isHost && isSpectator,
    [isHost, isSpectator]
  );

  const hasPendingRequest = useMemo(
    () => pendingRequests.some((r) => r.odanUserId === currentUserId),
    [pendingRequests, currentUserId]
  );

  const isHeadsUp = useMemo(
    () => gameState?.config?.maxPlayers === 2,
    [gameState?.config?.maxPlayers]
  );

  // ============================================
  // AUTH SETUP
  // ============================================

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        const currentPath = window.location.pathname;
        const redirectUrl = `/signin?next=${encodeURIComponent(currentPath)}`;
        router.replace(redirectUrl);
      } else {
        setCurrentUserId(data.user.id);
      }
    });
  }, [router, supabase]);

  // Track player status changes
  useEffect(() => {
    if (gameState && currentUserId) {
      wasPlayerRef.current = gameState.players.some((p) => p.id === currentUserId);
    }
  }, [gameState, currentUserId]);

  // ============================================
  // EVENT HANDLERS
  // ============================================

  const handleConnect = useCallback(() => {
    socket.emit("joinGame", gameId);
  }, [socket, gameId]);

  const handleGameState = useCallback(
    (state: GameStateEvent) => {
      if (!mountedRef.current) return;

      // Track transition from player to spectator
      const wasPlayer = wasPlayerRef.current;
      const isNowPlayer = state.players.some((p) => p.id === currentUserId);
      const isNowSpectator = state.isPrivate && !isNowPlayer;

      if (wasPlayer && isNowSpectator) {
        toast({
          title: "You ran out of chips",
          description: "You are now spectating. Request a seat to rejoin.",
          variant: "default",
        });
      }

      wasPlayerRef.current = isNowPlayer;

      // Handle timer based on pause state
      const gamePaused = state.isPaused || false;
      if (gamePaused) {
        clearTimerIfPaused(true);
      } else {
        clearTimerIfActorChanged(state.currentActorSeat);
      }

      setRawGameState(state);
      setIsSyncing(false);
    },
    [currentUserId, clearTimerIfPaused, clearTimerIfActorChanged, setRawGameState, toast]
  );

  const handleSyncGame = useCallback(
    (state: SyncGameEvent) => {
      if (!mountedRef.current) return;

      clearTimerIfActorChanged(state.currentActorSeat);
      setRawGameState(state);
      clearAllDisconnectTimers();
      setIsSyncing(false);

      toast({
        title: "Reconnected",
        description: "Game state synchronized",
        variant: "default",
      });
    },
    [clearTimerIfActorChanged, setRawGameState, clearAllDisconnectTimers, toast]
  );

  const handleError = useCallback(
    (err: SocketErrorEvent) => {
      const errorMessage = getErrorMessage(err);

      if (errorMessage === "Not enough players") {
        toast({
          variant: "destructive",
          title: "Cannot Start Game",
          description:
            "You need at least 2 players to start a game. Invite more players or wait for others to join.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: errorMessage,
        });
      }

      if (errorMessage === "Game not found") {
        router.push("/play");
      }

      onError?.(errorMessage);
    },
    [toast, router, onError]
  );

  const handlePlayerStatusUpdate = useCallback(
    (payload: PlayerStatusUpdateEvent) => {
      if (!mountedRef.current) return;

      // Handle disconnect timers for all players
      if (payload.status === "DISCONNECTED" && payload.timestamp) {
        startDisconnectTimer(payload.playerId, payload.timestamp);
      }

      // Clear timer on reconnect/leave/remove
      if (
        payload.status === "ACTIVE" ||
        payload.status === "LEFT" ||
        payload.status === "REMOVED"
      ) {
        clearDisconnectTimer(payload.playerId);
      }

      // Handle current user-specific notifications
      if (!currentUserId) return;

      if (payload.playerId === currentUserId) {
        if (
          payload.status === "ACTIVE" ||
          payload.status === "WAITING_FOR_NEXT_HAND"
        ) {
          setWasRejected(false);
          toast({
            title: "Seat Approved",
            description:
              payload.message || "You have been seated and are ready to play.",
            variant: "default",
          });
        } else if (payload.message === "Request rejected") {
          setWasRejected(true);
          toast({
            title: "Request Rejected",
            description: "Your seat request was rejected. You can request again.",
            variant: "destructive",
          });
        } else if (payload.status === "REMOVED") {
          toast({
            title: "Removed from Game",
            description: payload.message || "You have been removed by the host.",
            variant: "destructive",
          });
        }
      }
    },
    [currentUserId, startDisconnectTimer, clearDisconnectTimer, toast]
  );

  const handlePlayerMovedToSpectator = useCallback(
    (payload: PlayerMovedToSpectatorEvent) => {
      if (!currentUserId || !mountedRef.current) return;

      if (payload.playerId === currentUserId) {
        toast({
          title: "Moved to Spectator",
          description: payload.reason || "You have been moved to spectator mode.",
          variant: "default",
        });
      }
    },
    [currentUserId, toast]
  );

  // ============================================
  // SOCKET CONNECTION
  // ============================================

  useEffect(() => {
    if (!currentUserId) return;

    mountedRef.current = true;

    void connectSocketWithAuth(socket);

    // Initial join if already connected
    if (socket.connected) handleConnect();

    return () => {
      mountedRef.current = false;
    };
  }, [currentUserId, socket, handleConnect]);

  // ============================================
  // REGISTER EVENT LISTENERS
  // ============================================

  useGameEvents({
    socket,
    handlers: {
      onGameState: handleGameState,
      onSyncGame: handleSyncGame,
      onTurnTimerStarted: handleTurnTimerStarted,
      onPlayerStatusUpdate: handlePlayerStatusUpdate,
      onPlayerMovedToSpectator: handlePlayerMovedToSpectator,
      onError: handleError,
      onConnect: handleConnect,
    },
    enabled: !!currentUserId,
  });

  // ============================================
  // PLAYER ACTIONS
  // ============================================

  const sendAction = useCallback(
    (action: ActionType, amount?: number, isAllInCall?: boolean) => {
      if (!gameState) return;

      const player = gameState.players.find((p) => p.id === currentUserId);
      if (!player) {
        console.error("[usePrivateGameSocket] Cannot send action - player not found");
        return;
      }

      socket.emit("action", {
        gameId,
        type: action,
        amount,
        seat: player.seat,
        isAllInCall,
      });
    },
    [gameId, gameState, currentUserId, socket]
  );

  const revealCard = useCallback(
    (cardIndex: number) => {
      if (!gameState || gameState.currentPhase !== "showdown") return;

      const player = gameState.players.find((p) => p.id === currentUserId);
      if (!player) return;

      socket.emit("action", {
        gameId,
        type: "reveal",
        index: cardIndex,
        seat: player.seat,
      });
    },
    [gameId, gameState, currentUserId, socket]
  );

  const requestSeat = useCallback(() => {
    setWasRejected(false);
    socket.emit("request_seat", { gameId });
    toast({
      title: "Request Sent",
      description: "Waiting for host approval...",
    });
  }, [gameId, socket, toast]);

  const hostSitDown = useCallback(
    (seatIndex?: number | null) => {
      socket.emit("host_self_seat", {
        gameId,
        seatIndex: seatIndex ?? null,
      });
      toast({ title: "Sitting Down", description: "Joining the table..." });
    },
    [gameId, socket, toast]
  );

  // ============================================
  // HOST ACTIONS
  // ============================================

  const adminAction = useCallback(
    <T extends AdminActionPayload["type"]>(
      type: T,
      payload: Omit<Extract<AdminActionPayload, { type: T }>, "gameId" | "type"> = {} as Omit<
        Extract<AdminActionPayload, { type: T }>,
        "gameId" | "type"
      >
    ) => {
      if (!socket.connected) {
        toast({
          variant: "destructive",
          title: "Not Connected",
          description: "Cannot perform action while disconnected.",
        });
        return;
      }

      // Listen for error response (server emits 'error' on failure)
      const errorHandler = (err: SocketErrorEvent) => {
        const errorMessage = getErrorMessage(err);
        toast({
          variant: "destructive",
          title: "Action Failed",
          description: errorMessage,
        });
        socket.off("error", errorHandler);
      };

      // Set up temporary error listener, auto-cleanup after 3s
      socket.once("error", errorHandler);
      setTimeout(() => socket.off("error", errorHandler), 3000);

      const actionPayload: AdminActionPayload = { gameId, type, ...payload } as AdminActionPayload;
      socket.emit("admin_action", actionPayload);
    },
    [gameId, socket, toast]
  );

  const approveRequest = useCallback(
    (request: PendingJoinRequest) => {
      // Backend expects targetUserId, requestId, or playerId (not the full request object)
      // Since frontend uses odanUserId (normalized from backend's id/userId), we send it as targetUserId
      adminAction("ADMIN_APPROVE", { targetUserId: request.odanUserId });
    },
    [adminAction]
  );

  const rejectRequest = useCallback(
    (userId: string) => {
      // Backend expects targetUserId, requestId, or playerId (not userId)
      adminAction("ADMIN_REJECT", { targetUserId: userId });
    },
    [adminAction]
  );

  const kickPlayer = useCallback(
    (playerId: string) => {
      adminAction("ADMIN_KICK", { playerId });
    },
    [adminAction]
  );

  const updateStack = useCallback(
    (seat: number, amount: number) => {
      adminAction("ADMIN_SET_STACK", { seat, amount });
    },
    [adminAction]
  );

  const updateBlinds = useCallback(
    (smallBlind: number, bigBlind: number) => {
      if (
        isNaN(smallBlind) ||
        isNaN(bigBlind) ||
        smallBlind <= 0 ||
        bigBlind <= 0
      ) {
        toast({
          variant: "destructive",
          title: "Invalid Blinds",
          description: "Please enter valid positive numbers.",
        });
        return;
      }
      if (bigBlind < smallBlind) {
        toast({
          variant: "destructive",
          title: "Invalid Blinds",
          description: "Big blind must be greater than or equal to small blind.",
        });
        return;
      }
      adminAction("ADMIN_SET_BLINDS", { smallBlind, bigBlind });
      toast({
        title: "Blinds Updated",
        description: `Blinds set to $${smallBlind}/$${bigBlind}`,
      });
    },
    [adminAction, toast]
  );

  const togglePause = useCallback(() => {
    adminAction(isPaused ? "ADMIN_RESUME" : "ADMIN_PAUSE");
  }, [adminAction, isPaused]);

  const startGame = useCallback(() => {
    adminAction("ADMIN_START_GAME");
  }, [adminAction]);

  const returnValue: UsePrivateGameSocketReturn = {
    // State
    gameState,
    isSyncing,
    turnTimer,
    playerDisconnectTimers,
    currentUserId,
    isHeadsUp,

    // Computed
    isHost,
    isSpectator,
    isSeated,
    isHostSpectator,
    hasPendingRequest,
    pendingRequests,
    wasRejected,

    // Player Actions
    sendAction,
    revealCard,
    requestSeat,
    hostSitDown,

    // Host Actions
    adminAction: adminAction as AdminActionFunction,
    approveRequest,
    rejectRequest,
    kickPlayer,
    updateStack,
    updateBlinds,
    togglePause,
    startGame,
  };

  return returnValue;
}
