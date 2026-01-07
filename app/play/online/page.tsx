"use client";

import React, { useEffect, useState, useMemo } from "react";
import { PlayLayout } from "@/components/play/PlayLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueue } from "@/components/providers/QueueProvider";
import { useSocket } from "@/lib/socketClient";
import { Loader2, Search, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClientComponentClient } from "@/lib/supabaseClient";

interface GameVariant {
  id: string;
  slug: string;
  name: string;
  category: "cash" | "tournament" | "sit_and_go" | "casual";
  max_players: number;
  engine_type: string;
  config: any;
}

export default function OnlinePlayPage() {
  const [variants, setVariants] = useState<GameVariant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userChips, setUserChips] = useState<number | null>(null);

  // Selection State
  const [format, setFormat] = useState<string>("holdem"); // Default to Texas Hold'em
  const [category, setCategory] = useState<string>("");
  const [selectedVariantSlug, setSelectedVariantSlug] = useState<string>("");

  const { inQueue, queueType, matchFound, leaveQueue } = useQueue();
  const socket = useSocket();
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [checkingGame, setCheckingGame] = useState(true);

  // 1. Check if user is in an active game and redirect
  useEffect(() => {
    const checkActiveGame = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setCheckingGame(false);
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
        setCheckingGame(false);
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

  // 2. Fetch Variants
  useEffect(() => {
    fetch("/api/variants")
      .then((res) => res.json())
      .then((data) => {
        setVariants(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load variants", err);
        setIsLoading(false);
      });
  }, []);

  // 2.5. Load user chips from localStorage
  useEffect(() => {
    const loadChips = () => {
      if (typeof window !== "undefined") {
        try {
          const cached = localStorage.getItem("playLayout_profile");
          if (cached) {
            const parsed = JSON.parse(cached);
            setUserChips(parsed.chips ?? null);
          }
        } catch (e) {
          // Ignore cache errors
        }
      }
    };

    loadChips();

    // Listen for storage changes (when PlayLayout updates chips)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "playLayout_profile" && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setUserChips(parsed.chips ?? null);
        } catch (e) {
          // Ignore parse errors
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // Also check periodically in case localStorage is updated in the same window
    const interval = setInterval(() => {
      loadChips();
    }, 1000);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // 3. Extract unique formats (engine types) and categories from variants
  const formats = useMemo(() => {
    const unique = new Set(variants.map((v) => v.engine_type).filter(Boolean));
    return Array.from(unique)
      .sort()
      .map((engineType) => ({
        value: engineType,
        label:
          engineType === "holdem"
            ? "Texas Hold'em"
            : engineType.charAt(0).toUpperCase() + engineType.slice(1),
      }));
  }, [variants]);

  const categories = useMemo(() => {
    const unique = new Set(variants.map((v) => v.category));
    return Array.from(unique).map((cat) => ({
      value: cat,
      label:
        cat === "cash"
          ? "Competitive"
          : cat === "tournament" || cat === "casual" || cat === "sit_and_go"
          ? "Casual"
          : cat,
    }));
  }, [variants]);

  // 4. Filter Logic - filter by both format (engine_type) and category
  const availableVariants = useMemo(() => {
    if (!format || !category) {
      return [];
    }

    return variants.filter(
      (v) => v.engine_type === format && v.category === category
    );
  }, [variants, format, category]);

  // Helper function to check if user can afford a variant
  const canAffordVariant = (variant: GameVariant): boolean => {
    if (userChips === null) return true; // If chips not loaded yet, allow selection
    const buyIn = variant.config?.buyIn || 100;
    return userChips >= buyIn;
  };

  // Check if selected variant is affordable
  const selectedVariantAffordable = useMemo(() => {
    if (!selectedVariantSlug) return false;
    const selectedVariant = variants.find(
      (v) => v.slug === selectedVariantSlug
    );
    if (!selectedVariant) return false;
    if (userChips === null) return true; // If chips not loaded yet, allow selection
    const buyIn = selectedVariant.config?.buyIn || 100;
    return userChips >= buyIn;
  }, [selectedVariantSlug, variants, userChips]);

  // Set default format to holdem when variants load
  useEffect(() => {
    if (variants.length > 0 && !format) {
      const hasHoldem = variants.some((v) => v.engine_type === "holdem");
      if (hasHoldem) {
        setFormat("holdem");
      }
    }
  }, [variants, format]);

  // Clear selected variant when filters change
  useEffect(() => {
    setSelectedVariantSlug("");
  }, [format, category]);

  // Clear selected variant if it becomes unaffordable
  useEffect(() => {
    if (selectedVariantSlug && userChips !== null) {
      const selectedVariant = variants.find(
        (v) => v.slug === selectedVariantSlug
      );
      if (selectedVariant && !canAffordVariant(selectedVariant)) {
        setSelectedVariantSlug("");
      }
    }
  }, [userChips, selectedVariantSlug, variants]);

  // 5. Handle Queue Join
  const handleFindGame = () => {
    if (!selectedVariantSlug) return;
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit("join_queue", { queueType: selectedVariantSlug });
  };

  // 6. Render Content based on Queue State
  const renderContent = () => {
    // --- STATE: IN QUEUE ---
    if (inQueue) {
      const activeVariant = variants.find(
        (v) => v.slug === (queueType || selectedVariantSlug)
      );

      return (
        <div className="flex flex-col items-center justify-center py-10 space-y-6">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full animate-pulse" />
            <div className="h-20 w-20 bg-slate-800 rounded-full flex items-center justify-center relative border-2 border-emerald-500">
              <Loader2 className="h-10 w-10 text-emerald-500 animate-spin" />
            </div>
          </div>

          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-white">Finding Match...</h2>
            <p className="text-slate-400">
              Looking for players for{" "}
              <span className="text-emerald-400">
                {activeVariant?.name || "Poker"}
              </span>
            </p>
          </div>

          <div className="w-full max-w-xs bg-slate-800/50 rounded-lg p-4 border border-slate-800 text-center">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
              Matchmaking Status
            </p>
            <p className="text-sm font-medium text-slate-300">
              {matchFound
                ? "Game Found! Teleporting..."
                : "Searching for opponents..."}
            </p>
          </div>

          <Button
            variant="destructive"
            size="lg"
            className="w-full max-w-xs"
            onClick={() => leaveQueue(activeVariant?.slug || "")}
            disabled={matchFound}
          >
            Cancel Search
          </Button>
        </div>
      );
    }

    // --- STATE: SELECTION FORM ---
    return (
      <div className="space-y-8">
        {/* Back Link */}
        <Link
          href="/play"
          className="inline-flex items-center text-sm text-slate-500 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Modes
        </Link>

        {/* Format and Category Rows - Reduced spacing */}
        <div className="space-y-3">
          {/* Format - Label and Dropdown on Same Row */}
          <div className="flex items-center gap-3">
            <Label className="w-20 flex-shrink-0">Format</Label>
            <div className="flex-1">
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger className="[&>span]:text-left">
                  <SelectValue placeholder="Select Variant" />
                </SelectTrigger>
                <SelectContent>
                  {formats.map((fmt) => (
                    <SelectItem
                      key={fmt.value}
                      value={fmt.value}
                      className="text-left"
                    >
                      {fmt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category - Label and Dropdown on Same Row */}
          <div className="flex items-center gap-3">
            <Label className="w-20 flex-shrink-0">Category</Label>
            <div className="flex-1">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="[&>span]:text-left">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem
                      key={cat.value}
                      value={cat.value}
                      className="text-left"
                    >
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Available Games - Only show if both format and category are selected */}
        {format && category && (
          <div className="space-y-3">
            <Label>Available Games</Label>
            {isLoading ? (
              <div className="h-10 w-full bg-slate-800 animate-pulse rounded" />
            ) : availableVariants.length === 0 ? (
              <div className="p-4 border border-dashed border-slate-700 rounded text-center text-slate-500">
                No tables available.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {availableVariants.map((variant) => {
                  const canAfford = canAffordVariant(variant);
                  const buyIn = variant.config?.buyIn || 100;
                  const blinds = variant.config?.blinds || { small: 1, big: 2 };
                  const isCasual =
                    variant.category === "casual" ||
                    variant.category === "tournament" ||
                    variant.category === "sit_and_go";
                  const displayText = isCasual
                    ? `Blinds $${blinds.small}/$${blinds.big}`
                    : `Buy-in $${buyIn}`;

                  return (
                    <button
                      key={variant.id}
                      onClick={() => {
                        if (canAfford) {
                          setSelectedVariantSlug(variant.slug);
                        }
                      }}
                      disabled={!canAfford}
                      className={`
                        relative p-3 rounded-lg border text-left transition-all
                        ${
                          !canAfford
                            ? "opacity-50 cursor-not-allowed bg-slate-800/20 border-slate-800"
                            : selectedVariantSlug === variant.slug
                            ? "bg-emerald-950/30 border-emerald-500 ring-1 ring-emerald-500/50"
                            : "bg-slate-800/40 border-slate-700 hover:border-slate-600 hover:bg-slate-800/60"
                        }
                      `}
                    >
                      <div className="space-y-1">
                        <div
                          className={`font-semibold text-sm ${
                            !canAfford ? "text-slate-500" : "text-white"
                          }`}
                        >
                          {variant.name}
                        </div>
                        <div
                          className={`text-xs ${
                            !canAfford ? "text-slate-600" : "text-slate-400"
                          }`}
                        >
                          {displayText}
                          {!canAfford && userChips !== null && (
                            <span className="block mt-0.5 text-red-400">
                              Insufficient funds (${userChips.toLocaleString()})
                            </span>
                          )}
                        </div>
                      </div>
                      {selectedVariantSlug === variant.slug && canAfford && (
                        <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-emerald-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <PlayLayout
      title="Online Lobby"
      footer={
        <>
          <Button
            size="lg"
            className="w-full font-bold text-lg h-14 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 shadow-lg shadow-emerald-900/20"
            disabled={
              checkingGame ||
              inQueue ||
              !selectedVariantSlug ||
              isLoading ||
              !selectedVariantAffordable
            }
            onClick={handleFindGame}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Search className="mr-2 h-5 w-5" />
            )}
            Find Game
          </Button>
          <p className="text-center text-xs text-slate-500 mt-3">
            You will be placed in a queue until a match is found.
          </p>
        </>
      }
    >
      {renderContent()}
    </PlayLayout>
  );
}
