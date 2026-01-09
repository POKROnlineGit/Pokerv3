"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PokerTable } from "@/components/game/PokerTable";
import { ActionPopup } from "@/components/game/ActionPopup";
import { HandRankingsSidebar } from "@/components/game/HandRankingsSidebar";
import { PlayLayout } from "@/components/play/PlayLayout";
import { GameState, ActionType, Player } from "@/lib/types/poker";
import { getClientHandStrength } from "@backend/domain/evaluation/ClientHandEvaluator";
import { useLocalGameStore } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClientComponentClient } from "@/lib/supabaseClient";

export default function LocalGamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;
  const supabase = createClientComponentClient();

  const {
    gameState,
    heroId,
    startLocalGame,
    leaveLocalGame,
    playerAction,
    newGame,
    manager,
  } = useLocalGameStore();

  const [showHandRankings, setShowHandRankings] = useState(false);
  const [cardsLoaded, setCardsLoaded] = useState(false);

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
    // Initialize if manager doesn't exist (more reliable than ref)
    if (!manager) {
      startLocalGame();
    }
  }, [startLocalGame, manager]);

  // Cleanup on unmount (when navigating away from the page)
  useEffect(() => {
    return () => {
      // Always cleanup if manager exists (defensive)
      if (manager) {
        leaveLocalGame();
        console.log('[LocalGame] Cleaned up on page unmount');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run on unmount

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
      // Normalize username: map name to username (LocalGameManager uses 'name', engine expects 'username')
      players: (gameState.players || []).map((p: any) => ({
        ...p,
        username: p.username || p.name || `Player ${p.seat || ""}`,
        currentBet: p.currentBet || 0,
        chips: Number(p.chips || 0),
      })),
      // Explicit Prop Adapter: Ensure all expected properties are present
      sidePots: gameState.sidePots || gameState.pots?.slice(1) || [], // Map pots array to sidePots (skip first pot as main pot)
      communityCards: gameState.communityCards || gameState.board || [], // Handle board vs communityCards
      buttonSeat: gameState.buttonSeat || gameState.dealerSeat || 0, // Map dealerSeat to buttonSeat
      sbSeat: gameState.sbSeat || 0,
      bbSeat: gameState.bbSeat || 0,
      currentActorSeat: gameState.currentActorSeat || null,
      // Map Phase Fields: Provide safe defaults if manager briefly sends null during transitions
      currentPhase: gameState.currentPhase || "preflop",
      handNumber: gameState.handNumber || 1,
    };
  }, [gameState]);

  // Calculate current hand strength for highlighting in sidebar
  const currentHandStrength = useMemo(() => {
    if (!adaptedGameState || !heroId) return null;
    const heroPlayer = adaptedGameState.players.find(
      (p: Player) => p.id === heroId
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
      <PlayLayout
        tableContent={
          <div className="flex h-full items-center justify-center">
            <div className="text-xl text-white">
              Initializing Game Engine...
            </div>
          </div>
        }
        title="Local Game"
      >
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Initializing...</p>
        </div>
      </PlayLayout>
    );
  }

  const handleAction = (
    action: ActionType,
    amount?: number,
    isAllInCall?: boolean
  ) => {
    if (!gameState || !heroId) return;
    // Local game manager may not support isAllInCall yet, but we pass it for future compatibility
    playerAction(action, amount);
  };

  const handleNewGame = () => {
    newGame();
  };

  const handleLeaveGame = () => {
    leaveLocalGame();
    router.push("/play");
  };

  // Prepare table content
  const tableContent = (
    <>
      {/* Table container - centered vertically and horizontally */}
      <div className="h-full w-full flex items-center justify-center">
        <PokerTable
           gameState={adaptedGameState!}
           currentUserId={heroId} // Pass the EXACT UUID from store
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
    </>
  );

  // Prepare action popup separately to render outside stacking context
  const actionPopupContent = (
    <ActionPopup
      gameState={adaptedGameState}
      currentUserId={heroId} // Pass the EXACT UUID from store
      onAction={handleAction}
      isLocalGame={true}
    />
  );

  // Prepare sidebar content
  const sidebarContent = (
    <div className="space-y-4">
      {/* Match Info - No Card */}
      <div className="space-y-2">
        <div>
          <p className="text-xs text-muted-foreground">Mode</p>
          <p className="text-sm font-semibold">Practice vs Bots</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Difficulty</p>
          <p className="text-sm font-semibold">Medium</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Starting Chips</p>
          <p className="text-sm font-semibold">200</p>
        </div>
      </div>
    </div>
  );

  // Prepare footer content
  const footerContent = (
    <div className="flex gap-2">
      <Button variant="outline" className="flex-1" onClick={handleNewGame}>
        New Game
      </Button>
      <Button
        variant="destructive"
        className="flex-1"
        onClick={handleLeaveGame}
      >
        Leave Game
      </Button>
    </div>
  );

  return (
    <PlayLayout
      tableContent={tableContent}
      title="Local Game"
      footer={footerContent}
      actionPopup={actionPopupContent}
    >
      {sidebarContent}
    </PlayLayout>
  );
}
