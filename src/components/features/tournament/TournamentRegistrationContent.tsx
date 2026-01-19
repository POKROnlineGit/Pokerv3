"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users,
  Clock,
  Coins,
  Table2,
  Trophy,
  Settings,
  ChevronDown,
  ChevronUp,
  Check,
  Ban,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TournamentData,
  Participant,
  BlindLevel,
  normalizeParticipant,
  normalizeTournament,
} from "@/lib/types/tournament";
import { useState, useMemo } from "react";

interface TournamentRegistrationContentProps {
  tournament: TournamentData | Record<string, unknown>;
  participants: Array<Participant | Record<string, unknown>>;
  isHost: boolean;
  isRegistered: boolean;
  currentUserId: string | null;
  participantCount: number | null;
  canRegister: boolean;
  onBanPlayer?: (playerId: string) => void;
  isBanning?: string | null;
}

export function TournamentRegistrationContent({
  tournament,
  participants,
  isHost,
  isRegistered,
  currentUserId,
  participantCount,
  canRegister,
  onBanPlayer,
  isBanning,
}: TournamentRegistrationContentProps) {
  const [showAllBlinds, setShowAllBlinds] = useState(false);

  // Normalize tournament and participants data
  const normalizedTournament = useMemo(
    () => normalizeTournament(tournament),
    [tournament]
  );
  const normalizedParticipants = useMemo(
    () => participants.map((p) => normalizeParticipant(p)),
    [participants]
  );

  const blindStructure: BlindLevel[] = normalizedTournament.blindStructureTemplate;
  const totalParticipants = participantCount ?? normalizedParticipants.length;
  const maxPlayers = normalizedTournament.maxPlayers;
  const startingStack = normalizedTournament.startingStack || 10000;
  const playersPerTable = normalizedTournament.maxPlayersPerTable || 9;
  const levelDuration = normalizedTournament.blindLevelDurationMinutes || 10;

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 mb-3">
          <Trophy className="h-8 w-8 text-amber-400" />
          <h1 className="text-3xl md:text-4xl font-bold text-white">
            {normalizedTournament.title || "Tournament"}
          </h1>
        </div>
        {normalizedTournament.description && (
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">{normalizedTournament.description}</p>
        )}

        {/* Status badges */}
        <div className="flex items-center justify-center gap-3 mt-4">
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-sm px-3 py-1">
            Registration Open
          </Badge>
          {isHost && (
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-sm px-3 py-1">
              <Trophy className="h-3 w-3 mr-1" />
              Host
            </Badge>
          )}
          {isRegistered && (
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-sm px-3 py-1">
              <Check className="h-3 w-3 mr-1" />
              Registered
            </Badge>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4 text-center">
            <Users className="h-6 w-6 text-blue-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">
              {totalParticipants}
              {maxPlayers && <span className="text-slate-500 text-base font-normal">/{maxPlayers}</span>}
            </p>
            <p className="text-xs text-slate-400">Players</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4 text-center">
            <Coins className="h-6 w-6 text-amber-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{startingStack.toLocaleString()}</p>
            <p className="text-xs text-slate-400">Starting Stack</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4 text-center">
            <Table2 className="h-6 w-6 text-emerald-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{playersPerTable}</p>
            <p className="text-xs text-slate-400">Per Table</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4 text-center">
            <Clock className="h-6 w-6 text-purple-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{levelDuration}m</p>
            <p className="text-xs text-slate-400">Level Duration</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Blind Structure */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Blind Structure ({blindStructure.length} levels)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {(showAllBlinds ? blindStructure : blindStructure.slice(0, 5)).map((level, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-1.5 px-2 rounded bg-slate-900/50 text-sm"
                >
                  <span className="text-slate-400">Level {i + 1}</span>
                  <span className="font-mono font-medium text-white">
                    {level.small} / {level.big}
                  </span>
                </div>
              ))}
              {blindStructure.length > 5 && (
                <button
                  onClick={() => setShowAllBlinds(!showAllBlinds)}
                  className="w-full text-center text-xs text-slate-500 hover:text-white py-2 flex items-center justify-center gap-1"
                >
                  {showAllBlinds ? (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      Show All ({blindStructure.length - 5} more)
                    </>
                  )}
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Participants List */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Registered Players ({normalizedParticipants.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {normalizedParticipants.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">No players registered yet</p>
                <p className="text-slate-600 text-xs mt-1">Be the first to join!</p>
              </div>
            ) : (
              <ScrollArea className="h-[200px]">
                <div className="space-y-1.5">
                  {normalizedParticipants.map((p, i) => {
                    const isMe = p.odanUserId === currentUserId;

                    return (
                      <div
                        key={p.odanUserId || i}
                        className={`flex items-center justify-between p-2 rounded text-sm ${
                          isMe ? "bg-blue-500/10 border border-blue-500/30" : "bg-slate-900/50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 w-6 text-center text-xs">
                            #{i + 1}
                          </span>
                          <span
                            className={`truncate ${
                              isMe ? "text-blue-400 font-medium" : "text-slate-200"
                            }`}
                          >
                            {p.username}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isMe && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0.5 text-blue-400 border-blue-400/30"
                            >
                              You
                            </Badge>
                          )}
                          {isHost && !isMe && onBanPlayer && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onBanPlayer(p.odanUserId)}
                              disabled={isBanning === p.odanUserId}
                              className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                              title="Ban player"
                            >
                              {isBanning === p.odanUserId ? (
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
            )}
          </CardContent>
        </Card>
      </div>

      {/* Registration status message */}
      {!isHost && !isRegistered && canRegister && (
        <div className="mt-6 text-center">
          <p className="text-slate-400">
            Use the sidebar to register for this tournament
          </p>
        </div>
      )}

      {isHost && normalizedParticipants.length < 2 && (
        <div className="mt-6 text-center">
          <p className="text-amber-400 text-sm">
            Need at least 2 players to start the tournament
          </p>
        </div>
      )}
    </div>
  );
}
