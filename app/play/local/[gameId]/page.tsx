"use client";

import { useEffect, useRef } from "react";
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

  useEffect(() => {
    if (!hasInitialized.current) {
        startLocalGame();
        hasInitialized.current = true;
    }
  }, [startLocalGame]);

  // CRITICAL FIX: Do not render table until we have a valid Game ID and Hero ID match
  // This prevents the 'human-player' mismatch bug.
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
          currentUserId={heroId} // Pass the EXACT UUID from store
          playerNames={BOT_NAMES}
          isLocalGame={true}
          isHeadsUp={false}
        />
      </div>

      {/* Action Popup */}
      <ActionPopup
        gameState={gameState}
        currentUserId={heroId} // Pass the EXACT UUID from store
        onAction={handleAction}
        isLocalGame={true}
      />
    </div>
  );
}
