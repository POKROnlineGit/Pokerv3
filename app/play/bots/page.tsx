"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/lib/socketClient";
import { useLocalGameStore } from "@/lib/hooks";
import { useTheme } from "@/components/providers/ThemeProvider";
import { MotionCard } from "@/components/motion/MotionCard";
import { Bot } from "lucide-react";
import { createClientComponentClient } from "@/lib/supabaseClient";

export const dynamic = "force-dynamic";

const BOT_NAMES: Record<string, string> = {
  "bot-1": "AggroBot",
  "bot-2": "TightBot",
  "bot-3": "CallingStation",
  "bot-4": "RandomBot",
  "bot-5": "SolidBot",
};

const BOT_DESCRIPTIONS: Record<string, string> = {
  "bot-1": "Aggressive player who bets and raises frequently",
  "bot-2": "Tight player who only plays strong hands",
  "bot-3": "Calls often, rarely folds",
  "bot-4": "Makes random decisions for unpredictable play",
  "bot-5": "Solid, balanced playing style",
};

export default function PlayBotsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const startLocalGame = useLocalGameStore((state) => state.startLocalGame);
  const { currentTheme } = useTheme();
  const socket = useSocket();
  const supabase = createClientComponentClient();

  const [isSocketConnected, setIsSocketConnected] = useState(false);

  // Get theme colors
  const accentColor = currentTheme.colors.accent[0];

  // Track socket connection status
  useEffect(() => {
    setIsSocketConnected(socket.connected);

    const handleConnect = () => {
      setIsSocketConnected(true);
    };

    const handleDisconnect = () => {
      setIsSocketConnected(false);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, [socket]);

  // Only redirect on gamestate received (not on session_status or queue checks)
  useEffect(() => {
    if (!socket || pathname !== "/play/bots") {
      return;
    }

    let mounted = true;

    const handleGameState = async (state: any) => {
      if (!mounted) return;

      // Skip local games (they use a different route)
      if (state.gameId && state.gameId.startsWith("local-")) {
        return;
      }

      // Check if game is finished/completed - don't redirect to finished games
      const gameStatus = state.status || state.currentPhase;
      if (
        gameStatus === "finished" ||
        gameStatus === "complete" ||
        gameStatus === "ended"
      ) {
        return;
      }

      // Verify user is a participant
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return;
      }

      const isParticipant = state.players?.some(
        (player: any) => player.id === user.id
      );
      if (!isParticipant) {
        return;
      }

      // Check if player has LEFT status - don't redirect if player has left
      const player = state.players?.find((p: any) => p.id === user.id);
      const isInLeftPlayers = state.left_players?.includes(user.id);
      if (player?.left || isInLeftPlayers) {
        return;
      }

      // Redirect to game
      if (state.gameId && (gameStatus === "starting" || gameStatus === "active")) {
        router.push(`/play/game/${state.gameId}`);
      }
    };

    socket.on("game_state", handleGameState);

    return () => {
      mounted = false;
      socket.off("game_state", handleGameState);
    };
  }, [socket, router, pathname, supabase]);

  const handlePlayLocal = () => {
    const gameId = `local-${crypto.randomUUID()}`;
    startLocalGame();
    router.push(`/play/local/${gameId}`);
  };

  return (
    <div className="min-h-screen relative">
      <div className="relative z-10">
        <div className="container mx-auto p-6 max-w-4xl">
          <h1 className="text-3xl font-bold mb-6">Play Bots</h1>
          <div className="space-y-8">
            {/* Bot Information Section */}
            <section>
              <div
                className="text-white px-6 py-4 rounded-t-xl"
                style={{
                  background: `linear-gradient(to right, ${accentColor}, ${
                    currentTheme.colors.accent[1] || accentColor
                  })`,
                }}
              >
                <h2 className="text-2xl font-bold">AI Bots</h2>
                <p className="text-sm text-white/80">
                  Practice against 5 different AI opponents
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6 bg-card rounded-b-xl">
                {Object.entries(BOT_NAMES).map(([botId, botName]) => (
                  <Card key={botId} className="bg-card/50">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div
                          className="p-2 rounded-lg"
                          style={{
                            backgroundColor: `${accentColor}20`,
                            color: accentColor,
                          }}
                        >
                          <Bot
                            className="h-5 w-5"
                            style={{ color: accentColor }}
                          />
                        </div>
                        <h3 className="font-semibold">{botName}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {BOT_DESCRIPTIONS[botId]}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            {/* Start Local Game Section */}
            <section>
              <div
                className="text-white px-6 py-4 rounded-t-xl"
                style={{
                  background: `linear-gradient(to right, ${accentColor}, ${
                    currentTheme.colors.accent[1] || accentColor
                  })`,
                }}
              >
                <h2 className="text-2xl font-bold">Start Local Game</h2>
                <p className="text-sm text-white/80">
                  Play offline against AI bots
                </p>
              </div>
              <div className="p-6 bg-card rounded-b-xl">
                <MotionCard
                  className="cursor-pointer bg-card rounded-xl overflow-hidden"
                  onClick={handlePlayLocal}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div
                        className="p-3 rounded-lg"
                        style={{
                          backgroundColor: `${accentColor}20`,
                          color: accentColor,
                        }}
                      >
                        <Bot
                          className="h-8 w-8"
                          style={{ color: accentColor }}
                        />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold">Play Local</h3>
                        <p className="text-sm text-muted-foreground">
                          Practice against 5 AI bots
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm text-muted-foreground mb-4">
                      <div className="flex justify-between">
                        <span>Mode:</span>
                        <span className="font-medium text-foreground">
                          Offline
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Opponents:</span>
                        <span className="font-medium text-foreground">
                          5 AI Bots
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Buy-in:</span>
                        <span className="font-medium text-foreground">
                          Free (Practice)
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      className="w-full"
                      size="lg"
                      disabled={!isSocketConnected}
                      style={{
                        background: `linear-gradient(to right, ${accentColor}, ${
                          currentTheme.colors.accent[1] || accentColor
                        })`,
                        color: "white",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSocketConnected) return;
                        e.currentTarget.style.background = `linear-gradient(to right, ${
                          currentTheme.colors.accent[1] || accentColor
                        }, ${
                          currentTheme.colors.accent[2] ||
                          currentTheme.colors.accent[1] ||
                          accentColor
                        })`;
                      }}
                      onMouseLeave={(e) => {
                        if (!isSocketConnected) return;
                        e.currentTarget.style.background = `linear-gradient(to right, ${accentColor}, ${
                          currentTheme.colors.accent[1] || accentColor
                        })`;
                      }}
                    >
                      <Bot className="mr-2 h-4 w-4" />
                      {!isSocketConnected ? "Connecting..." : "Start Local Game"}
                    </Button>
                  </CardContent>
                </MotionCard>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

