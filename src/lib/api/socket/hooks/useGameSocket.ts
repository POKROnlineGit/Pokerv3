"use client";

/**
 * Base hook for game socket connection management
 * Handles connect, disconnect, reconnection, and joinGame emission
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Socket } from "socket.io-client";
import { connectSocketWithAuth, getSocket } from "../client";
import { createRetryHandler, isGameNotFoundError, isAuthError, getErrorMessage } from "../utils/errors";
import type { SocketErrorEvent } from "../types/game";

export interface UseGameSocketOptions {
  gameId: string;
  onError?: (error: string) => void;
  onAuthError?: () => void;
  onMaxRetriesExceeded?: () => void;
  maxRetries?: number;
  retryDelay?: number;
}

export interface UseGameSocketReturn {
  socket: Socket;
  isConnected: boolean;
  isDisconnected: boolean;
  isSyncing: boolean;
  isInitializing: boolean;
  joinGame: () => void;
  setIsSyncing: (syncing: boolean) => void;
  setIsInitializing: (initializing: boolean) => void;
}

/**
 * Hook for managing game socket connection
 * Relies on backend auto-join for reconnection; only explicitly joins when needed
 */
export function useGameSocket(options: UseGameSocketOptions): UseGameSocketReturn {
  const {
    gameId,
    onError,
    onAuthError,
    onMaxRetriesExceeded,
    maxRetries = 3,
    retryDelay = 500,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  const socketRef = useRef<Socket | null>(null);
  const mountedRef = useRef(true);
  const lastJoinRef = useRef<{ gameId: string; socketId?: string; at: number } | null>(null);
  const backendAutoJoinedRef = useRef(false);
  const initialJoinTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Create retry handler for "Game not found" errors
  const retryHandlerRef = useRef(
    createRetryHandler({
      maxRetries,
      retryDelay,
      onRetry: (attempt) => {
        console.log(`[useGameSocket] Retrying joinGame (attempt ${attempt}/${maxRetries})`);
      },
      onMaxRetriesExceeded: () => {
        console.log("[useGameSocket] Max retries exceeded");
        onMaxRetriesExceeded?.();
      },
    })
  );

  // Get or create socket
  const getSocketInstance = useCallback(() => {
    if (!socketRef.current) {
      socketRef.current = getSocket();
    }
    return socketRef.current;
  }, []);

  // Join game function
  const joinGameInternal = useCallback(
    (force = false) => {
      void (async () => {
        const socket = getSocketInstance();
        await connectSocketWithAuth(socket);

        // Dedupe join spam: only emit once per (socket.id, gameId) within a short window,
        // unless explicitly forced (e.g. retry after "Game not found").
        const now = Date.now();
        const socketId = socket.id;
        const last = lastJoinRef.current;
        const isDuplicate =
          !force &&
          !!last &&
          last.gameId === gameId &&
          last.socketId === socketId &&
          now - last.at < 5000;

        if (isDuplicate) return;

        socket.emit("joinGame", gameId);
        lastJoinRef.current = { gameId, socketId, at: now };
        setIsSyncing(true);
      })();
    },
    [gameId, getSocketInstance]
  );

  const joinGame = useCallback(() => joinGameInternal(false), [joinGameInternal]);

  // Main connection effect
  useEffect(() => {
    mountedRef.current = true;
    const socket = getSocketInstance();

    // Connect socket if not connected
    void connectSocketWithAuth(socket);

    // Handle connect event
    const handleConnect = () => {
      if (!mountedRef.current) return;

      setIsConnected(true);
      setIsDisconnected(false);

      // Reset retry count on fresh connection
      retryHandlerRef.current.reset();

      // Backend will auto-join if player is in an active game
      // We'll wait for game-reconnected or gameState to confirm
      backendAutoJoinedRef.current = false;
    };

    // Handle disconnect event
    const handleDisconnect = () => {
      if (!mountedRef.current) return;

      setIsConnected(false);
      setIsDisconnected(true);
      setIsSyncing(true);
      // Reset flags for next connection
      lastJoinRef.current = null;
      backendAutoJoinedRef.current = false;
    };

    // Handle reconnect (fires when socket reconnects after disconnect)
    const handleReconnect = () => {
      if (!mountedRef.current) return;

      setIsConnected(true);
      setIsDisconnected(false);

      // Reset retry count on reconnect
      retryHandlerRef.current.reset();

      // Backend will auto-join if player is in an active game
      // We'll wait for game-reconnected or gameState to confirm
      backendAutoJoinedRef.current = false;
    };

    // Handle errors
    const handleError = (error: SocketErrorEvent) => {
      if (!mountedRef.current) return;

      const errorMessage = getErrorMessage(error);
      console.error("[useGameSocket] Socket error:", errorMessage);

      if (isGameNotFoundError(error)) {
        // Retry joinGame for "Game not found" errors
        const retryScheduled = retryHandlerRef.current.attempt(() => joinGameInternal(true));
        if (!retryScheduled) {
          // Max retries exceeded, callback will be called
        }
      } else if (isAuthError(error)) {
        // Authorization error - don't retry
        onAuthError?.();
        onError?.(errorMessage);
      } else {
        // Other errors
        onError?.(errorMessage);
      }
    };

    // Handle backend auto-join signal
    const handleGameReconnected = (data: { gameId: string; message?: string }) => {
      if (!mountedRef.current) return;
      // Backend auto-joined us to this game
      backendAutoJoinedRef.current = true;
      setIsSyncing(true); // Set syncing while we wait for gameState
      // Clear the fallback timeout since backend joined us
      if (initialJoinTimeoutRef.current) {
        clearTimeout(initialJoinTimeoutRef.current);
        initialJoinTimeoutRef.current = null;
      }
    };

    // Successful state receipt implies join succeeded
    const handleAnyState = () => {
      if (!mountedRef.current) return;
      lastJoinRef.current = null;
      backendAutoJoinedRef.current = true;
      setIsSyncing(false); // Clear syncing immediately when gameState arrives
      // Clear the fallback timeout since we received state
      if (initialJoinTimeoutRef.current) {
        clearTimeout(initialJoinTimeoutRef.current);
        initialJoinTimeoutRef.current = null;
      }
    };

    // Register listeners
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("reconnect", handleReconnect);
    socket.on("error", handleError);
    socket.on("game-reconnected", handleGameReconnected);
    socket.on("gameState", handleAnyState);
    socket.on("SYNC_GAME", handleAnyState);

    // Initial connection check
    if (socket.connected) {
      handleConnect();
    }

    // If backend didn't auto-join within 2 seconds, explicitly join
    // This handles cases where player navigates to a game page for a game they're not in yet
    initialJoinTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current && !backendAutoJoinedRef.current && socket.connected) {
        console.log("[useGameSocket] Backend didn't auto-join, explicitly joining game");
        joinGameInternal(false);
      }
      initialJoinTimeoutRef.current = null;
    }, 2000);

    // Cleanup
    return () => {
      mountedRef.current = false;
      if (initialJoinTimeoutRef.current) {
        clearTimeout(initialJoinTimeoutRef.current);
        initialJoinTimeoutRef.current = null;
      }

      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("reconnect", handleReconnect);
      socket.off("error", handleError);
      socket.off("game-reconnected", handleGameReconnected);
      socket.off("gameState", handleAnyState);
      socket.off("SYNC_GAME", handleAnyState);

      retryHandlerRef.current.cleanup();
    };
  }, [gameId, getSocketInstance, joinGameInternal, onError, onAuthError]);

  return {
    socket: getSocketInstance(),
    isConnected,
    isDisconnected,
    isSyncing,
    isInitializing,
    joinGame,
    setIsSyncing,
    setIsInitializing,
  };
}
