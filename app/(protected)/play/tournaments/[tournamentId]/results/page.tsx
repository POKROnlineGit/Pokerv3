"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PlayLayout } from "@/components/layout/PlayLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { getSocket } from "@/lib/api/socket/client";
import { createClientComponentClient } from "@/lib/api/supabase/client";
import {
  TournamentResultsResponse,
  TournamentResultParticipant,
} from "@/lib/types/tournament";
import {
  Loader2,
  Trophy,
  Medal,
  ArrowLeft,
  Users,
  Calendar,
  Coins,
} from "lucide-react";
import Link from "next/link";
import { getErrorMessage } from "@/lib/utils";
import {
  getErrorMessageFromResponse,
  getDataFromResponse,
} from "@/lib/api/socket/utils/errors";

export default function TournamentResultsPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.tournamentId as string;
  const supabase = createClientComponentClient();

  const [resultsData, setResultsData] =
    useState<TournamentResultsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUserId(data.user.id);
      }
    });
  }, [supabase]);

  // Fetch tournament results
  useEffect(() => {
    if (!tournamentId) return;

    const fetchResults = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const socket = getSocket();

        // Connect if not connected
        if (!socket.connected) {
          socket.connect();
          // Wait for connection
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error("Connection timeout"));
            }, 5000);

            socket.once("connect", () => {
              clearTimeout(timeout);
              resolve();
            });

            socket.once("connect_error", (err) => {
              clearTimeout(timeout);
              reject(err);
            });
          });
        }

        // Call get_tournament_results
        socket.emit(
          "get_tournament_results",
          { tournamentId },
          (response: unknown) => {
            // Check for error first
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              setError(errorMessage);
              setIsLoading(false);
              return;
            }

            // Extract data from response (handles both old and new formats)
            const data = getDataFromResponse<TournamentResultsResponse>(response);
            if (data) {
              setResultsData(data);
            } else {
              setError("Invalid response format");
            }
            setIsLoading(false);
          }
        );
      } catch (err: unknown) {
        console.error("[TournamentResults] Error:", err);
        setError(getErrorMessage(err));
        setIsLoading(false);
      }
    };

    fetchResults();
  }, [tournamentId]);

  // Render placement icon
  const renderPlacementIcon = (placement: number | null) => {
    if (placement === 1) {
      return <Trophy className="h-5 w-5 text-amber-400" />;
    } else if (placement === 2) {
      return <Medal className="h-5 w-5 text-slate-300" />;
    } else if (placement === 3) {
      return <Medal className="h-5 w-5 text-amber-600" />;
    } else if (placement !== null) {
      return (
        <span className="text-sm font-bold text-slate-400 w-5 text-center">
          {placement}
        </span>
      );
    }
    return (
      <span className="text-sm text-slate-500 w-5 text-center">-</span>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <PlayLayout title="Tournament Results">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          <p className="text-slate-400 text-sm">Loading results...</p>
        </div>
      </PlayLayout>
    );
  }

  // Error state
  if (error) {
    return (
      <PlayLayout title="Tournament Results">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="text-red-400 text-center">
            <p className="font-medium">Failed to load results</p>
            <p className="text-sm text-slate-500 mt-1">{error}</p>
          </div>
          <Link href="/play/tournaments">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Tournaments
            </Button>
          </Link>
        </div>
      </PlayLayout>
    );
  }

  // No data
  if (!resultsData) {
    return (
      <PlayLayout title="Tournament Results">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-slate-400">No results found</p>
          <Link href="/play/tournaments">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Tournaments
            </Button>
          </Link>
        </div>
      </PlayLayout>
    );
  }

  const { tournament, participants, isEnded } = resultsData;

  // Ensure participants is always an array
  const participantsArray: TournamentResultParticipant[] = Array.isArray(participants)
    ? participants
    : [];

  // Sort participants by placement (null placements at end)
  const sortedParticipants = [...participantsArray].sort((a, b) => {
    if (a.placement === null && b.placement === null) return 0;
    if (a.placement === null) return 1;
    if (b.placement === null) return -1;
    return a.placement - b.placement;
  });

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <PlayLayout
      title="Tournament Results"
      tableContent={
        <div className="w-full h-full flex flex-col">
          {/* Header */}
          <div className="p-6 pb-4">
            <div className="max-w-2xl mx-auto">
              {/* Back link */}
              <Link
                href="/play/tournaments"
                className="inline-flex items-center text-sm text-slate-500 hover:text-white mb-4"
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Back to Tournaments
              </Link>

              {/* Title and Status */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-bold text-white truncate">
                    {tournament?.title || "Tournament"}
                  </h1>
                </div>
                <Badge
                  variant={
                    tournament?.status === "completed"
                      ? "secondary"
                      : "destructive"
                  }
                  className={`flex-shrink-0 ${
                    tournament?.status === "completed"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-red-500/10 text-red-400 border-red-500/20"
                  }`}
                >
                  {tournament?.status === "completed" ? (
                    <>
                      <Trophy className="h-3 w-3 mr-1" />
                      Completed
                    </>
                  ) : (
                    "Cancelled"
                  )}
                </Badge>
              </div>

              {/* Tournament Info */}
              <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  <span>{participantsArray.length} players</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Coins className="h-4 w-4" />
                  <span>
                    {tournament?.startingStack?.toLocaleString() || "0"} starting
                  </span>
                </div>
                {tournament?.endedAt && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    <span>{formatDate(tournament.endedAt)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator className="bg-slate-800" />

          {/* Standings */}
          <div className="flex-1 min-h-0 p-6 pt-4">
            <div className="max-w-2xl mx-auto h-full flex flex-col">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-400" />
                Final Standings
              </h2>

              <ScrollArea className="flex-1 -mr-4 pr-4">
                <div className="space-y-2">
                  {sortedParticipants.map((participant, index) => {
                    const isCurrentUser =
                      participant.odanUserId === currentUserId;
                    const isTopThree =
                      participant.placement !== null &&
                      participant.placement <= 3;

                    return (
                      <div
                        key={participant.odanUserId}
                        className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                          isCurrentUser
                            ? "bg-blue-500/10 border border-blue-500/30"
                            : isTopThree
                            ? "bg-slate-800/50"
                            : "bg-slate-900/50"
                        }`}
                      >
                        {/* Placement */}
                        <div className="w-8 flex justify-center">
                          {renderPlacementIcon(participant.placement)}
                        </div>

                        {/* Player Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-medium truncate ${
                                isCurrentUser
                                  ? "text-blue-400"
                                  : "text-white"
                              }`}
                            >
                              {participant.username || "Unknown"}
                            </span>
                            {isCurrentUser && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/30"
                              >
                                You
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Final Stack */}
                        <div className="text-right">
                          <div
                            className={`font-mono text-sm ${
                              participant.placement === 1
                                ? "text-amber-400"
                                : "text-slate-400"
                            }`}
                          >
                            {(participant.finalStack ?? 0).toLocaleString()}
                          </div>
                          <div className="text-[10px] text-slate-500">chips</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      }
      footer={
        <Link href="/play/tournaments" className="w-full">
          <Button
            variant="outline"
            size="lg"
            className="w-full font-bold text-sm h-12"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Tournaments
          </Button>
        </Link>
      }
    >
      {/* Sidebar Content */}
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="font-bold text-sm text-white">Tournament Results</h3>
          <Link
            href="/play/tournaments"
            className="inline-flex items-center text-sm text-slate-500 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Tournaments
          </Link>
        </div>

        <Separator className="bg-slate-800" />

        {/* Quick Stats */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Status</span>
            <Badge
              variant="secondary"
              className={`text-[10px] ${
                tournament?.status === "completed"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              {tournament?.status === "completed" ? "Completed" : "Cancelled"}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Players</span>
            <span className="text-white">{participantsArray.length}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Starting Stack</span>
            <span className="text-white font-mono">
              {tournament?.startingStack?.toLocaleString() || "0"}
            </span>
          </div>
          {tournament?.endedAt && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Ended</span>
              <span className="text-white text-[10px]">
                {formatDate(tournament.endedAt)}
              </span>
            </div>
          )}
        </div>

        {/* Winner highlight if there's a first place */}
        {sortedParticipants[0] && sortedParticipants[0].placement === 1 && (
          <>
            <Separator className="bg-slate-800" />
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="h-4 w-4 text-amber-400" />
                <span className="text-amber-400 text-xs font-medium">
                  Winner
                </span>
              </div>
              <p className="text-white font-bold truncate">
                {sortedParticipants[0].username || "Unknown"}
              </p>
              <p className="text-amber-400/70 text-xs font-mono">
                {(sortedParticipants[0].finalStack ?? 0).toLocaleString()} chips
              </p>
            </div>
          </>
        )}
      </div>
    </PlayLayout>
  );
}
