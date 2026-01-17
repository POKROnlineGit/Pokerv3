"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClientComponentClient } from "@/lib/api/supabase/client";

/**
 * Global hook that automatically redirects users to their game
 * when it's created, regardless of what page they're on.
 *
 * Works on any page, even if tab is in background.
 */
export function useGameRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClientComponentClient();

  useEffect(() => {
    let mounted = true;
    let channel: any = null;

    const setupRedirect = async () => {
      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || !mounted) return;

      // Helper function to check if user is a player in the game
      const isUserInGame = (game: any, userId: string): boolean => {
        // First check player_ids array (generated column)
        const playerIds = game.player_ids || [];
        const userIdStr = String(userId);
        const playerIdsStr = Array.isArray(playerIds)
          ? playerIds.map((id: any) => String(id))
          : [];

        const leftPlayers = Array.isArray(game.left_players)
          ? game.left_players.map((id: any) => String(id))
          : [];

        if (leftPlayers.includes(userIdStr)) {
          return false;
        }

        if (playerIdsStr.includes(userIdStr)) {
          return true;
        }

        // Fallback: check players JSONB directly (in case player_ids is not populated yet)
        const players = game.players || [];
        if (Array.isArray(players)) {
          return players.some((p: any) => {
            const playerId = p?.id || p?.user_id;
            return playerId && String(playerId) === userIdStr;
          });
        }

        return false;
      };

      // Helper function to handle game redirect
      const handleGameRedirect = (
        game: any,
        eventType: "INSERT" | "UPDATE"
      ) => {
        if (!mounted) return;

        const gameId = game.id;
        const gameStatus = game.status;

        // Skip local games (they use a different route)
        if (gameId.startsWith("local-")) {
          return;
        }

        // Check if current user is in the game
        if (!isUserInGame(game, user.id)) {
          return;
        }

        // Only redirect if game is starting or active
        if (gameStatus === "starting" || gameStatus === "active") {
          // Don't redirect if already on the game page
          if (pathname === `/play/game/${gameId}`) {
            return;
          }

          // Small delay to ensure game is fully set up
          setTimeout(() => {
            if (mounted) {
              router.push(`/play/game/${gameId}`);
            }
          }, 100);
        }
      };

      // Subscribe to game INSERT events (when game is created)
      channel = supabase
        .channel(`game-redirect-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "games",
            // No filter - we'll check player_ids in JavaScript
          },
          (payload) => {
            handleGameRedirect(payload.new, "INSERT");
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "games",
            // Listen for status changes to 'starting' or 'active'
            filter: `status=in.(starting,active)`,
          },
          (payload) => {
            // Only process if status changed to starting/active (not if it was already)
            const oldStatus = payload.old?.status;
            const newStatus = payload.new?.status;
            if (
              oldStatus !== newStatus &&
              (newStatus === "starting" || newStatus === "active")
            ) {
              handleGameRedirect(payload.new, "UPDATE");
            }
          }
        )
        .subscribe();
    };

    setupRedirect();

    // Cleanup
    return () => {
      mounted = false;
      if (channel) {
        channel.unsubscribe();
      }
    };
  }, [router, supabase, pathname]);
}
