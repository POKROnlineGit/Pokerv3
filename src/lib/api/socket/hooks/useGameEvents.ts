"use client";

/**
 * Hook for subscribing to game socket events
 * Handles all event listeners and cleanup
 */

import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";
import type {
  GameStateEvent,
  SyncGameEvent,
  TurnTimerStartedEvent,
  PlayerStatusUpdateEvent,
  PlayerMovedToSpectatorEvent,
  PlayerEliminatedEvent,
  SeatVacatedEvent,
  DealStreetEvent,
  HandRunoutEvent,
  GameFinishedEvent,
  GameEndedEvent,
  GameReconnectedEvent,
  NavigateEvent,
  TimeoutEvent,
  SocketErrorEvent,
} from "../types/game";

export interface GameEventHandlers {
  onGameState?: (state: GameStateEvent) => void;
  onSyncGame?: (state: SyncGameEvent) => void;
  onTurnTimerStarted?: (data: TurnTimerStartedEvent) => void;
  onTimeout?: (data: TimeoutEvent) => void;
  onPlayerStatusUpdate?: (data: PlayerStatusUpdateEvent) => void;
  onPlayerMovedToSpectator?: (data: PlayerMovedToSpectatorEvent) => void;
  onPlayerEliminated?: (data: PlayerEliminatedEvent) => void;
  onSeatVacated?: (data: SeatVacatedEvent) => void;
  onDealStreet?: (data: DealStreetEvent) => void;
  onHandRunout?: (data: HandRunoutEvent) => void;
  onGameFinished?: (data: GameFinishedEvent) => void;
  onGameEnded?: (data: GameEndedEvent) => void;
  onGameReconnected?: (data: GameReconnectedEvent) => void;
  onNavigate?: (data: NavigateEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: SocketErrorEvent) => void;
}

export interface UseGameEventsOptions {
  socket: Socket;
  handlers: GameEventHandlers;
  enabled?: boolean;
}

/**
 * Hook for subscribing to game socket events
 * Automatically cleans up listeners on unmount
 */
export function useGameEvents(options: UseGameEventsOptions): void {
  const { socket, handlers, enabled = true } = options;
  const handlersRef = useRef(handlers);

  // Keep handlers ref updated
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!enabled) return;

    const mountedRef = { current: true };

    // Create stable handler functions that reference the ref
    const handleGameState = (state: GameStateEvent) => {
      if (mountedRef.current) handlersRef.current.onGameState?.(state);
    };

    const handleSyncGame = (state: SyncGameEvent) => {
      if (mountedRef.current) handlersRef.current.onSyncGame?.(state);
    };

    const handleTurnTimerStarted = (data: TurnTimerStartedEvent) => {
      if (mountedRef.current) handlersRef.current.onTurnTimerStarted?.(data);
    };

    const handleTimeout = (data: TimeoutEvent) => {
      if (mountedRef.current) handlersRef.current.onTimeout?.(data);
    };

    const handlePlayerStatusUpdate = (data: PlayerStatusUpdateEvent) => {
      if (mountedRef.current) handlersRef.current.onPlayerStatusUpdate?.(data);
    };

    const handlePlayerMovedToSpectator = (data: PlayerMovedToSpectatorEvent) => {
      if (mountedRef.current) handlersRef.current.onPlayerMovedToSpectator?.(data);
    };

    const handlePlayerEliminated = (data: PlayerEliminatedEvent) => {
      if (mountedRef.current) handlersRef.current.onPlayerEliminated?.(data);
    };

    const handleSeatVacated = (data: SeatVacatedEvent) => {
      if (mountedRef.current) handlersRef.current.onSeatVacated?.(data);
    };

    const handleDealStreet = (data: DealStreetEvent) => {
      if (mountedRef.current) handlersRef.current.onDealStreet?.(data);
    };

    const handleHandRunout = (data: HandRunoutEvent) => {
      if (mountedRef.current) handlersRef.current.onHandRunout?.(data);
    };

    const handleGameFinished = (data: GameFinishedEvent) => {
      if (mountedRef.current) handlersRef.current.onGameFinished?.(data);
    };

    const handleGameEnded = (data: GameEndedEvent) => {
      if (mountedRef.current) handlersRef.current.onGameEnded?.(data);
    };

    const handleGameReconnected = (data: GameReconnectedEvent) => {
      if (mountedRef.current) handlersRef.current.onGameReconnected?.(data);
    };

    const handleNavigate = (data: NavigateEvent) => {
      if (mountedRef.current) handlersRef.current.onNavigate?.(data);
    };

    const handleConnect = () => {
      if (mountedRef.current) handlersRef.current.onConnect?.();
    };

    const handleDisconnect = () => {
      if (mountedRef.current) handlersRef.current.onDisconnect?.();
    };

    const handleError = (error: SocketErrorEvent) => {
      if (mountedRef.current) handlersRef.current.onError?.(error);
    };

    // Register all listeners
    socket.on("gameState", handleGameState);
    socket.on("SYNC_GAME", handleSyncGame);
    socket.on("turn_timer_started", handleTurnTimerStarted);
    socket.on("timeout", handleTimeout);
    socket.on("PLAYER_STATUS_UPDATE", handlePlayerStatusUpdate);
    socket.on("PLAYER_MOVED_TO_SPECTATOR", handlePlayerMovedToSpectator);
    socket.on("PLAYER_ELIMINATED", handlePlayerEliminated);
    socket.on("SEAT_VACATED", handleSeatVacated);
    socket.on("DEAL_STREET", handleDealStreet);
    socket.on("HAND_RUNOUT", handleHandRunout);
    socket.on("GAME_FINISHED", handleGameFinished);
    socket.on("GAME_ENDED", handleGameEnded);
    socket.on("gameEnded", handleGameEnded); // Legacy event name
    socket.on("game-reconnected", handleGameReconnected);
    socket.on("navigate", handleNavigate);
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("error", handleError);

    // Cleanup
    return () => {
      mountedRef.current = false;

      socket.off("gameState", handleGameState);
      socket.off("SYNC_GAME", handleSyncGame);
      socket.off("turn_timer_started", handleTurnTimerStarted);
      socket.off("timeout", handleTimeout);
      socket.off("PLAYER_STATUS_UPDATE", handlePlayerStatusUpdate);
      socket.off("PLAYER_MOVED_TO_SPECTATOR", handlePlayerMovedToSpectator);
      socket.off("PLAYER_ELIMINATED", handlePlayerEliminated);
      socket.off("SEAT_VACATED", handleSeatVacated);
      socket.off("DEAL_STREET", handleDealStreet);
      socket.off("HAND_RUNOUT", handleHandRunout);
      socket.off("GAME_FINISHED", handleGameFinished);
      socket.off("GAME_ENDED", handleGameEnded);
      socket.off("gameEnded", handleGameEnded);
      socket.off("game-reconnected", handleGameReconnected);
      socket.off("navigate", handleNavigate);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("error", handleError);
    };
  }, [socket, enabled]);
}
