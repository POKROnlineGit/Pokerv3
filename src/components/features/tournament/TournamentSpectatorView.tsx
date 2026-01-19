"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Eye, Table2, Users, Clock } from "lucide-react";
import { PokerTable } from "@/components/features/game/PokerTable";
import { GameState } from "@/lib/types/poker";
import { BlindLevel } from "@/lib/types/tournament";
import { useEffect, useState } from "react";

interface TournamentSpectatorViewProps {
  gameState: GameState & {
    isPaused?: boolean;
    hostId?: string;
  };
  tableIndex: number;
  currentBlindLevel: number;
  blindStructure: BlindLevel[];
  levelEndsAt: string | null;
  isPaused?: boolean;
  onBack: () => void;
}

function CountdownTimer({ targetTime }: { targetTime: string | null }) {
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    if (!targetTime) {
      setTimeLeft("");
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const target = new Date(targetTime).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft("0:00");
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${minutes}:${seconds.toString().padStart(2, "0")}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [targetTime]);

  if (!timeLeft) return null;

  return (
    <span className="font-mono font-medium text-amber-400">{timeLeft}</span>
  );
}

export function TournamentSpectatorView({
  gameState,
  tableIndex,
  currentBlindLevel,
  blindStructure,
  levelEndsAt,
  isPaused,
  onBack,
}: TournamentSpectatorViewProps) {
  const currentBlinds = blindStructure[currentBlindLevel] || { small: 0, big: 0 };
  const activePlayers = gameState.players.filter((p) => !p.folded && !p.leaving);

  return (
    <div className="flex flex-col h-full">
      {/* Header Bar */}
      <div className="flex items-center justify-between p-3 bg-slate-900/80 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Tables
          </Button>

          <div className="h-4 w-px bg-slate-700" />

          <div className="flex items-center gap-2">
            <Table2 className="h-4 w-4 text-slate-400" />
            <span className="font-medium text-white">Table {tableIndex}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Spectator Badge */}
          <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
            <Eye className="h-3 w-3 mr-1" />
            Spectating
          </Badge>

          {/* Player Count */}
          <div className="flex items-center gap-1.5 text-sm text-slate-400">
            <Users className="h-4 w-4" />
            <span>{activePlayers.length}</span>
          </div>

          {/* Blinds & Timer */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">
              L{currentBlindLevel + 1}:
            </span>
            <span className="font-mono text-white">
              {currentBlinds.small}/{currentBlinds.big}
            </span>
            {isPaused ? (
              <Badge variant="outline" className="text-xs text-amber-400 border-amber-400/30">
                PAUSED
              </Badge>
            ) : (
              <div className="flex items-center gap-1 text-slate-400">
                <Clock className="h-3 w-3" />
                <CountdownTimer targetTime={levelEndsAt} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Poker Table */}
      <div className="flex-1 relative">
        {/* Spectator mode indicator overlay */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
          <Badge
            variant="outline"
            className="bg-slate-900/80 backdrop-blur text-purple-400 border-purple-400/30 text-xs px-3"
          >
            <Eye className="h-3 w-3 mr-1.5" />
            Spectator Mode - Watch Only
          </Badge>
        </div>

        <PokerTable
          gameState={gameState}
          currentUserId="" // Empty string since spectators don't have a seat
        />
      </div>

      {/* Paused overlay */}
      {isPaused && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-20">
          <div className="text-center">
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-lg px-6 py-2">
              Tournament Paused
            </Badge>
            <p className="text-slate-400 text-sm mt-2">
              Waiting for host to resume
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
