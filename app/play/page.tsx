"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/lib/socketClient";
import { useToast } from "@/lib/hooks";
import { useQueue } from "@/components/providers/QueueProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { Users, User, Zap, Shield } from "lucide-react";

// Keep this route dynamic so it always reflects current game state
export const dynamic = "force-dynamic";

// Type definition based on the DB schema
interface GameVariant {
  id: string;
  slug: string;
  name: string;
  description?: string;
  max_players: number;
  category: string;
  config: {
    blinds?: {
      small?: number;
      big?: number;
    };
    buyIn?: number;
    [key: string]: any;
  };
}

export default function PlayPage() {
  const router = useRouter();
  const socket = useSocket();
  const { toast } = useToast();
  const { inQueue, queueType } = useQueue();
  const { currentTheme } = useTheme();

  const [inGame, setInGame] = useState(false);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [variants, setVariants] = useState<GameVariant[]>([]);
  const [isLoadingVariants, setIsLoadingVariants] = useState(true);

  // Get theme colors
  const accentColor = currentTheme.colors.accent[0];

  // 1. Fetch Variants on Mount (With Error Handling & Validation)
  useEffect(() => {
    fetch("/api/variants")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        console.log("[PlayPage] API Response:", data); // Debug log
        if (Array.isArray(data)) {
          console.log("[PlayPage] Raw variants count:", data.length); // Debug log
          // Filter out invalid variants (Safety Check)
          const validVariants = data.filter((v) => {
            const isValid =
              v.id && v.slug && v.name && typeof v.max_players === "number";
            if (!isValid) {
              console.warn("[PlayPage] Invalid variant:", v); // Debug log
            }
            return isValid;
          });
          console.log("[PlayPage] Valid variants count:", validVariants.length); // Debug log
          setVariants(validVariants);

          if (validVariants.length < data.length) {
            console.warn(
              `Filtered out ${
                data.length - validVariants.length
              } invalid variants`
            );
          }
        } else if (data.error) {
          throw new Error(data.error);
        } else {
          // Handle case where response is not an array and has no error
          console.error("[PlayPage] Unexpected response format:", data);
          setVariants([]);
        }
        setIsLoadingVariants(false);
      })
      .catch((err) => {
        console.error("Failed to load variants", err);
        toast({
          title: "Failed to load game variants",
          description:
            "Unable to connect to the server. Please try again later.",
          variant: "destructive",
        });
        setIsLoadingVariants(false);
        setVariants([]); // Ensure variants is set to empty array on error
      });
  }, [toast]);

  // 2. Check for active session
  useEffect(() => {
    if (!socket) return;
    const safetyTimeout = setTimeout(() => {
      if (isChecking && socket.connected) setIsChecking(false);
    }, 5000);

    const onSessionStatus = (data: {
      inGame: boolean;
      gameId: string | null;
    }) => {
      setInGame(data.inGame);
      setActiveGameId(data.gameId);
      if (socket.connected) setIsChecking(false);
    };

    socket.on("session_status", onSessionStatus);

    const onConnect = () => socket.emit("check_active_session");
    if (socket.connected) onConnect();
    socket.on("connect", onConnect);

    return () => {
      clearTimeout(safetyTimeout);
      socket.off("session_status", onSessionStatus);
      socket.off("connect", onConnect);
    };
  }, [socket, isChecking]);

  // 3. Redirect if already in queue
  useEffect(() => {
    if (inQueue && queueType) {
      router.push(`/play/queue?type=${queueType}`);
    }
  }, [inQueue, queueType, router]);

  const joinQueue = (slug: string) => {
    if (inGame) {
      toast({
        title: "Cannot join queue",
        description: activeGameId
          ? "You are already in an active game."
          : "You are currently in a game.",
        variant: "destructive",
      });
      return;
    }
    if (inQueue) {
      toast({
        title: "Already in queue",
        description: "You are already in a queue.",
        variant: "default",
      });
      return;
    }
    router.push(`/play/queue?type=${slug}`);
  };

  const handleRejoin = () => {
    if (activeGameId) router.push(`/play/game/${activeGameId}`);
  };

  const handlePlayLocal = () => {
    const localGameId = `local-${crypto.randomUUID()}`;
    router.push(`/play/local/${localGameId}`);
  };

  const isButtonDisabled = inQueue || isChecking || !socket.connected;
  const buttonText = !socket.connected
    ? "Connecting..."
    : inQueue
    ? "Already in Queue"
    : "Join Queue";

  return (
    <div className="min-h-screen relative">
      <div className="relative z-10 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Rejoin Banner */}
          {inGame && activeGameId && (
            <div className="bg-amber-900/20 border border-amber-900/50 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-full">
                  <Zap className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-medium text-amber-500">
                    Active Game Found
                  </h3>
                  <p className="text-sm text-amber-500/80">
                    You are currently in an unfinished game.
                  </p>
                </div>
              </div>
              <Button
                onClick={handleRejoin}
                className="bg-amber-600 hover:bg-amber-700 text-white border-none"
              >
                Rejoin Game
              </Button>
            </div>
          )}

          {/* Dynamic Game Variants */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight mb-4">
              Find a Game
            </h2>
            {isLoadingVariants ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2].map((i) => (
                  <Card key={i} className="bg-card/50 animate-pulse h-48" />
                ))}
              </div>
            ) : variants.length === 0 ? (
              <div className="text-center py-12 bg-card/20 rounded-lg border border-border/50">
                <p className="text-muted-foreground">
                  No game variants available at this time.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {variants.map((variant) => (
                  <Card
                    key={variant.id}
                    className="bg-card border-border/50 transition-all hover:border-primary/50 hover:shadow-md"
                  >
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div
                          className="p-2 rounded-lg"
                          style={{
                            backgroundColor: `${currentTheme.colors.primary[0]}20`,
                          }}
                        >
                          {variant.max_players === 2 ? (
                            <User
                              className="h-6 w-6"
                              style={{ color: currentTheme.colors.accent[0] }}
                            />
                          ) : (
                            <Users
                              className="h-6 w-6"
                              style={{ color: currentTheme.colors.accent[0] }}
                            />
                          )}
                        </div>
                        {variant.category === "tournament" && (
                          <span className="px-2 py-1 rounded text-xs bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                            Tournament
                          </span>
                        )}
                      </div>
                      <CardTitle className="mt-4">{variant.name}</CardTitle>
                      <CardDescription>
                        {variant.description ||
                          `${variant.max_players}-Player ${
                            variant.category === "cash" ? "Cash Game" : "Game"
                          }`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Blinds</span>
                          <span className="font-medium text-foreground">
                            {variant.config?.blinds?.small || 1}/
                            {variant.config?.blinds?.big || 2}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Buy-in</span>
                          <span className="font-medium text-foreground">
                            {variant.config?.buyIn || 100}
                          </span>
                        </div>
                        <Button
                          className="w-full font-semibold shadow-lg transition-all active:scale-[0.98]"
                          style={{
                            backgroundColor: currentTheme.colors.accent[0],
                            color: "#ffffff",
                          }}
                          onClick={() => joinQueue(variant.slug)}
                          disabled={isButtonDisabled}
                        >
                          {buttonText}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Local Game Section */}
          <div>
            <h2 className="text-2xl font-bold tracking-tight mb-4">
              Host a Game
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card className="bg-card border-border/50">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <Shield className="h-6 w-6 text-blue-500" />
                    </div>
                  </div>
                  <CardTitle className="mt-4">Local Game</CardTitle>
                  <CardDescription>
                    Play offline against bots to practice
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    className="w-full border-blue-500/20 hover:bg-blue-500/10 text-blue-500"
                    onClick={handlePlayLocal}
                  >
                    Start Local Game
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
