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
} from "lucide-react";
import { TournamentStateResponse, BlindLevel } from "@/lib/types/tournament";
import { useState } from "react";

// Flexible participant type to handle different backend formats
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

interface TournamentRegistrationContentProps {
  tournament: TournamentStateResponse["tournament"];
  participants: ParticipantLike[];
  isHost: boolean;
  isRegistered: boolean;
  currentUserId: string | null;
  participantCount: number | null;
  canRegister: boolean;
}

export function TournamentRegistrationContent({
  tournament,
  participants,
  isHost,
  isRegistered,
  currentUserId,
  participantCount,
  canRegister,
}: TournamentRegistrationContentProps) {
  const [showAllBlinds, setShowAllBlinds] = useState(false);

  const blindStructure: BlindLevel[] =
    tournament?.blind_structure_template ||
    (tournament as any)?.blindStructureTemplate ||
    [];

  const totalParticipants = participantCount ?? participants.length;
  const maxPlayers = tournament?.max_players;
  const startingStack = tournament?.starting_stack || (tournament as any)?.startingStack || 10000;
  const playersPerTable = tournament?.max_players_per_table || (tournament as any)?.maxPlayersPerTable || 9;
  const levelDuration = tournament?.blind_level_duration_minutes || (tournament as any)?.blindLevelDurationMinutes || 10;

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 mb-3">
          <Trophy className="h-8 w-8 text-amber-400" />
          <h1 className="text-3xl md:text-4xl font-bold text-white">
            {tournament?.title || tournament?.name || "Tournament"}
          </h1>
        </div>
        {tournament?.description && (
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">{tournament.description}</p>
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
              Registered Players ({participants.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {participants.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">No players registered yet</p>
                <p className="text-slate-600 text-xs mt-1">Be the first to join!</p>
              </div>
            ) : (
              <ScrollArea className="h-[200px]">
                <div className="space-y-1.5">
                  {participants.map((p, i) => {
                    const playerId = p.user_id || (p as any).userId;
                    const username =
                      p.profiles?.username ||
                      (p as any).username ||
                      playerId?.slice(0, 8) + "...";
                    const isMe = playerId === currentUserId;

                    return (
                      <div
                        key={playerId || i}
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
                            {username}
                          </span>
                        </div>
                        {isMe && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0.5 text-blue-400 border-blue-400/30"
                          >
                            You
                          </Badge>
                        )}
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

      {isHost && participants.length < 2 && (
        <div className="mt-6 text-center">
          <p className="text-amber-400 text-sm">
            Need at least 2 players to start the tournament
          </p>
        </div>
      )}
    </div>
  );
}
