"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/lib/socketClient";
import { useToast, useLocalGameStore } from "@/lib/hooks";
import { useQueue } from "@/components/providers/QueueProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { MotionCard } from "@/components/motion/MotionCard";
import { Users, User, Play, Bot } from "lucide-react";

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
  const startLocalGame = useLocalGameStore((state) => state.startLocalGame);
  const { toast } = useToast();
  const { inQueue, queueType } = useQueue();
  const { currentTheme } = useTheme();
  const socket = useSocket();

  const [inGame, setInGame] = useState(false);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [variants, setVariants] = useState<GameVariant[]>([]);
  const [isLoadingVariants, setIsLoadingVariants] = useState(true);

  // Get theme colors
  const primaryColor = currentTheme.colors.primary[0];
  const gradientColors = currentTheme.colors.gradient;
  const accentColor = currentTheme.colors.accent[0];
  const centerColor =
    currentTheme.colors.primary[2] || currentTheme.colors.primary[1];

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

  // 2. Track socket connection status
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

  // 3. Check for active session
  useEffect(() => {
    let mounted = true;
    let connectHandler: (() => void) | null = null;

    const handleSessionStatus = (payload: {
      active?: boolean;
      gameId?: string | null;
    }) => {
      if (!mounted) return;
      const isActive = !!payload?.active && !!payload?.gameId;
      setInGame(isActive);
      setActiveGameId(isActive ? String(payload!.gameId) : null);
      if (socket.connected) {
        setIsChecking(false);
      }

      // Automatic redirect to active game
      if (isActive && payload?.gameId) {
        router.push(`/play/game/${payload.gameId}`);
      }
    };

    socket.on("session_status", handleSessionStatus);

    const emitCheckSession = () => {
      if (!mounted) return;
      setIsChecking(true);
      socket.emit("check_active_session");
    };

    if (socket.connected) {
      emitCheckSession();
    } else {
      connectHandler = () => {
        if (mounted) {
          emitCheckSession();
        }
      };
      socket.once("connect", connectHandler);
    }

    const timeoutId = setTimeout(() => {
      if (!mounted) return;
      if (socket.connected) {
        setInGame(false);
        setActiveGameId(null);
        setIsChecking(false);
        socket.off("session_status", handleSessionStatus);
      }
    }, 5000);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      socket.off("session_status", handleSessionStatus);
      if (connectHandler) {
        socket.off("connect", connectHandler);
      }
    };
  }, [socket, router]);

  // 4. Redirect if already in queue
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
    const gameId = `local-${crypto.randomUUID()}`;
    startLocalGame();
    router.push(`/play/local/${gameId}`);
  };

  const isButtonDisabled = inQueue || isChecking || !isSocketConnected;

  return (
    <div className="min-h-screen relative">
      {/* --- SCROLLABLE CONTENT LAYER --- */}
      <div className="relative z-10 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Find a Game Section */}
          <section>
            <div
              className="text-white px-6 py-4 rounded-t-xl"
              style={{
                background: `linear-gradient(to right, ${accentColor}, ${
                  currentTheme.colors.accent[1] || accentColor
                })`,
              }}
            >
              <h2 className="text-2xl font-bold">Find a Game</h2>
              <p className="text-sm text-white/80">
                Join an online multiplayer table
              </p>
            </div>
            {isLoadingVariants ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-card rounded-b-xl">
                {[1, 2].map((i) => (
                  <Card key={i} className="bg-card/50 animate-pulse h-48" />
                ))}
              </div>
            ) : variants.length === 0 ? (
              <div className="p-6 bg-card rounded-b-xl">
                <div className="text-center py-12 bg-card/20 rounded-lg border border-border/50">
                  <p className="text-muted-foreground">
                    No game variants available at this time.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-card rounded-b-xl">
                {variants.map((variant) => (
                  <MotionCard
                    key={variant.id}
                    className={`${
                      inGame || inQueue
                        ? "cursor-not-allowed opacity-60"
                        : "cursor-pointer"
                    } bg-card rounded-xl overflow-hidden`}
                    onClick={() =>
                      !inGame && !inQueue && joinQueue(variant.slug)
                    }
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
                          {variant.max_players === 2 ? (
                            <User
                              className="h-8 w-8"
                              style={{ color: accentColor }}
                            />
                          ) : (
                            <Users
                              className="h-8 w-8"
                              style={{ color: accentColor }}
                            />
                          )}
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold">
                            {variant.name}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {variant.description ||
                              `${variant.max_players}-Player ${
                                variant.category === "cash"
                                  ? "Cash Game"
                                  : "Game"
                              }`}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm text-muted-foreground mb-4">
                        <div className="flex justify-between">
                          <span>Blinds:</span>
                          <span className="font-medium text-foreground">
                            {variant.config?.blinds?.small || 1}/
                            {variant.config?.blinds?.big || 2}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Buy-in:</span>
                          <span className="font-medium text-foreground">
                            {variant.config?.buyIn || 100} chips
                          </span>
                        </div>
                      </div>
                      <Button
                        className="w-full"
                        size="lg"
                        disabled={
                          inGame || inQueue || isChecking || !isSocketConnected
                        }
                        onClick={() => joinQueue(variant.slug)}
                        style={{
                          background: `linear-gradient(to right, ${accentColor}, ${
                            currentTheme.colors.accent[1] || accentColor
                          })`,
                          color: "white",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = `linear-gradient(to right, ${
                            currentTheme.colors.accent[1] || accentColor
                          }, ${
                            currentTheme.colors.accent[2] ||
                            currentTheme.colors.accent[1] ||
                            accentColor
                          })`;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = `linear-gradient(to right, ${accentColor}, ${
                            currentTheme.colors.accent[1] || accentColor
                          })`;
                        }}
                      >
                        <Play className="mr-2 h-4 w-4" />
                        {inGame
                          ? "In Game"
                          : inQueue
                          ? "Already in Queue"
                          : !isSocketConnected
                          ? "Connecting..."
                          : "Join Queue"}
                      </Button>
                    </CardContent>
                  </MotionCard>
                ))}
              </div>
            )}
          </section>

          {/* Host a Game Section */}
          <section>
            <div
              className="text-white px-6 py-4 rounded-t-xl"
              style={{
                background: `linear-gradient(to right, ${accentColor}, ${
                  currentTheme.colors.accent[1] || accentColor
                })`,
              }}
            >
              <h2 className="text-2xl font-bold">Host a Game</h2>
              <p className="text-sm text-white/80">
                Play offline against AI bots
              </p>
            </div>
            <div className="p-6 bg-card rounded-b-xl">
              {inGame && activeGameId && (
                <div className="mb-4 flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    You have an active game. You can rejoin it here:
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      router.push(`/play/game/${activeGameId}`);
                    }}
                    style={{
                      borderColor: accentColor,
                      color: accentColor,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = accentColor;
                      e.currentTarget.style.color = "white";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = accentColor;
                    }}
                  >
                    Rejoin Game
                  </Button>
                </div>
              )}
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
                      <Bot className="h-8 w-8" style={{ color: accentColor }} />
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
                    style={{
                      background: `linear-gradient(to right, ${accentColor}, ${
                        currentTheme.colors.accent[1] || accentColor
                      })`,
                      color: "white",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = `linear-gradient(to right, ${
                        currentTheme.colors.accent[1] || accentColor
                      }, ${
                        currentTheme.colors.accent[2] ||
                        currentTheme.colors.accent[1] ||
                        accentColor
                      })`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = `linear-gradient(to right, ${accentColor}, ${
                        currentTheme.colors.accent[1] || accentColor
                      })`;
                    }}
                  >
                    <Bot className="mr-2 h-4 w-4" />
                    Start Local Game
                  </Button>
                </CardContent>
              </MotionCard>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
