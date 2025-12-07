"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PokerTable } from "@/components/PokerTable";
import { ActionPopup } from "@/components/ActionPopup";
import { GameState, ActionType } from "@/lib/poker-game/ui/legacyTypes";
import { gameContextToUI } from "@/lib/poker-game/ui/adapters";
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

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentUserId] = useState<string>("human-player");

  // Local game store
  const {
    gameContext: localGameContext,
    startLocalGame,
    playerAction: localPlayerAction,
    leaveLocalGame,
    newGame: startNewLocalGame,
  } = useLocalGameStore();

  // Initialize local game if needed
  useEffect(() => {
    if (!localGameContext) {
      startLocalGame();
    }
  }, [localGameContext, startLocalGame]);

  // Subscribe to local game state changes
  useEffect(() => {
    if (localGameContext) {
      setGameState(gameContextToUI(localGameContext));
    }

    const unsubscribe = useLocalGameStore.subscribe((state) => {
      if (state.gameContext) {
        setGameState(gameContextToUI(state.gameContext));
      }
    });

    return unsubscribe;
  }, [localGameContext]);

  const handleAction = (action: ActionType, amount?: number) => {
    if (!gameState || !currentUserId) return;
    localPlayerAction(action, amount);
  };

  const handleNewGame = () => {
    startNewLocalGame();
  };

  const handleLeaveGame = () => {
    leaveLocalGame();
    router.push("/play");
  };

  if (!gameState || !currentUserId) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[60vh]">
        <div>Starting local game...</div>
      </div>
    );
  }

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
          gameState={gameState}
          currentUserId={currentUserId}
          playerNames={BOT_NAMES}
          isLocalGame={true}
          isHeadsUp={false}
        />
      </div>

      {/* Action Popup */}
      <ActionPopup
        gameState={gameState}
        currentUserId={currentUserId}
        onAction={handleAction}
        isLocalGame={true}
      />
    </div>
  );
}

