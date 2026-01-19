"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users,
  Clock,
  Coins,
  Trophy,
  Play,
  Pause,
  Square,
  Ban,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import {
  TournamentStateResponse,
  TournamentStatusType,
  BlindLevel,
} from "@/lib/types/tournament";
import { useEffect, useState } from "react";

interface ParticipantLike {
  id?: string;
  user_id?: string;
  userId?: string;
  status?: string;
  current_stack?: number | null;
  chips?: number | null;
  profiles?: {
    username?: string;
  };
  username?: string;
}

interface TournamentOverviewProps {
  tournament: TournamentStateResponse["tournament"];
  participants: ParticipantLike[];
  status: TournamentStatusType;
  isHost: boolean;
  currentUserId: string | null;
  currentBlindLevel: number;
  levelEndsAt: string | null;
  onPauseResume?: () => void;
  onCancel?: () => void;
  onBanPlayer?: (playerId: string) => void;
  isPausing?: boolean;
  isCancelling?: boolean;
  isBanning?: string | null;
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
    <span className="font-mono font-bold text-amber-400">{timeLeft}</span>
  );
}

function StatusBadge({ status }: { status: TournamentStatusType }) {
  const statusConfig: Record<
    TournamentStatusType,
    { label: string; className: string; icon: React.ReactNode }
  > = {
    setup: {
      label: "Setup",
      className: "bg-slate-500/20 text-slate-400 border-slate-500/30",
      icon: null,
    },
    registration: {
      label: "Registration",
      className: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      icon: <Users className="h-3 w-3" />,
    },
    active: {
      label: "In Progress",
      className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      icon: <Play className="h-3 w-3" />,
    },
    paused: {
      label: "Paused",
      className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      icon: <Pause className="h-3 w-3" />,
    },
    completed: {
      label: "Completed",
      className: "bg-slate-500/20 text-slate-400 border-slate-500/30",
      icon: <Trophy className="h-3 w-3" />,
    },
    cancelled: {
      label: "Cancelled",
      className: "bg-red-500/20 text-red-400 border-red-500/30",
      icon: <Square className="h-3 w-3" />,
    },
  };

  const config = statusConfig[status] || statusConfig.setup;

  return (
    <Badge className={`${config.className} text-sm px-3 py-1`}>
      {config.icon}
      <span className="ml-1">{config.label}</span>
    </Badge>
  );
}

