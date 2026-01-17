"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSocket } from "@/lib/api/socket/client";
import { createClientComponentClient } from "@/lib/api/supabase/client";
import type { GameState } from "@/lib/types/poker";

export type StatusType = "error" | "warning" | "success" | "info";

export interface StatusItem {
  id: string;
  priority: number;
  type: StatusType;
  title: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface StatusContextType {
  activeStatuses: Record<string, StatusItem>;
  setStatus: (item: StatusItem) => void;
  clearStatus: (id: string) => void;
  currentStatus: StatusItem | null;
}

const StatusContext = createContext<StatusContextType | undefined>(undefined);

export function useStatus() {
  const context = useContext(StatusContext);
  if (!context) {
    throw new Error("useStatus must be used within StatusProvider");
  }
  return context;
}

export function StatusProvider({ children }: { children: ReactNode }) {
  const [activeStatuses, setActiveStatuses] = useState<Record<string, StatusItem>>({});
  const pathname = usePathname();
  const router = useRouter();
  const isRedirectingRef = useRef<boolean>(false);
  const supabase = createClientComponentClient();

  const setStatus = useCallback((item: StatusItem) => {
    setActiveStatuses((prev) => ({
      ...prev,
      [item.id]: item,
    }));
  }, []);

  const clearStatus = useCallback((id: string) => {
    setActiveStatuses((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  }, []);

  const currentStatus = useMemo(() => {
    const statuses = Object.values(activeStatuses);
    if (statuses.length === 0) return null;
    // Sort by priority descending and return the highest priority status
    return statuses.sort((a, b) => b.priority - a.priority)[0];
  }, [activeStatuses]);

  // Global Game Listener: Redirect users back to active games
  useEffect(() => {
    const socket = getSocket();
    
    // Ensure socket is connected
    if (!socket.connected) {
      socket.connect();
    }

    const handleGameState = async (state: GameState) => {
      // Determine if this is a private game
      const isPrivate = (state as any).isPrivate || false;
      
      // Determine the correct game path based on game type
      const gamePath = isPrivate 
        ? `/play/private/${state.gameId}`
        : `/play/game/${state.gameId}`;
      
      // Reset redirect flag if we're already on the game page (check both routes)
      const isOnGamePage = pathname === `/play/game/${state.gameId}` || 
                          pathname === `/play/private/${state.gameId}`;
      if (isOnGamePage) {
        isRedirectingRef.current = false;
        return;
      }

      // Guard: Prevent duplicate redirects
      if (isRedirectingRef.current) {
        return;
      }

      // Check if game is finished/completed - don't redirect to finished games
      const gameStatus = state.status || (state as any).currentPhase;
      if (
        gameStatus === "finished" ||
        gameStatus === "complete" ||
        gameStatus === "ended"
      ) {
        return; // Don't redirect to completed games
      }

      // Verify user is a participant
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return;
      }

      const isParticipant = state.players?.some((player) => player.id === user.id);
      if (!isParticipant) {
        return;
      }

      // Check if player has LEFT status - don't redirect if player has left
      const player = state.players?.find((p) => p.id === user.id);
      const isInLeftPlayers = state.left_players?.includes(user.id);
      const isPermanentlyOut =
        player?.status === "LEFT" ||
        player?.status === "REMOVED" ||
        player?.left ||
        isInLeftPlayers;
      if (isPermanentlyOut) {
        return; // Don't redirect if player has left or been removed from the game
      }

      // Check if this is a recently left game (race condition prevention)
      if (typeof window !== "undefined") {
        const recentlyLeftGame = sessionStorage.getItem("recentlyLeftGame");
        const recentlyLeftTime = sessionStorage.getItem("recentlyLeftTime");
        const timeSinceLeave = recentlyLeftTime
          ? Date.now() - parseInt(recentlyLeftTime)
          : Infinity;

        // Ignore gameState if this game was left within last 3 seconds
        if (state.gameId === recentlyLeftGame && timeSinceLeave < 3000) {
          return;
        }
      }

      // All conditions met: trigger redirect sequence
      isRedirectingRef.current = true;

      // Set status
      setStatus({
        id: "active-game",
        priority: 60,
        type: "success",
        title: "Active Game Found",
        message: "Redirecting you back to your game...",
      });

      // Redirect after delay (similar to match_found behavior)
      setTimeout(() => {
        // Use the correct route based on game type
        const redirectPath = isPrivate 
          ? `/play/private/${state.gameId}`
          : `/play/game/${state.gameId}`;
        router.push(redirectPath);
        // Clear status after navigation
        setTimeout(() => {
          clearStatus("active-game");
          isRedirectingRef.current = false;
        }, 500);
      }, 1500);
    };

    socket.on("gameState", handleGameState);

    return () => {
      socket.off("gameState", handleGameState);
    };
  }, [pathname, router, setStatus, clearStatus, supabase]);

  return (
    <StatusContext.Provider
      value={{
        activeStatuses,
        setStatus,
        clearStatus,
        currentStatus,
      }}
    >
      {children}
    </StatusContext.Provider>
  );
}

