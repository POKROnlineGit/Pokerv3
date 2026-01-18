"use client";

import React, { useEffect, useState } from "react";
import { PlayLayout } from "@/components/layout/PlayLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Globe2, Bot, ChevronRight, Crown, Loader2, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/api/supabase/client";
import { useSocket } from "@/lib/api/socket/client";
import { useQueue } from "@/components/providers/QueueProvider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/lib/hooks";

export default function PlayRootPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const socket = useSocket();
  const { inQueue, queueType } = useQueue();
  const [checking, setChecking] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [isJoiningCode, setIsJoiningCode] = useState(false);
  const { toast } = useToast();

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

  const handleJoinByCode = async () => {
    // Validate format: 5 alphanumeric characters
    const codeRegex = /^[A-Z0-9]{5}$/;
    if (!joinCode || !codeRegex.test(joinCode)) {
      return;
    }

    setIsJoiningCode(true);

    try {
      const { data: gameId, error } = await supabase.rpc("resolve_join_code", {
        p_code: joinCode,
      });

      if (error || !gameId) {
        toast({
          title: "Game Not Found",
          description: "Could not find a game with that code.",
          variant: "destructive",
        });
        return;
      }

      router.push(`/play/private/${gameId}`);
    } catch (err) {
      console.error(err);
      toast({
        title: "Game Not Found",
        description: "Could not find a game with that code.",
        variant: "destructive",
      });
    } finally {
      setIsJoiningCode(false);
    }
  };

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
    <PlayLayout
      title="Select Game Mode"
      footer={
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Enter Game Code"
              value={joinCode}
              onChange={(e) => {
                const upperValue = e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 5);
                setJoinCode(upperValue);
              }}
              maxLength={5}
              className="uppercase font-mono flex-1 text-center"
              onKeyDown={(e) => {
                if (e.key === "Enter" && joinCode.length === 5) {
                  handleJoinByCode();
                }
              }}
            />
            <Button
              onClick={handleJoinByCode}
              disabled={isJoiningCode || joinCode.length !== 5}
              variant="secondary"
              className="min-w-[60px]"
            >
              {isJoiningCode ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Join"
              )}
            </Button>
          </div>
        </div>
      }
    >
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

        <Link href="/play/tournaments/create" className="block group">
          <Card className="!bg-[hsl(222.2,84%,4.9%)] border-slate-700 group-hover:border-slate-600 group-hover:!bg-slate-800 group-hover:shadow-lg">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-slate-800/50 flex items-center justify-center">
                  <Trophy className="h-4 w-4 text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-white">Create Tournament</h3>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-500 group-hover:translate-x-1 transition-transform" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </PlayLayout>
  );
}