export function TournamentOverview({
  tournament,
  participants,
  status,
  isHost,
  currentUserId,
  currentBlindLevel,
  levelEndsAt,
  onPauseResume,
  onCancel,
  onBanPlayer,
  isPausing,
  isCancelling,
  isBanning,
}: TournamentOverviewProps) {
  const blindStructure: BlindLevel[] =
    tournament?.blind_structure_template ||
    (tournament as any)?.blindStructureTemplate ||
    [];

  const currentBlinds = blindStructure[currentBlindLevel] || { small: 0, big: 0 };
  const nextBlinds = blindStructure[currentBlindLevel + 1];
  const startingStack =
    tournament?.starting_stack || (tournament as any)?.startingStack || 10000;

  // Calculate total chips in play
  const totalChips = participants.reduce((sum, p) => {
    const chips = p.current_stack ?? p.chips ?? 0;
    return sum + chips;
  }, 0);

  // Count active players
  const activePlayers = participants.filter(
    (p) => p.status !== "eliminated"
  ).length;

  // Calculate average stack
  const avgStack = activePlayers > 0 ? Math.round(totalChips / activePlayers) : 0;

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 mb-3">
          <Trophy className="h-8 w-8 text-amber-400" />
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            {tournament?.title || (tournament as any)?.name || "Tournament"}
          </h1>
        </div>
        {tournament?.description && (
          <p className="text-slate-400 text-sm max-w-2xl mx-auto mb-3">
            {tournament.description}
          </p>
        )}
        <div className="flex items-center justify-center gap-3">
          <StatusBadge status={status} />
          {isHost && (
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-sm px-3 py-1">
              <Trophy className="h-3 w-3 mr-1" />
              Host
            </Badge>
          )}
        </div>
      </div>

      {/* Current Blind Level */}
      {(status === "active" || status === "paused") && (
        <Card className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-slate-700 mb-4">
          <CardContent className="p-4 md:p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="text-center md:text-left">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">
                  Level {currentBlindLevel + 1}
                </p>
                <p className="text-3xl md:text-4xl font-bold text-white">
                  {currentBlinds.small.toLocaleString()} /{" "}
                  {currentBlinds.big.toLocaleString()}
                </p>
                {nextBlinds && (
                  <p className="text-sm text-slate-500 mt-1">
                    Next: {nextBlinds.small.toLocaleString()}/
                    {nextBlinds.big.toLocaleString()}
                  </p>
                )}
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">
                  Level Ends
                </p>
                <div className="text-2xl">
                  {status === "paused" ? (
                    <span className="text-amber-400 font-medium">PAUSED</span>
                  ) : (
                    <CountdownTimer targetTime={levelEndsAt} />
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-3 text-center">
            <Users className="h-5 w-5 text-blue-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-white">{activePlayers}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">
              Players Left
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-3 text-center">
            <Coins className="h-5 w-5 text-amber-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-white">
              {totalChips.toLocaleString()}
            </p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">
              Total Chips
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-3 text-center">
            <Coins className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-white">
              {avgStack.toLocaleString()}
            </p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">
              Avg Stack
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-3 text-center">
            <Clock className="h-5 w-5 text-purple-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-white">
              {blindStructure.length - currentBlindLevel}
            </p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">
              Levels Left
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Host Controls */}
      {isHost && (status === "active" || status === "paused") && (
        <Card className="bg-slate-800/50 border-slate-700 mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-300">
              Host Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button
                onClick={onPauseResume}
                disabled={isPausing}
                variant="outline"
                className="flex-1"
              >
                {isPausing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : status === "paused" ? (
                  <Play className="mr-2 h-4 w-4" />
                ) : (
                  <Pause className="mr-2 h-4 w-4" />
                )}
                {status === "paused" ? "Resume" : "Pause"}
              </Button>
              <Button
                onClick={onCancel}
                disabled={isCancelling}
                variant="destructive"
                className="px-4"
              >
                {isCancelling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </Button>
            </div>

            {status === "paused" && (
              <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-400">
                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                Tournament is paused. All tables are on hold.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Player Management (Host only) */}
      {isHost && participants.length > 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Players ({activePlayers} active / {participants.length} total)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-1.5">
                {participants
                  .sort((a, b) => {
                    // Sort by status (active first), then by chips
                    if (a.status === "eliminated" && b.status !== "eliminated")
                      return 1;
                    if (a.status !== "eliminated" && b.status === "eliminated")
                      return -1;
                    const chipsA = a.current_stack ?? a.chips ?? 0;
                    const chipsB = b.current_stack ?? b.chips ?? 0;
                    return chipsB - chipsA;
                  })
                  .map((p, i) => {
                    const playerId = p.user_id || (p as any).userId;
                    const username =
                      p.profiles?.username ||
                      (p as any).username ||
                      playerId?.slice(0, 8) + "...";
                    const isMe = playerId === currentUserId;
                    const chips = p.current_stack ?? p.chips ?? 0;
                    const isEliminated = p.status === "eliminated";

                    return (
                      <div
                        key={playerId || i}
                        className={`flex items-center justify-between p-2 rounded text-sm ${
                          isMe
                            ? "bg-blue-500/10 border border-blue-500/30"
                            : "bg-slate-900/50"
                        } ${isEliminated ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-slate-500 w-5 text-center text-xs">
                            #{i + 1}
                          </span>
                          <span
                            className={`truncate ${
                              isMe ? "text-blue-400 font-medium" : "text-slate-200"
                            }`}
                          >
                            {username}
                          </span>
                          {isMe && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1 py-0 text-blue-400"
                            >
                              You
                            </Badge>
                          )}
                          {isEliminated && (
                            <Badge
                              variant="destructive"
                              className="text-[10px] px-1 py-0"
                            >
                              Out
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {!isEliminated && (
                            <span className="text-slate-400 font-mono text-xs">
                              {chips.toLocaleString()}
                            </span>
                          )}
                          {!isMe && !isEliminated && onBanPlayer && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onBanPlayer(playerId!)}
                              disabled={isBanning === playerId}
                              className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                              title="Ban player"
                            >
                              {isBanning === playerId ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Ban className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
