"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PokerTable } from "@/components/PokerTable";
import { ActionPopup } from "@/components/ActionPopup";
import { GameState, ActionType } from "@/lib/types/poker";
import { useLocalGameStore } from "@/lib/stores/useLocalGameStore";
import { Button } from "@/components/ui/button";

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

  const { gameState, heroId, startLocalGame, leaveLocalGame, playerAction, newGame } = useLocalGameStore();
  const hasInitialized = useRef(false);

  // Animation state - same system as online game
  const [runoutCards, setRunoutCards] = useState<string[]>([]);
  const [isRunningOut, setIsRunningOut] = useState(false);
  const prevCommunityCardsRef = useRef<string[]>([]);
  const runoutTimeoutRef = useRef<NodeJS.Timeout | null>(null);


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

  // Detect new community cards and trigger animations - same system as online game
  useEffect(() => {
    if (!gameState) return;
    
    const currentCards = gameState.communityCards || gameState.board || [];
    const prevCards = prevCommunityCardsRef.current;
    
    // Only process if we have cards and they've actually changed
    if (currentCards.length === 0 && prevCards.length === 0) {
      return; // Both empty, no change
    }
    
    // Handle reset case (new hand - cards went from some to none, or hand number changed)
    if (currentCards.length < prevCards.length) {
      // Cards were reset (new hand started)
      prevCommunityCardsRef.current = currentCards;
      setIsRunningOut(false);
      setRunoutCards([]);
      if (runoutTimeoutRef.current) {
        clearTimeout(runoutTimeoutRef.current);
        runoutTimeoutRef.current = null;
      }
      return;
    }
    
    // Detect new cards by comparing arrays
    const newCards = currentCards.filter(
      (card: string) => !prevCards.includes(card)
    );

    if (newCards.length > 0) {
      console.log('[LocalGame] New cards detected:', newCards, 'Previous:', prevCards, 'Current:', currentCards);
      
      // Clear any existing timeout
      if (runoutTimeoutRef.current) {
        clearTimeout(runoutTimeoutRef.current);
      }
      
      // Set animation flags
      setRunoutCards(newCards);
      setIsRunningOut(true);
      
      // Update ref AFTER setting animation state (but before timeout)
      prevCommunityCardsRef.current = currentCards;

      // Clear animation flags after animation completes
      const animationDuration = newCards.length * 300 + 500;
      runoutTimeoutRef.current = setTimeout(() => {
        setIsRunningOut(false);
        setRunoutCards([]);
        runoutTimeoutRef.current = null;
      }, animationDuration);
    } else if (currentCards.length === prevCards.length) {
      // Same number of cards, but might be different cards (shouldn't happen, but handle it)
      // Just update the ref
      prevCommunityCardsRef.current = currentCards;
    }
    
    return () => {
      if (runoutTimeoutRef.current) {
        clearTimeout(runoutTimeoutRef.current);
    }
    };
  }, [gameState?.communityCards, gameState?.board, gameState?.handNumber]);

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

  // Debug Props: Log what we're receiving from the Manager before rendering
  console.log("[LocalGame View] Passing to Table:", { 
    pot: adaptedGameState?.pot || gameState?.pot || gameState?.totalPot, 
    pots: adaptedGameState?.pots,
    sidePots: adaptedGameState?.sidePots,
    players: adaptedGameState?.players?.length || 0,
    communityCards: adaptedGameState?.communityCards?.length || 0,
    buttonSeat: adaptedGameState?.buttonSeat,
    dealerSeat: adaptedGameState?.dealerSeat,
    sbSeat: adaptedGameState?.sbSeat,
    bbSeat: adaptedGameState?.bbSeat,
    currentActorSeat: adaptedGameState?.currentActorSeat,
    currentRound: adaptedGameState?.currentRound
  });

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
    <div className="relative h-screen overflow-hidden bg-poker-felt">
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
          playerNames={BOT_NAMES}
          isLocalGame={true}
          isHeadsUp={false}
          runoutCards={runoutCards}
          isRunningOut={isRunningOut}
        />
      </div>

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
