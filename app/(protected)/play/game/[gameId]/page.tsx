"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { PokerTable } from "@/components/features/game/PokerTable";
import { ActionPopup } from "@/components/features/game/ActionPopup";
import { LeaveGameButton } from "@/components/features/game/LeaveGameButton";
import { HandRankingsSidebar } from "@/components/features/game/HandRankingsSidebar";
import { PlayLayout } from "@/components/layout/PlayLayout";
import { Player } from "@/lib/types/poker";
import { getClientHandStrength } from "@backend/domain/evaluation/ClientHandEvaluator";
import { getSocket, disconnectSocket } from "@/lib/api/socket/client";
import { useOnlineGameSocket } from "@/lib/api/socket/game";
import type { GameFinishedPayload } from "@/lib/api/socket/types/game";
import { createClientComponentClient } from "@/lib/api/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  // Game finished modal state
  const [gameFinished, setGameFinished] = useState<GameFinishedPayload | null>(null);

  // Variant info from database
  const [variantInfo, setVariantInfo] = useState<{
    name?: string;
    maxPlayers?: number;
    smallBlind?: number;
    bigBlind?: number;
    buyIn?: number;
    startingStack?: number;
    engineType?: string;
  } | null>(null);

  // UI state
  const [showHandRankings, setShowHandRankings] = useState(false);
  const [cardsLoaded, setCardsLoaded] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // Player stats
  type PlayerSessionStats = {
    hands_played: number;
    vpip_count: number;
    pfr_count: number;
  };
  const [playerStats, setPlayerStats] = useState<
    Record<string, PlayerSessionStats | null>
  >({});

  const supabase = createClientComponentClient();

  // Use the new socket hook
  const {
    gameState,
    isConnected,
    isDisconnected,
    isSyncing,
    isInitializing,
    turnTimer,
    playerDisconnectTimers,
    isHeadsUp,
    currentUserId,
    sendAction,
    revealCard,
  } = useOnlineGameSocket(gameId, {
    onGameFinished: (payload) => setGameFinished(payload),
    onNavigate: (path) => router.push(path),
  });

  // Calculate current hand strength for highlighting in sidebar
  const currentHandStrength = useMemo(() => {
    if (!gameState || !currentUserId) return null;
    const heroPlayer = gameState.players.find(
      (p: Player) => p.id === currentUserId
    );
    if (
      !heroPlayer ||
      !heroPlayer.holeCards ||
      heroPlayer.holeCards.length < 2
    ) {
      return null;
    }

    const holeCards = heroPlayer.holeCards.filter(
      (c: string | "HIDDEN" | null): c is string => c !== null && c !== "HIDDEN"
    );
    const communityCards = (gameState.communityCards || []).filter(
      (c: string | "HIDDEN" | null): c is string => c !== null && c !== "HIDDEN"
    );

    if (holeCards.length < 2) {
      return null;
    }

    try {
      return getClientHandStrength(holeCards, communityCards);
    } catch (error) {
      console.error("Error calculating hand strength:", error);
      return null;
    }
  }, [gameState?.players, gameState?.communityCards, currentUserId]);

  // Track active player IDs for stats fetch
  const activePlayerIds = useMemo(
    () => (gameState?.players || []).map((p) => p.id).filter(Boolean),
    [gameState?.players]
  );

  const refreshPlayerStats = useCallback(async () => {
    if (!gameState) return;
    const ids = activePlayerIds;
    if (ids.length === 0) {
      setPlayerStats({});
      return;
    }

    try {
      const results = await Promise.all(
        ids.map(async (playerId) => {
          try {
            const { data, error } = await supabase.rpc(
              "get_player_session_stats",
              {
                target_player_id: playerId,
                target_game_id: gameId,
              }
            );
            if (error) throw error;
            return [playerId, data as PlayerSessionStats | null] as const;
          } catch (err) {
            console.error("[Game] Failed to load player stats", err);
            return [playerId, null] as const;
          }
        })
      );
      setPlayerStats(Object.fromEntries(results));
    } catch (err) {
      console.error("[Game] Unexpected error loading player stats", err);
    }
  }, [activePlayerIds, gameId, gameState, supabase]);

  // Refresh stats when toggled on or when hand changes
  useEffect(() => {
    if (showStats) {
      refreshPlayerStats();
    }
  }, [showStats, gameState?.handNumber, refreshPlayerStats]);

  const handleToggleStats = useCallback(() => {
    setShowStats((prev) => {
      const next = !prev;
      if (!next) {
        setPlayerStats({});
      } else {
        refreshPlayerStats();
      }
      return next;
    });
  }, [refreshPlayerStats]);

  // Fetch variant information from database
  useEffect(() => {
    if (!gameId || gameId.startsWith("local-")) return;

    const fetchVariantInfo = async () => {
      try {
        // First, get game info from games table
        const { data: gameData, error: gameError } = await supabase
          .from("games")
          .select("game_type, small_blind, big_blind, buy_in")
          .eq("id", gameId)
          .single();

        if (gameError || !gameData) {
          console.error("Error fetching game data:", gameError);
          return;
        }

        // Then, fetch variant details from available_games
        const { data: variantData, error: variantError } = await supabase
          .from("available_games")
          .select("name, max_players, config, engine_type")
          .eq("slug", gameData.game_type)
          .single();

        if (variantError || !variantData) {
          console.error("Error fetching variant data:", variantError);
          return;
        }

        setVariantInfo({
          name: variantData.name,
          maxPlayers: variantData.max_players,
          smallBlind: gameData.small_blind,
          bigBlind: gameData.big_blind,
          buyIn: gameData.buy_in,
          startingStack:
            variantData.config?.startingStack || variantData.config?.buyIn,
          engineType: variantData.engine_type,
        });
      } catch (error) {
        console.error("Error fetching variant info:", error);
      }
    };

    fetchVariantInfo();
  }, [gameId, supabase]);

  // Preload card images for hand rankings
  useEffect(() => {
    if (!variantInfo?.engineType) return;

    const isHoldem = variantInfo.engineType === "holdem";

    if (!isHoldem) {
      setCardsLoaded(true);
      return;
    }

    const cards = [
      "Ah", "Kh", "Qh", "Jh", "Th", "9h", "8h", "7h", "6h", "5h",
      "Ac", "Ad", "As", "Kc", "Kd", "Qc", "Qd", "Qh", "9c", "8d",
      "7h", "6s", "5c", "3h", "9d", "6h",
    ];

    let loadedCount = 0;
    const totalCards = cards.length;

    if (totalCards === 0) {
      setCardsLoaded(true);
      return;
    }

    cards.forEach((card) => {
      const img = new Image();
      img.onload = () => {
        loadedCount++;
        if (loadedCount === totalCards) {
          setCardsLoaded(true);
        }
      };
      img.onerror = () => {
        loadedCount++;
        if (loadedCount === totalCards) {
          setCardsLoaded(true);
        }
      };
      img.src = `/cards/${card}.png`;
    });
  }, [variantInfo?.engineType]);

  // Redirect local games to the local game page
  useEffect(() => {
    if (gameId.startsWith("local-")) {
      router.replace(`/play/local/${gameId}`);
    }
  }, [gameId, router]);

  // Handle action
  const handleAction = useCallback(
    (
      action: "fold" | "check" | "call" | "bet" | "raise" | "allin" | "reveal",
      amount?: number,
      isAllInCall?: boolean
    ) => {
      sendAction(action, amount, isAllInCall);
    },
    [sendAction]
  );

  // Handle reveal card
  const handleRevealCard = useCallback(
    (cardIndex: number) => {
      revealCard(cardIndex);
    },
    [revealCard]
  );

  // Prepare table content
  const tableContent = (
    <>
      {isInitializing || !gameState || !currentUserId ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            {isInitializing
              ? "Initializing Game Table..."
              : !currentUserId
              ? "Authenticating..."
              : "Connecting to game..."}
          </div>
        </div>
      ) : (
        <>
          <div className="h-full w-full flex items-center justify-center">
            <PokerTable
              gameState={gameState}
              currentUserId={currentUserId}
              onRevealCard={handleRevealCard}
              isLocalGame={false}
              isHeadsUp={isHeadsUp}
              playerDisconnectTimers={playerDisconnectTimers}
              turnTimer={turnTimer}
              isSyncing={isSyncing}
              showStats={showStats}
              playerStats={playerStats}
            />
          </div>

          <HandRankingsSidebar
            isVisible={showHandRankings}
            isHoldem={variantInfo?.engineType === "holdem"}
            currentHandStrength={currentHandStrength}
          />
        </>
      )}
    </>
  );

  // Prepare action popup
  const actionPopupContent = !gameFinished ? (
    <ActionPopup
      gameState={gameState}
      currentUserId={currentUserId}
      onAction={handleAction}
      onRevealCard={handleRevealCard}
      isLocalGame={false}
    />
  ) : null;

  // Prepare sidebar content
  const sidebarContent = gameFinished ? (
    <div className="space-y-4">
      <Card className="bg-[hsl(222.2,84%,4.9%)]">
        <CardContent className="pt-6 space-y-4">
          {gameFinished.winnerId && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Winner</p>
              <p className="text-sm font-semibold">
                {gameFinished.winnerId === currentUserId
                  ? "You won!"
                  : gameState?.players.find(
                      (p) => p.id === gameFinished.winnerId
                    )?.username ||
                    "Player " + gameFinished.winnerId.slice(0, 8)}
              </p>
            </div>
          )}

          {gameFinished.stats &&
            currentUserId &&
            gameFinished.stats.startingStacks[currentUserId] !== undefined && (
              <>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Hands Played</p>
                  <p className="text-sm font-semibold">
                    {gameFinished.stats.totalHands}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Final Stack</p>
                  <p className="text-sm font-semibold">
                    {gameFinished.stats?.finalStacks[
                      currentUserId
                    ]?.toLocaleString() || "0"}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Net Change</p>
                  <div className="flex items-center gap-1">
                    {gameFinished.stats.chipChanges[currentUserId] >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                    <p
                      className={`text-sm font-semibold ${
                        gameFinished.stats.chipChanges[currentUserId] >= 0
                          ? "text-green-500"
                          : "text-red-500"
                      }`}
                    >
                      {gameFinished.stats.chipChanges[currentUserId] >= 0
                        ? "+"
                        : ""}
                      {gameFinished.stats.chipChanges[
                        currentUserId
                      ].toLocaleString()}
                    </p>
                  </div>
                </div>
              </>
            )}
        </CardContent>
      </Card>

      <Button
        onClick={() => {
          const socket = getSocket();
          if (socket) {
            socket.removeAllListeners();
            disconnectSocket();
          }
          setGameFinished(null);
          router.push("/play");
        }}
        className="w-full"
      >
        Return to Lobby
      </Button>
    </div>
  ) : (
    <div className="space-y-4">
      <div className="space-y-2">
        {variantInfo?.name && (
          <div>
            <p className="text-xs text-muted-foreground">Variant</p>
            <p className="text-sm font-semibold">{variantInfo.name}</p>
          </div>
        )}
        {variantInfo?.smallBlind && variantInfo?.bigBlind && (
          <div>
            <p className="text-xs text-muted-foreground">Blinds</p>
            <p className="text-sm font-semibold">
              ${variantInfo.smallBlind}/${variantInfo.bigBlind}
            </p>
          </div>
        )}
        {variantInfo?.startingStack && (
          <div>
            <p className="text-xs text-muted-foreground">Starting Stack</p>
            <p className="text-sm font-semibold">
              {variantInfo.startingStack.toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  // Prepare footer content
  const footerContent = !gameFinished ? (
    <div className="flex justify-end gap-3">
      <Button variant="secondary" onClick={handleToggleStats}>
        Toggle Stats
      </Button>
      <LeaveGameButton gameId={gameId} />
    </div>
  ) : undefined;

  return (
    <PlayLayout
      tableContent={tableContent}
      title={gameFinished ? "Game Over" : "Online Game"}
      actionPopup={actionPopupContent}
      footer={footerContent}
    >
      {sidebarContent}
    </PlayLayout>
  );
}
