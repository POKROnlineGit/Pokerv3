"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PokerTable } from "@/components/game/PokerTable";
import { ActionPopup } from "@/components/game/ActionPopup";
import { HandRankingsSidebar } from "@/components/game/HandRankingsSidebar";
import { GameState, ActionType, Player } from "@/lib/types/poker";
import { getClientHandStrength } from "@backend/domain/evaluation/ClientHandEvaluator";
import { useLocalGameStore } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { createClientComponentClient } from "@/lib/supabaseClient";

const BOT_NAMES: Record<string, string> = {
  "bot-1": "AggroBot",
  "bot-2": "TightBot",
  "bot-3": "CallingStation",
  "bot-4": "RandomBot",
  "bot-5": "SolidBot",
};

export default function LocalGamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;
  const supabase = createClientComponentClient();

  const { gameState, heroId, startLocalGame, leaveLocalGame, playerAction, newGame } = useLocalGameStore();
  const hasInitialized = useRef(false);
  
  // --- Client-Side Hydration: Player Names (including hero) ---
  const [playerNames, setPlayerNames] = useState<Record<string, string>>(BOT_NAMES);
  const [showHandRankings, setShowHandRankings] = useState(false);
  const [cardsLoaded, setCardsLoaded] = useState(false);

  // Fetch hero's username from database
  useEffect(() => {
    if (!heroId) return;

    const fetchHeroName = async () => {
      // Check if we already have the hero's name (and it's not a bot name)
      if (playerNames[heroId] && !BOT_NAMES[heroId]) {
        return; // Already fetched
      }

      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, username')
          .eq('id', heroId)
          .single();

        if (data?.username) {
          setPlayerNames(prev => ({
            ...prev,
            [heroId]: data.username
          }));
        }
      } catch (error) {
        console.error('[LocalGame] Error fetching hero username:', error);
      }
    };

    fetchHeroName();
  }, [heroId, supabase, playerNames]);

  // Preload card images for hand rankings (local games always use holdem)
  useEffect(() => {
    // Cards needed for hand rankings
    const cards = [
      "Ah",
      "Kh",
      "Qh",
      "Jh",
      "Th",
      "9h",
      "8h",
      "7h",
      "6h",
      "5h",
      "Ac",
      "Ad",
      "As",
      "Kc",
      "Kd",
      "Qc",
      "Qd",
      "Qh",
      "9c",
      "8d",
      "7h",
      "6s",
      "5c",
      "3h",
      "9d",
      "6h",
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
  }, []);

  useEffect(() => {
    if (!hasInitialized.current) {
        startLocalGame();
        hasInitialized.current = true;
    }
  }, [startLocalGame]);

  // Create Centralized Adapter: Apply all fixes once, use for both components
  // CRITICAL: This hook must be called BEFORE any early returns to maintain hook order
  const adaptedGameState = useMemo(() => {
    if (!gameState) return null;
    return {
      ...gameState,
      // Ensure global numbers
      pot: gameState.pot || gameState.totalPot || 0,
      dealerSeat: gameState.dealerSeat || 0,
      // Fix Players Array: Use currentBet directly (matches engine schema)
      players: (gameState.players || []).map((p: any) => ({
        ...p,
        currentBet: p.currentBet || 0,
        chips: Number(p.chips || 0),
      })),
      // Explicit Prop Adapter: Ensure all expected properties are present
      sidePots: gameState.sidePots || (gameState.pots?.slice(1) || []), // Map pots array to sidePots (skip first pot as main pot)
      communityCards: gameState.communityCards || gameState.board || [], // Handle board vs communityCards
      buttonSeat: gameState.buttonSeat || gameState.dealerSeat || 0, // Map dealerSeat to buttonSeat
      sbSeat: gameState.sbSeat || 0,
      bbSeat: gameState.bbSeat || 0,
      currentActorSeat: gameState.currentActorSeat || null,
      // Map Phase Fields: Provide safe defaults if manager briefly sends null during transitions
      currentRound: gameState.currentRound || 'preflop',
      currentPhase: gameState.currentPhase || 'active',
      handNumber: gameState.handNumber || 1,
    };
  }, [gameState]);

  // Calculate current hand strength for highlighting in sidebar
  const currentHandStrength = useMemo(() => {
    if (!adaptedGameState || !heroId) return null;
    const heroPlayer = adaptedGameState.players.find((p: Player) => p.id === heroId);
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
    const communityCards = (adaptedGameState.communityCards || []).filter(
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
  }, [adaptedGameState?.players, adaptedGameState?.communityCards, heroId]);

  // Animation is now handled internally by PokerTable's self-contained animation system

  // CRITICAL FIX: Do not render table until we have a valid Game ID and Hero ID match
  // This prevents the 'human-player' mismatch bug.
  // NOTE: This early return must come AFTER all hooks to maintain hook order
  if (!gameState || !heroId) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
        <div className="text-xl">Initializing Game Engine...</div>
      </div>
    );
  }

  const handleAction = (action: ActionType, amount?: number) => {
    if (!gameState || !heroId) return;
    playerAction(action, amount);
  };

  const handleNewGame = () => {
    newGame();
  };

  const handleLeaveGame = () => {
    leaveLocalGame();
    router.push("/play");
  };

  return (
    <div className="relative h-screen overflow-hidden">
      {/* Local game banner - positioned absolutely at top */}
      <div className="absolute top-4 left-4 right-4 z-50 bg-primary-500/10 border border-primary-500/20 rounded-xl p-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-primary-500">
            Local Game • 200 chips • Unlimited rebuys
          </h3>
          <p className="text-sm text-muted-foreground">
            Playing against 5 bots - perfect for testing!
          </p>
        </div>
        <div className="flex gap-2">
          {cardsLoaded && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHandRankings(!showHandRankings)}
            >
              {showHandRankings ? "Hide Ranks" : "Show Hand Ranks"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleNewGame}>
            New Game
          </Button>
          <Button variant="outline" size="sm" onClick={handleLeaveGame}>
            Leave Game
          </Button>
        </div>
      </div>

      {/* Table container - centered vertically and horizontally */}
      <div className="h-full w-full flex items-center justify-center">
        <PokerTable
          gameState={adaptedGameState!}
          currentUserId={heroId} // Pass the EXACT UUID from store
          playerNames={playerNames}
          isLocalGame={true}
          isHeadsUp={false}
        />
      </div>

      {/* Hand Rankings Sidebar */}
      <HandRankingsSidebar
        isVisible={showHandRankings}
        isHoldem={true} // Local games always use Texas Hold'em
        currentHandStrength={currentHandStrength}
      />

      {/* Action Popup */}
      <ActionPopup
        gameState={adaptedGameState}
        currentUserId={heroId} // Pass the EXACT UUID from store
        onAction={handleAction}
        isLocalGame={true}
      />
    </div>
  );
}
