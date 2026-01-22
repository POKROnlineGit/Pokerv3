"use client";

import React, { useState } from "react";
import { PlayLayout } from "@/components/layout/PlayLayout";
import { Button } from "@/components/ui/button";
import { Bot, Play, ArrowLeft, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import Link from "next/link";
import { useLocalGameStore } from "@/lib/hooks/useLocalGameStore";
import { useTheme } from "@/components/providers/PreferencesProvider";

export default function BotPlayPage() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { startLocalGame } = useLocalGameStore();
  const { currentTheme } = useTheme();

  const handleStartGame = () => {
    setIsLoading(true);
    // Start the local game (this will generate a heroId)
    startLocalGame();

    // Slight artificial delay for UX feel
    setTimeout(() => {
      // Generate a gameId for the route
      const gameId = `local-${uuidv4()}`;
      router.push(`/play/local/${gameId}`);
    }, 800);
  };

  return (
    <PlayLayout
      title="Practice vs Bots"
      footer={
        <Button
          size="lg"
          className="w-full font-bold text-lg h-14"
          style={{
            background: 'linear-gradient(to right, var(--theme-primary-0), var(--theme-primary-1))',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'linear-gradient(to right, var(--theme-primary-1), var(--theme-primary-0))';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'linear-gradient(to right, var(--theme-primary-0), var(--theme-primary-1))';
          }}
          onClick={handleStartGame}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <Play className="mr-2 h-5 w-5" />
          )}
          Start Game
        </Button>
      }
    >
      <div className="space-y-8">
        <Link
          href="/play"
          className="inline-flex items-center text-sm text-slate-500 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Modes
        </Link>

        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-200 text-sm">
          <div className="flex items-start gap-3">
            <Bot className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <p>
              Bot games are played locally in your browser. No internet
              connection is required, and stats are not tracked.
            </p>
          </div>
        </div>
      </div>
    </PlayLayout>
  );
}
