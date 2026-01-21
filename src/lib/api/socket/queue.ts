"use client";

/**
 * Feature hook for matchmaking queue
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "../supabase/client";
import { useSocket } from "./client";
import { getErrorMessage } from "./utils/errors";

import type {
  MatchFoundEvent,
  QueueUpdateEvent,
  QueueInfoEvent,
} from "./types/game";

// ============================================
// TYPES
// ============================================

export interface QueueStatus {
  count: number;
  needed: number;
  target: number;
}

export interface UseQueueSocketOptions {
  onMatchFound?: (gameId: string) => void;
  onQueueUpdate?: (data: QueueUpdateEvent) => void;
  onError?: (error: string) => void;
}

export interface UseQueueSocketReturn {
  isConnected: boolean;
  isLoading: boolean;
  queueStatus: QueueStatus | null;
  error: string | null;
  leaveQueue: () => void;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

/**
 * Hook for matchmaking queue functionality
 */
export function useQueueSocket(
  queueType: string,
  options: UseQueueSocketOptions = {}
): UseQueueSocketReturn {
  const { onMatchFound, onQueueUpdate, onError } = options;

  const router = useRouter();
  const supabase = createClientComponentClient();
  const socket = useSocket();

  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const handleConnect = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      setIsLoading(false);
    };

    const handleDisconnect = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
    };

    const handleMatchFound = (payload: MatchFoundEvent) => {
      if (!mountedRef.current) return;

      if (payload?.gameId) {
        if (onMatchFound) {
          onMatchFound(payload.gameId);
        } else {
          router.push(`/play/game/${payload.gameId}`);
        }
      }
    };

    const handleQueueUpdate = (payload: QueueUpdateEvent) => {
      if (!mountedRef.current) return;
      setIsLoading(false);
      onQueueUpdate?.(payload);
    };

    const handleQueueInfo = (data: QueueInfoEvent) => {
      if (!mountedRef.current) return;

      if (data.queueType === queueType) {
        setQueueStatus({
          count: data.count,
          needed: data.needed,
          target: data.target,
        });
      }
    };

    // Initial connected state
    setIsConnected(socket.connected);

    // Register listeners
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("match_found", handleMatchFound);
    socket.on("queue_update", handleQueueUpdate);
    socket.on("queue_info", handleQueueInfo);

    // Join queue
    const emitJoinQueue = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/");
          return;
        }

        socket.emit("join_queue", { queueType });
      } catch (err: unknown) {
        console.error("[useQueueSocket] Error joining queue:", err);
        if (mountedRef.current) {
          const errorMsg = getErrorMessage(err);
          setError(errorMsg);
          setIsLoading(false);
          onError?.(errorMsg);
        }
      }
    };

    if (socket.connected) {
      emitJoinQueue();
    } else {
      socket.once("connect", emitJoinQueue);
    }

    return () => {
      mountedRef.current = false;

      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("match_found", handleMatchFound);
      socket.off("queue_update", handleQueueUpdate);
      socket.off("queue_info", handleQueueInfo);
      socket.off("connect", emitJoinQueue);
    };
  }, [socket, supabase, router, queueType, onMatchFound, onQueueUpdate, onError]);

  const leaveQueue = useCallback(() => {
    socket.emit("leave_queue", { queueType });
  }, [socket, queueType]);

  return {
    isConnected,
    isLoading,
    queueStatus,
    error,
    leaveQueue,
  };
}
