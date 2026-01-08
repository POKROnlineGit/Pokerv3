"use client";

import React, { useEffect, useState } from "react";
import { PlayLayout } from "@/components/play/PlayLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Globe2, Bot, ChevronRight, Crown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/supabaseClient";
import { useSocket } from "@/lib/socketClient";
import { useQueue } from "@/components/providers/QueueProvider";

export default function PlayRootPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const socket = useSocket();
  const { inQueue, queueType } = useQueue();
  const [checking, setChecking] = useState(true);

  // 1. Check if user is in an active game and redirect
  useEffect(() => {
    const checkActiveGame = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setChecking(false);
          return;
        }

        // Query active or starting games
        const { data: games } = await supabase
          .from("games")
          .select("id, player_ids, players, left_players")
          .in("status", ["active", "starting"]);

        if (games && games.length > 0) {
          // Find game where user is a player
          const userGame = games.find((g) => {
            const userIdStr = String(user.id);

            // Check if user left the game
            const leftPlayers = Array.isArray(g.left_players)
              ? g.left_players.map((id: any) => String(id))
              : [];
            if (leftPlayers.includes(userIdStr)) {
              return false;
            }

            // Check player_ids array
            if (g.player_ids && Array.isArray(g.player_ids)) {
              if (g.player_ids.some((id: any) => String(id) === userIdStr)) {
                return true;
              }
            }

            // Fallback: check players JSONB
            if (g.players && Array.isArray(g.players)) {
              return g.players.some((p: any) => {
                const playerId = p?.id || p?.user_id;
                return playerId && String(playerId) === userIdStr;
              });
            }

            return false;
          });

          if (userGame) {
            // Skip local games
            if (!userGame.id.startsWith("local-")) {
              // Check if this is a recently left game (race condition prevention)
              if (typeof window !== "undefined") {
                const recentlyLeftGame =
                  sessionStorage.getItem("recentlyLeftGame");
                const recentlyLeftTime =
                  sessionStorage.getItem("recentlyLeftTime");
                const timeSinceLeave = recentlyLeftTime
                  ? Date.now() - parseInt(recentlyLeftTime)
                  : Infinity;

                // Don't redirect if this game was left within last 3 seconds
                if (userGame.id === recentlyLeftGame && timeSinceLeave < 3000) {
                  return;
                }
              }

              router.push(`/play/game/${userGame.id}`);
              return;
            }
          }
        }
      } catch (error) {
        console.error("Error checking active game:", error);
      } finally {
        setChecking(false);
      }
    };

    checkActiveGame();
  }, [supabase, router]);

  // 1.1. Listen for match_found events to redirect immediately
  useEffect(() => {
    if (!socket) return;

    const handleMatchFound = (data: { gameId: string }) => {
      if (data?.gameId) {
        // Redirect immediately when match is found
        router.push(`/play/game/${data.gameId}`);
      }
    };

    socket.on("match_found", handleMatchFound);

    return () => {
      socket.off("match_found", handleMatchFound);
    };
  }, [socket, router]);

  // 2. Check if user is in queue and redirect to online lobby
  useEffect(() => {
    if (!checking && inQueue && queueType) {
      router.push("/play/online");
    }
  }, [checking, inQueue, queueType, router]);

  // Don't render content while checking
  if (checking) {
    return (
      <PlayLayout title="Select Game Mode">
        <div className="flex items-center justify-center py-10">
          <div className="text-center text-slate-400">Loading...</div>
        </div>
      </PlayLayout>
    );
  }
  return (
    <PlayLayout title="Select Game Mode">
      <div className="space-y-4">
        <Link href="/play/online" className="block group">
          <Card className="!bg-[hsl(222.2,84%,4.9%)] border-slate-700 group-hover:border-slate-600 group-hover:!bg-slate-800 group-hover:shadow-lg">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-slate-800/50 flex items-center justify-center">
                  <Globe2 className="h-4 w-4 text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-white">Play Online</h3>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-500 group-hover:translate-x-1 transition-transform" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/play/bots" className="block group">
          <Card className="!bg-[hsl(222.2,84%,4.9%)] border-slate-700 group-hover:border-slate-600 group-hover:!bg-slate-800 group-hover:shadow-lg">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-slate-800/50 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-white">Play Bots</h3>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-500 group-hover:translate-x-1 transition-transform" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/play/host" className="block group">
          <Card className="!bg-[hsl(222.2,84%,4.9%)] border-slate-700 group-hover:border-slate-600 group-hover:!bg-slate-800 group-hover:shadow-lg">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-slate-800/50 flex items-center justify-center">
                  <Crown className="h-4 w-4 text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-white">Host Game</h3>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-500 group-hover:translate-x-1 transition-transform" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </PlayLayout>
  );
}
