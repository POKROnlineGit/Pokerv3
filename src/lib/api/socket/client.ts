"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { createClientComponentClient } from "../supabase/client";
import type { ActiveStatusResponse } from "@/lib/types/tournament";

let socket: Socket | null = null;

/**
 * Ensure socket auth token is set BEFORE connecting.
 * This prevents handshake auth races that can cause rapid reconnect loops.
 */
export async function prepareSocketAuth(socketInstance?: Socket | null): Promise<void> {
  const s = socketInstance ?? socket;
  if (!s) return;

  try {
    const supabase = createClientComponentClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      s.auth = { token: session.access_token };
    }
  } catch {
    // Ignore auth refresh failures; server will reject if token is invalid/missing.
  }
}

/**
 * Connect the shared socket instance with auth prepared first.
 */
export async function connectSocketWithAuth(socketInstance?: Socket): Promise<Socket> {
  const s = socketInstance ?? getSocket();
  await prepareSocketAuth(s);
  if (!s.connected) {
    s.connect();
  }
  return s;
}

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

    socket.on("connect", () => {
      console.log("[Socket] ✅ Connected to poker server");
    });

    socket.on("disconnect", (reason) => {
      console.log("[Socket] Disconnected:", reason);
    });

    socket.on("connect_error", async (error) => {
      console.error("[Socket] ❌ Connection error:", error.message);

      // Refresh token on connection error
      await prepareSocketAuth(socket);
    });

    // Refresh token on reconnection attempt
    socket.on("reconnect_attempt", async () => {
      await prepareSocketAuth(socket);
    });
  }

  // Set auth token before returning
  // Note: this is intentionally "fire and forget" to keep getSocket synchronous.
  void prepareSocketAuth(socket);

  return socket;
}

/**
 * React hook wrapper for the shared socket instance.
 * Ensures the socket is connected when used in client components.
 */
export function useSocket(): Socket {
  const socketInstance = useMemo(() => getSocket(), []);

  useEffect(() => {
    void connectSocketWithAuth(socketInstance);
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
    void (async () => {
      await connectSocketWithAuth(socketInstance);
      socketInstance.emit(
        "check_active_status",
        (response: ActiveStatusResponse) => {
          resolve(response);
        }
      );
    })();
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
