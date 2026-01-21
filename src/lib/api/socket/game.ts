"use client";

/**
 * Main feature hook for online games
 * Combines base hooks to provide complete game socket functionality
 */

import { useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "../supabase/client";
import { useToast } from "@/lib/hooks";
import { useStatus } from "@/components/providers/StatusProvider";

import { useGameSocket } from "./hooks/useGameSocket";
import { useGameState } from "./hooks/useGameState";
import { useGameEvents } from "./hooks/useGameEvents";
import { useTurnTimer } from "./hooks/useTurnTimer";
import { useDisconnectTimers } from "./hooks/useDisconnectTimers";

import type { GameState, Player, ActionType } from "@/lib/types/poker";
import type {
  GameStateEvent,
  GameFinishedPayload,
  PlayerStatusUpdateEvent,
  DealStreetEvent,
  HandRunoutEvent,
  SeatVacatedEvent,
  PlayerEliminatedEvent,
  GameFinishedEvent,
  NavigateEvent,
} from "./types/game";

// ============================================
// TYPES
// ============================================

export interface UseOnlineGameSocketOptions {
  onGameFinished?: (payload: GameFinishedPayload) => void;
  onPlayerEliminated?: (playerId: string) => void;
  onNavigate?: (path: string) => void;
}

export interface UseOnlineGameSocketReturn {
  // State
  gameState: GameState | null;
  isConnected: boolean;
  isDisconnected: boolean;
  isSyncing: boolean;
  isInitializing: boolean;
  turnTimer: { deadline: number; duration: number; activeSeat: number } | null;
  playerDisconnectTimers: Record<string, number>;
  isHeadsUp: boolean;
  currentUserId: string | null;

  // Actions
  sendAction: (action: ActionType, amount?: number, isAllInCall?: boolean) => void;
  revealCard: (cardIndex: number) => void;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

/**
 * Main hook for online game socket functionality
 * Provides game state, actions, and event handling
 */
export function useOnlineGameSocket(
  gameId: string,
  options: UseOnlineGameSocketOptions = {}
): UseOnlineGameSocketReturn {
  const { onGameFinished, onPlayerEliminated, onNavigate } = options;

  const router = useRouter();
  const { toast } = useToast();
  const { setStatus, clearStatus } = useStatus();
  const supabase = createClientComponentClient();

  // Refs for tracking state across renders
  const currentUserIdRef = useRef<string | null>(null);
  const gameEndedRef = useRef(false);
  const handRunoutRef = useRef(false);
  const mountedRef = useRef(true);

  // Base hooks
  const {
    socket,
    isConnected,
    isDisconnected,
    isSyncing,
    isInitializing,
    setIsSyncing,
    setIsInitializing,
  } = useGameSocket({
    gameId,
    onError: (error) => {
      toast({
        title: "Connection Error",
        description: error,
        variant: "destructive",
      });
    },
    onAuthError: () => {
      toast({
        title: "Access Denied",
        description: "You are not a player in this game.",
        variant: "destructive",
      });
      setTimeout(() => router.replace("/play/online"), 1500);
    },
    onMaxRetriesExceeded: () => {
      router.replace("/play/online");
    },
  });

  const {
    gameState,
    setRawGameState,
    setRawGameStateForSync,
    updateCommunityCards,
    updatePhase,
    removePlayer,
  } = useGameState({ gameId });

  const {
    turnTimer,
    handleTurnTimerStarted,
    clearTimerIfActorChanged,
  } = useTurnTimer();

  const {
    timers: playerDisconnectTimers,
    startTimer: startDisconnectTimer,
    clearTimer: clearDisconnectTimer,
    clearAllTimers: clearAllDisconnectTimers,
  } = useDisconnectTimers();

  // Derive heads-up mode from config
  const isHeadsUp = useMemo(
    () => gameState?.config?.maxPlayers === 2,
    [gameState?.config?.maxPlayers]
  );

  // ============================================
  // AUTH SETUP
  // ============================================

  useEffect(() => {
    mountedRef.current = true;

    const setupAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/");
          return;
        }
        currentUserIdRef.current = user.id;
      } catch {
        router.replace("/play/online");
      }
    };

    setupAuth();

    return () => {
      mountedRef.current = false;
    };
  }, [supabase, router]);

  // ============================================
  // EVENT HANDLERS
  // ============================================

  const handleGameState = useCallback(
    (state: GameStateEvent) => {
      if (!mountedRef.current) return;

      // Mark initialization complete
      if (isInitializing) {
        setIsInitializing(false);
      }

      // Clear syncing state
      setIsSyncing(false);

      // Clear timer if actor changed
      clearTimerIfActorChanged(state.currentActorSeat);

      // Reset flags if we get a new hand
      if (gameState && state.handNumber !== gameState.handNumber) {
        gameEndedRef.current = false;
        handRunoutRef.current = false;
      }

      // Update state
      setRawGameState(state);
    },
    [
      isInitializing,
      setIsInitializing,
      setIsSyncing,
      clearTimerIfActorChanged,
      gameState,
      setRawGameState,
    ]
  );

  const handleSyncGame = useCallback(
    (state: GameStateEvent) => {
      if (!mountedRef.current) return;

      if (isInitializing) {
        setIsInitializing(false);
      }

      clearTimerIfActorChanged(state.currentActorSeat);
      setRawGameStateForSync(state);
      clearAllDisconnectTimers();
      setIsSyncing(false);

      toast({
        title: "Reconnected",
        description: "Game state synchronized",
        variant: "default",
      });
    },
    [
      isInitializing,
      setIsInitializing,
      clearTimerIfActorChanged,
      setRawGameStateForSync,
      clearAllDisconnectTimers,
      setIsSyncing,
      toast,
    ]
  );

  const handlePlayerStatusUpdate = useCallback(
    (data: PlayerStatusUpdateEvent) => {
      if (!mountedRef.current) return;

      const isDisconnectedStatus =
        data.status === "DISCONNECTED" ||
        data.status === "LEFT" ||
        data.status === "REMOVED";

      if (!isDisconnectedStatus) return;

      // Get player info from current state
      const player = gameState?.players.find((p) => p.id === data.playerId);

      // Handle disconnect timer
      if (data.status === "DISCONNECTED" && data.timestamp) {
        startDisconnectTimer(data.playerId, data.timestamp);
      }

      // Clear timer if player left or removed
      if (data.status === "LEFT" || data.status === "REMOVED") {
        clearDisconnectTimer(data.playerId);
      }

      // Show toast
      const title =
        data.status === "REMOVED"
          ? "Player removed"
          : data.status === "LEFT"
          ? "Player left"
          : "Player disconnected";

      const description =
        data.status === "REMOVED"
          ? `${player?.username || "A player"} was removed by the host`
          : data.status === "LEFT"
          ? `${player?.username || "A player"} has left the game`
          : `${player?.username || "A player"} disconnected${
              data.action === "FOLD" ? " and folded" : ""
            }`;

      toast({ title, description, variant: "default" });
    },
    [gameState?.players, startDisconnectTimer, clearDisconnectTimer, toast]
  );

  const handleDealStreet = useCallback(
    (data: DealStreetEvent) => {
      if (!mountedRef.current) return;

      updateCommunityCards(data.communityCards || []);

      if (data.round) {
        const phase =
          data.round === "flop"
            ? "flop"
            : data.round === "turn"
            ? "turn"
            : data.round === "river"
            ? "river"
            : undefined;

        if (phase) {
          updatePhase(phase);
        }
      }
    },
    [updateCommunityCards, updatePhase]
  );

  const handleHandRunout = useCallback(
    (data: HandRunoutEvent) => {
      if (!mountedRef.current) return;

      handRunoutRef.current = true;

      if (data.board) {
        updateCommunityCards(data.board);
      }

      // Find winner for toast
      const winner = gameState?.players.find((p) => p.id === data.winnerId);
      toast({
        title: "Hand complete",
        description: `${winner?.username || "Player"} wins the pot!`,
        variant: "default",
      });
    },
    [gameState?.players, updateCommunityCards, toast]
  );

  const handleSeatVacated = useCallback(
    (data: SeatVacatedEvent) => {
      if (!mountedRef.current) return;

      removePlayer(data.seatIndex);
      toast({
        title: "Seat vacated",
        description: "A player has left the table",
        variant: "default",
      });
    },
    [removePlayer, toast]
  );

  const handlePlayerEliminated = useCallback(
    (data: PlayerEliminatedEvent) => {
      if (!mountedRef.current) return;

      const currentUserId = currentUserIdRef.current;

      if (data.playerId === currentUserId) {
        // Current user eliminated
        const payload: GameFinishedPayload = {
          reason: "You have been eliminated",
          winnerId: null,
          returnUrl: "/play/online",
          timestamp: new Date().toISOString(),
        };
        onGameFinished?.(payload);
      } else {
        // Another player eliminated
        const eliminatedPlayer = gameState?.players.find(
          (p) => p.id === data.playerId
        );
        toast({
          title: "Player eliminated",
          description: `${eliminatedPlayer?.username || "A player"} has been eliminated`,
          variant: "default",
        });
      }

      onPlayerEliminated?.(data.playerId);
    },
    [gameState?.players, onGameFinished, onPlayerEliminated, toast]
  );

  const handleGameFinished = useCallback(
    (data: GameFinishedEvent) => {
      if (!mountedRef.current) return;

      gameEndedRef.current = true;

      const payload: GameFinishedPayload = data.payload || {
        reason: data.reason || data.message || "The game has ended.",
        winnerId: data.winnerId ?? null,
        returnUrl: data.returnUrl || "/play/online",
        timestamp: data.timestamp || new Date().toISOString(),
        stats: data.stats,
      };

      onGameFinished?.(payload);
    },
    [onGameFinished]
  );

  const handleNavigate = useCallback(
    (data: NavigateEvent) => {
      if (!mountedRef.current) return;

      if (onNavigate) {
        onNavigate(data.path);
      } else {
        router.push(data.path);
      }
    },
    [onNavigate, router]
  );

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
      onDealStreet: handleDealStreet,
      onHandRunout: handleHandRunout,
      onSeatVacated: handleSeatVacated,
      onPlayerEliminated: handlePlayerEliminated,
      onGameFinished: handleGameFinished,
      onGameEnded: (data) => {
        if (!mountedRef.current) return;
        gameEndedRef.current = true;
        const payload: GameFinishedPayload = {
          reason: data.reason || data.message || "GAME_ENDED",
          winnerId: null,
          returnUrl: "/play/online",
          timestamp: new Date().toISOString(),
        };
        onGameFinished?.(payload);
      },
      onNavigate: handleNavigate,
      onGameReconnected: () => {
        if (!mountedRef.current) return;
        // Disconnect overlay will be cleared by SYNC_GAME
      },
    },
  });

  // ============================================
  // STATUS MANAGEMENT
  // ============================================

  useEffect(() => {
    if (isDisconnected) {
      setStatus({
        id: "game-disconnect",
        priority: 100,
        type: "error",
        title: "Connection Lost",
        message: "Reconnecting...",
      });
    } else {
      clearStatus("game-disconnect");
    }
  }, [isDisconnected, setStatus, clearStatus]);

  // ============================================
  // ACTIONS
  // ============================================

  const sendAction = useCallback(
    (action: ActionType, amount?: number, isAllInCall?: boolean) => {
      if (!gameState) return;

      const currentUserId = currentUserIdRef.current;
      if (!currentUserId) return;

      const player = gameState.players.find((p) => p.id === currentUserId);
      if (!player) {
        console.error("[useOnlineGameSocket] Cannot send action - player not found");
        return;
      }

      const payload = {
        gameId,
        type: action,
        amount,
        seat: player.seat,
        isAllInCall,
      };

      socket.emit("action", payload);
    },
    [gameId, gameState, socket]
  );

  const revealCard = useCallback(
    (cardIndex: number) => {
      if (!gameState) return;
      if (gameState.currentPhase !== "showdown") return;

      const currentUserId = currentUserIdRef.current;
      if (!currentUserId) return;

      const player = gameState.players.find((p) => p.id === currentUserId);
      if (!player) {
        console.error("[useOnlineGameSocket] Cannot reveal card - player not found");
        return;
      }

      const payload = {
        gameId,
        type: "reveal",
        index: cardIndex,
        seat: player.seat,
      };

      socket.emit("action", payload);
    },
    [gameId, gameState, socket]
  );

  return {
    // State
    gameState,
    isConnected,
    isDisconnected,
    isSyncing,
    isInitializing,
    turnTimer,
    playerDisconnectTimers,
    isHeadsUp,
    currentUserId: currentUserIdRef.current,

    // Actions
    sendAction,
    revealCard,
  };
}
