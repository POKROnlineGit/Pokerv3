"use client";

/**
 * Base hook for game socket connection management
 * Handles connect, disconnect, reconnection, and joinGame emission
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Socket } from "socket.io-client";
import { getSocket } from "../client";
import { createRetryHandler, isGameNotFoundError, isAuthError, getErrorMessage } from "../utils/errors";
import type { SocketErrorEvent, JoinGameResponse } from "../types/game";

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
 * Automatically joins game on connect and handles reconnection
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
  const joinGame = useCallback(() => {
    const socket = getSocketInstance();
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit("joinGame", gameId);
    setIsSyncing(true);
  }, [gameId, getSocketInstance]);

  // Main connection effect
  useEffect(() => {
    mountedRef.current = true;
    const socket = getSocketInstance();

    // Connect socket if not connected
    if (!socket.connected) {
      socket.connect();
    }

    // Handle connect event
    const handleConnect = () => {
      if (!mountedRef.current) return;

      setIsConnected(true);
      setIsDisconnected(false);

      // Reset retry count on fresh connection
      retryHandlerRef.current.reset();

      // Join game on connect
      joinGame();
    };

    // Handle disconnect event
    const handleDisconnect = () => {
      if (!mountedRef.current) return;

      setIsConnected(false);
      setIsDisconnected(true);
      setIsSyncing(true);
    };

    // Handle reconnect (fires when socket reconnects after disconnect)
    const handleReconnect = () => {
      if (!mountedRef.current) return;

      setIsConnected(true);
      setIsDisconnected(false);

      // Reset retry count on reconnect
      retryHandlerRef.current.reset();

      // Re-join game on reconnect
      joinGame();
    };

    // Handle errors
    const handleError = (error: SocketErrorEvent) => {
      if (!mountedRef.current) return;

      const errorMessage = getErrorMessage(error);
      console.error("[useGameSocket] Socket error:", errorMessage);

      if (isGameNotFoundError(error)) {
        // Retry joinGame for "Game not found" errors
        const retryScheduled = retryHandlerRef.current.attempt(joinGame);
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

    // Register listeners
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("reconnect", handleReconnect);
    socket.on("error", handleError);

    // Initial connection check
    if (socket.connected) {
      handleConnect();
    }

    // Cleanup
    return () => {
      mountedRef.current = false;

      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("reconnect", handleReconnect);
      socket.off("error", handleError);

      retryHandlerRef.current.cleanup();
    };
  }, [gameId, getSocketInstance, joinGame, onError, onAuthError]);

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
