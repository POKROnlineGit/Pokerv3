"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSocket } from "@/lib/socketClient";
import { useToast } from "@/lib/hooks";
import { useQueue } from "@/components/providers/QueueProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { MotionCard } from "@/components/motion/MotionCard";
import { Users, User, Play } from "lucide-react";
import { createClientComponentClient } from "@/lib/supabaseClient";

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

export default function PlayOnlinePage() {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const { inQueue, queueType } = useQueue();
  const { currentTheme } = useTheme();
  const socket = useSocket();

  const [inGame, setInGame] = useState(false);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [isCheckingGame, setIsCheckingGame] = useState(true);
  const [isCheckingQueue, setIsCheckingQueue] = useState(true);
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  // Combined check state - buttons disabled until both checks complete
  const isChecking = isCheckingGame || isCheckingQueue;
  const [variants, setVariants] = useState<GameVariant[]>([]);
  const [isLoadingVariants, setIsLoadingVariants] = useState(true);
  const [userChips, setUserChips] = useState<number | null>(null);

  const supabase = createClientComponentClient();

  // Get theme colors
  const primaryColor = currentTheme.colors.primary[0];
  const gradientColors = currentTheme.colors.gradient;
  const accentColor = currentTheme.colors.accent[0];
  const centerColor =
    currentTheme.colors.primary[2] || currentTheme.colors.primary[1];

  // 1. Fetch Variants and User Profile on Mount
  useEffect(() => {
    // Fetch Variants
    fetch("/api/variants")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          // Filter out invalid variants (Safety Check)
          const validVariants = data.filter((v) => {
            const isValid =
              v.id && v.slug && v.name && typeof v.max_players === "number";
            if (!isValid) {
            }
            return isValid;
          });
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
          console.error("[PlayOnlinePage] Unexpected response format:", data);
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

    // Fetch Profile (Chips)
    const fetchProfile = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from("profiles")
            .select("chips")
            .eq("id", user.id)
            .single();
          if (data) {
            setUserChips(data.chips);
          }
        }
      } catch (err) {
        console.error("[PlayOnlinePage] Failed to fetch profile:", err);
      }
    };
    fetchProfile();
  }, [toast, supabase]);

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

  // 3. Check for active session (runs on mount and when navigating to /play/online)
  useEffect(() => {
    if (!socket || pathname !== "/play/online") {
      // Reset game check state when not on /play/online page
      setIsCheckingGame(false);
      return;
    }

    let mounted = true;
    let connectHandler: (() => void) | null = null;

    const handleSessionStatus = (payload: {
      inGame?: boolean;
      active?: boolean; // Support both formats
      gameId?: string | null;
      status?: string;
    }) => {
      if (!mounted) return;

      // Support both response formats: { inGame, gameId } or { active, gameId }
      const isActiveGame = payload?.inGame ?? payload?.active ?? false;
      const gameId = payload?.gameId;

      // Mark game check as complete immediately
      setIsCheckingGame(false);

      // Check if this is a recently left game (race condition prevention)
      if (gameId && typeof window !== "undefined") {
        const recentlyLeftGame = sessionStorage.getItem("recentlyLeftGame");
        const recentlyLeftTime = sessionStorage.getItem("recentlyLeftTime");
        const timeSinceLeave = recentlyLeftTime
          ? Date.now() - parseInt(recentlyLeftTime)
          : Infinity;

        // Ignore check if this game was left within last 3 seconds
        if (gameId === recentlyLeftGame && timeSinceLeave < 3000) {
          setInGame(false);
          setActiveGameId(null);
          // Clear the flag after delay
          setTimeout(() => {
            if (typeof window !== "undefined") {
              sessionStorage.removeItem("recentlyLeftGame");
              sessionStorage.removeItem("recentlyLeftTime");
            }
          }, 3000);
          return;
        }
      }

      // Don't redirect if game is finished
      if (payload?.status === "finished" || payload?.status === "complete") {
        setInGame(false);
        setActiveGameId(null);
        return;
      }

      // Set game state
      const isActive = isActiveGame && !!gameId;
      setInGame(isActive);
      setActiveGameId(isActive ? String(gameId) : null);

      // Automatic redirect to active game (only if not finished and active)
      // Redirect immediately when active game is found
      if (isActive && gameId) {
        router.push(`/play/game/${gameId}`);
      }
    };

    socket.on("session_status", handleSessionStatus);

    const emitCheckSession = () => {
      if (!mounted) return;
      setIsCheckingGame(true);
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

    // Timeout fallback - mark check as complete after 5 seconds
    const timeoutId = setTimeout(() => {
      if (!mounted) return;
      setIsCheckingGame(false);
      // Don't clear listeners on timeout - response might still come
    }, 5000);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      socket.off("session_status", handleSessionStatus);
      if (connectHandler) {
        socket.off("connect", connectHandler);
      }
    };
  }, [socket, router, pathname]);

  // 4. Check queue status when landing on /play/online page
  useEffect(() => {
    if (!socket || pathname !== "/play/online") {
      // Reset queue check state when not on /play/online page
      setIsCheckingQueue(false);
      return;
    }

    let mounted = true;

    const handleQueueStatus = (data: {
      inQueue: boolean;
      queueType: string | null;
    }) => {
      if (!mounted) return;
      // Mark queue check as complete
      setIsCheckingQueue(false);
      // QueueProvider will handle setting the status and state
      // This just ensures we check when landing on /play/online
    };

    socket.on("queue_status", handleQueueStatus);

    // Check queue status when landing on /play/online page
    setIsCheckingQueue(true);
    if (socket.connected) {
      socket.emit("check_queue_status");
    } else {
      const connectHandler = () => {
        if (mounted && socket.connected) {
          setIsCheckingQueue(true);
          socket.emit("check_queue_status");
        }
      };
      socket.once("connect", connectHandler);
    }

    // Timeout fallback - mark check as complete after 5 seconds
    const timeoutId = setTimeout(() => {
      if (mounted) {
        setIsCheckingQueue(false);
      }
    }, 5000);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      socket.off("queue_status", handleQueueStatus);
    };
  }, [socket, pathname]);

  // 5. Redirect if already in queue (only on /play/online page)
  useEffect(() => {
    // Only redirect if we're on /play/online page and have queue info
    if (pathname === "/play/online" && inQueue && queueType) {
      router.push(`/play/queue?type=${queueType}`);
    }
  }, [inQueue, queueType, router, pathname]);

  const joinQueue = (slug: string, buyIn: number) => {
    // Prevent joining if checks are still in progress
    if (isChecking) {
      toast({
        title: "Please wait",
        description: "Checking for active games and queues...",
        variant: "default",
      });
      return;
    }

    // Prevent joining if already in a game
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

    // Prevent joining if already in a queue
    if (inQueue) {
      toast({
        title: "Cannot join queue",
        description: "You are already in a queue.",
        variant: "destructive",
      });
      return;
    }

    // Only enforce funds check if buyIn > 0 (free games don't need funds)
    if (buyIn > 0 && userChips !== null && userChips < buyIn) {
      toast({
        title: "Insufficient Funds",
        description: `You need ${buyIn} chips to join. Current balance: ${userChips.toLocaleString()}.`,
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

  // Buttons disabled until BOTH checks complete AND neither game nor queue is active
  const isButtonDisabled =
    inGame || inQueue || isChecking || !isSocketConnected;

  return (
    <div className="min-h-screen relative">
      {/* --- SCROLLABLE CONTENT LAYER --- */}
      <div className="relative z-10">
        <div className="container mx-auto p-6 max-w-4xl">
          <h1 className="text-3xl font-bold mb-6">Play Online</h1>
          <div className="space-y-8">
            {/* Cash Games Section */}
            <section>
              <div
                className="text-white px-6 py-4 rounded-t-xl"
                style={{
                  background: `linear-gradient(to right, ${accentColor}, ${
                    currentTheme.colors.accent[1] || accentColor
                  })`,
                }}
              >
                <h2 className="text-2xl font-bold">Cash Games</h2>
                <p className="text-sm text-white/80">
                  Play with real chips and cash out anytime
                </p>
              </div>
              {isLoadingVariants ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-card rounded-b-xl">
                  {[1, 2].map((i) => (
                    <Card key={i} className="bg-card/50 animate-pulse h-48" />
                  ))}
                </div>
              ) : variants.filter((v) => v.category === "cash").length === 0 ? (
                <div className="p-6 bg-card rounded-b-xl">
                  <div className="text-center py-12 bg-card/20 rounded-lg border border-border/50">
                    <p className="text-muted-foreground">
                      No cash games available at this time.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-card rounded-b-xl">
                  {variants
                    .filter((v) => v.category === "cash")
                    .map((variant) => {
                      const buyIn = variant.config?.buyIn || 0;
                      const startingStack =
                        variant.config?.startingStack || 1000;
                      const isFree = buyIn === 0;
                      const canAfford =
                        isFree || (userChips !== null && userChips >= buyIn);
                      const isDisabled =
                        inGame ||
                        inQueue ||
                        isChecking ||
                        !isSocketConnected ||
                        !canAfford;

                      return (
                        <MotionCard
                          key={variant.id}
                          className={`${
                            isDisabled
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer"
                          } bg-card rounded-xl overflow-hidden`}
                          onClick={() =>
                            !isDisabled && joinQueue(variant.slug, buyIn)
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
                              <div className="flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
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
                                  <div className="flex gap-2">
                                    {variant.category === "cash" && (
                                      <span className="px-2 py-1 rounded text-xs bg-green-500/10 text-green-500 border border-green-500/20 whitespace-nowrap">
                                        Cash
                                      </span>
                                    )}
                                  </div>
                                </div>
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
                                <span>Buy-in / Stack:</span>
                                <span
                                  className={`font-medium ${
                                    canAfford
                                      ? "text-foreground"
                                      : "text-destructive"
                                  }`}
                                >
                                  {isFree ? "Free" : buyIn} / {startingStack}
                                </span>
                              </div>
                            </div>
                            <Button
                              className="w-full"
                              size="lg"
                              disabled={isDisabled}
                              onClick={() => joinQueue(variant.slug, buyIn)}
                              style={
                                canAfford
                                  ? {
                                      background: `linear-gradient(to right, ${accentColor}, ${
                                        currentTheme.colors.accent[1] ||
                                        accentColor
                                      })`,
                                      color: "white",
                                    }
                                  : undefined
                              }
                              variant={canAfford ? "default" : "outline"}
                              onMouseEnter={(e) => {
                                if (canAfford && !isDisabled) {
                                  e.currentTarget.style.background = `linear-gradient(to right, ${
                                    currentTheme.colors.accent[1] || accentColor
                                  }, ${
                                    currentTheme.colors.accent[2] ||
                                    currentTheme.colors.accent[1] ||
                                    accentColor
                                  })`;
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (canAfford && !isDisabled) {
                                  e.currentTarget.style.background = `linear-gradient(to right, ${accentColor}, ${
                                    currentTheme.colors.accent[1] || accentColor
                                  })`;
                                }
                              }}
                            >
                              <Play className="mr-2 h-4 w-4" />
                              {inGame
                                ? "In Game"
                                : inQueue
                                ? "Already in Queue"
                                : !isSocketConnected
                                ? "Connecting..."
                                : !canAfford
                                ? "Insufficient Funds"
                                : "Join Queue"}
                            </Button>
                          </CardContent>
                        </MotionCard>
                      );
                    })}
                </div>
              )}
            </section>

            {/* Casual Games Section */}
            <section>
              <div
                className="text-white px-6 py-4 rounded-t-xl"
                style={{
                  background: `linear-gradient(to right, ${accentColor}, ${
                    currentTheme.colors.accent[1] || accentColor
                  })`,
                }}
              >
                <h2 className="text-2xl font-bold">Casual Games</h2>
                <p className="text-sm text-white/80">
                  Play for fun with free chips
                </p>
              </div>
              {isLoadingVariants ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-card rounded-b-xl">
                  {[1, 2].map((i) => (
                    <Card key={i} className="bg-card/50 animate-pulse h-48" />
                  ))}
                </div>
              ) : variants.filter((v) => v.category !== "cash").length === 0 ? (
                <div className="p-6 bg-card rounded-b-xl">
                  <div className="text-center py-12 bg-card/20 rounded-lg border border-border/50">
                    <p className="text-muted-foreground">
                      No casual games available at this time.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-card rounded-b-xl">
                  {variants
                    .filter((v) => v.category !== "cash")
                    .map((variant) => {
                      const buyIn = variant.config?.buyIn || 0;
                      const startingStack =
                        variant.config?.startingStack || 1000;
                      const isFree = buyIn === 0;
                      const canAfford =
                        isFree || (userChips !== null && userChips >= buyIn);
                      const isDisabled =
                        inGame ||
                        inQueue ||
                        isChecking ||
                        !isSocketConnected ||
                        !canAfford;

                      return (
                        <MotionCard
                          key={variant.id}
                          className={`${
                            isDisabled
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer"
                          } bg-card rounded-xl overflow-hidden`}
                          onClick={() =>
                            !isDisabled && joinQueue(variant.slug, buyIn)
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
                              <div className="flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
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
                                  <div className="flex gap-2">
                                    {variant.category === "tournament" && (
                                      <span className="px-2 py-1 rounded text-xs bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 whitespace-nowrap">
                                        Tournament
                                      </span>
                                    )}
                                  </div>
                                </div>
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
                                <span>Buy-in / Stack:</span>
                                <span
                                  className={`font-medium ${
                                    canAfford
                                      ? "text-foreground"
                                      : "text-destructive"
                                  }`}
                                >
                                  {isFree ? "Free" : buyIn} / {startingStack}
                                </span>
                              </div>
                            </div>
                            <Button
                              className="w-full"
                              size="lg"
                              disabled={isDisabled}
                              onClick={() => joinQueue(variant.slug, buyIn)}
                              style={
                                canAfford
                                  ? {
                                      background: `linear-gradient(to right, ${accentColor}, ${
                                        currentTheme.colors.accent[1] ||
                                        accentColor
                                      })`,
                                      color: "white",
                                    }
                                  : undefined
                              }
                              variant={canAfford ? "default" : "outline"}
                              onMouseEnter={(e) => {
                                if (canAfford && !isDisabled) {
                                  e.currentTarget.style.background = `linear-gradient(to right, ${
                                    currentTheme.colors.accent[1] || accentColor
                                  }, ${
                                    currentTheme.colors.accent[2] ||
                                    currentTheme.colors.accent[1] ||
                                    accentColor
                                  })`;
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (canAfford && !isDisabled) {
                                  e.currentTarget.style.background = `linear-gradient(to right, ${accentColor}, ${
                                    currentTheme.colors.accent[1] || accentColor
                                  })`;
                                }
                              }}
                            >
                              <Play className="mr-2 h-4 w-4" />
                              {inGame
                                ? "In Game"
                                : inQueue
                                ? "Already in Queue"
                                : !isSocketConnected
                                ? "Connecting..."
                                : !canAfford
                                ? "Insufficient Funds"
                                : "Join Queue"}
                            </Button>
                          </CardContent>
                        </MotionCard>
                      );
                    })}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

