"use client";

import React, { useEffect, useState, useRef } from "react";
import { PlayLayout } from "@/components/layout/PlayLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Globe2, Bot, ChevronRight, Crown, Loader2, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/api/supabase/client";
import { useSocket, checkActiveStatus } from "@/lib/api/socket/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/lib/hooks";
import type { ActiveStatusResponse } from "@/lib/types/tournament";

export default function PlayRootPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const socket = useSocket();
  const [checking, setChecking] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [isJoiningCode, setIsJoiningCode] = useState(false);
  const { toast } = useToast();
  const hasRedirectedRef = useRef(false);

  // Consolidated active status check via socket
  useEffect(() => {
    if (hasRedirectedRef.current) return;

    const handleActiveStatus = (status: ActiveStatusResponse) => {
      if (hasRedirectedRef.current) return;
      
      // Check for recently left game (race condition prevention)
      if (typeof window !== "undefined" && status.game) {
        const recentlyLeftGame = sessionStorage.getItem("recentlyLeftGame");
        const recentlyLeftTime = sessionStorage.getItem("recentlyLeftTime");
        const timeSinceLeave = recentlyLeftTime
          ? Date.now() - parseInt(recentlyLeftTime)
          : Infinity;
        
        // Skip redirect if this game was left within last 3 seconds
        if (status.game.gameId === recentlyLeftGame && timeSinceLeave < 3000) {
          setChecking(false);
          return;
        }
      }

      // Priority 1: Active game (tournament or regular)
      if (status.game) {
        hasRedirectedRef.current = true;
        if (status.game.isTournament) {
          router.push(`/play/tournaments/game/${status.game.gameId}`);
        } else {
          router.push(`/play/game/${status.game.gameId}`);
        }
        return;
      }

      // Priority 2: Tournament involvement (registered or hosting)
      if (status.tournament) {
        hasRedirectedRef.current = true;
        if (status.tournament.status === "active" && status.tournament.tableId) {
          // Active tournament with assigned table - go to game
          router.push(`/play/tournaments/game/${status.tournament.tableId}`);
        } else {
          // Setup, registration, paused, or waiting for table - go to lobby
          router.push(`/play/tournaments/${status.tournament.tournamentId}`);
        }
        return;
      }

      // Priority 3: In queue - redirect to online page
      if (status.queue) {
        hasRedirectedRef.current = true;
        router.push("/play/online");
        return;
      }

      // Not in anything - allow normal navigation
      setChecking(false);
    };

    const performCheck = async () => {
      try {
        // Wait for socket to be connected
        if (!socket.connected) {
          socket.connect();
          // Wait a moment for connection
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        const status = await checkActiveStatus(socket);
        
        if (status.error) {
          console.error("[PlayPage] Active status error:", status.error);
          setChecking(false);
          return;
        }

        handleActiveStatus(status);
      } catch (error) {
        console.error("[PlayPage] Error checking active status:", error);
        setChecking(false);
      }
    };

    performCheck();
  }, [socket, router]);

  // Listen for match_found events to redirect immediately
  useEffect(() => {
    if (!socket) return;

    const handleMatchFound = (data: { gameId: string; tournamentId?: string }) => {
      if (data?.gameId) {
        hasRedirectedRef.current = true;
        // Check if this is a tournament game
        if (data.tournamentId) {
          router.push(`/play/tournaments/game/${data.gameId}`);
        } else {
          router.push(`/play/game/${data.gameId}`);
        }
      }
    };

    socket.on("match_found", handleMatchFound);

    return () => {
      socket.off("match_found", handleMatchFound);
    };
  }, [socket, router]);

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

        <Link href="/play/tournaments" className="block group">
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
