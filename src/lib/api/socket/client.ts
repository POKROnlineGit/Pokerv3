"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { createClientComponentClient } from "../supabase/client";
import type { ActiveStatusResponse } from "@/lib/types/tournament";

let socket: Socket | null = null;

/**
 * Get or create Socket.io connection (single source of truth)
 * Connects with Supabase auth token
 */
export function getSocket(): Socket {
  if (!socket) {
    const supabase = createClientComponentClient();

    // Get server URL - support both production and local
    let serverUrl =
      process.env.NEXT_PUBLIC_SERVER_WS_URL ||
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      "http://localhost:10000";

    // Normalize URL: convert ws:// to http:// and wss:// to https://
    if (serverUrl.startsWith("ws://")) {
      serverUrl = serverUrl.replace("ws://", "http://");
    } else if (serverUrl.startsWith("wss://")) {
      serverUrl = serverUrl.replace("wss://", "https://");
    }

    socket = io(serverUrl, {
      transports: ["websocket"], // WebSocket only - no polling
      autoConnect: false, // Manual connect
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    // Set up auth token refresh
    socket.on("connect", async () => {
      console.log("[Socket] ✅ Connected to poker server");

      // Refresh token on connect
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token && socket) {
        socket.auth = { token: session.access_token };
      }
    });

    socket.on("disconnect", (reason) => {
      console.log("[Socket] Disconnected:", reason);
    });

    socket.on("connect_error", async (error) => {
      console.error("[Socket] ❌ Connection error:", error.message);

      // Refresh token on connection error
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token && socket) {
        socket.auth = { token: session.access_token };
      }
    });

    // Refresh token on reconnection attempt
    socket.on("reconnect_attempt", async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token && socket) {
        socket.auth = { token: session.access_token };
      }
    });
  }

  // Set auth token before returning
  const supabase = createClientComponentClient();
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.access_token && socket) {
      socket.auth = { token: session.access_token };
    }
  });

  return socket;
}

/**
 * React hook wrapper for the shared socket instance.
 * Ensures the socket is connected when used in client components.
 */
export function useSocket(): Socket {
  const socketInstance = useMemo(() => getSocket(), []);

  useEffect(() => {
    if (!socketInstance.connected) {
      socketInstance.connect();
    }
  }, [socketInstance]);

  return socketInstance;
}

/**
 * Disconnect Socket.io connection
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Check if socket is connected
 */
export function isSocketConnected(): boolean {
  return socket?.connected ?? false;
}

/**
 * Check active status (game, tournament, queue) via socket
 * Returns consolidated status from backend
 */
export function checkActiveStatus(
  socketInstance: Socket
): Promise<ActiveStatusResponse> {
  return new Promise((resolve) => {
    if (!socketInstance.connected) {
      socketInstance.connect();
    }

    socketInstance.emit(
      "check_active_status",
      (response: ActiveStatusResponse) => {
        resolve(response);
      }
    );
  });
}

/**
 * Hook to check and manage active status
 * Automatically checks on mount and provides redirect logic
 */
export function useActiveStatus() {
  const socket = useSocket();
  const [status, setStatus] = useState<ActiveStatusResponse | null>(null);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const result = await checkActiveStatus(socket);
      setStatus(result);
    } catch (error) {
      console.error("[ActiveStatus] Error checking status:", error);
      setStatus({
        game: null,
        tournament: null,
        queue: null,
        error: "Failed to check status",
      });
    } finally {
      setChecking(false);
    }
  }, [socket]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Helper functions for checking blocking conditions
  const canJoinQueue = useCallback((): boolean => {
    if (!status) return false;
    return !status.game && !status.tournament;
  }, [status]);

  const canRegisterForTournament = useCallback((): boolean => {
    if (!status) return false;
    return !status.game && !status.tournament && !status.queue;
  }, [status]);

  return {
    status,
    checking,
    refresh,
    canJoinQueue,
    canRegisterForTournament,
  };
}
