"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PlayLayout } from "@/components/layout/PlayLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTournamentSocket } from "@/lib/api/socket/tournament";
import { Tournament, TournamentStatusType } from "@/lib/types/tournament";
import { useToast } from "@/lib/hooks";
import { useTheme } from "@/components/providers/ThemeProvider";
import { createClientComponentClient } from "@/lib/api/supabase/client";
import {
  Loader2,
  ArrowLeft,
  Trophy,
  Users,
  Clock,
  Plus,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";

// Status badge component
function StatusBadge({ status }: { status: TournamentStatusType }) {
  const statusConfig: Record<
    TournamentStatusType,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    setup: { label: "Setup", variant: "secondary" },
    registration: { label: "Registration Open", variant: "default" },
    active: { label: "In Progress", variant: "default" },
    paused: { label: "Paused", variant: "outline" },
    completed: { label: "Completed", variant: "secondary" },
    cancelled: { label: "Cancelled", variant: "destructive" },
  };

  const config = statusConfig[status] || { label: status, variant: "secondary" };

  return (
    <Badge variant={config.variant} className="capitalize">
      {config.label}
    </Badge>
  );
}

export default function TournamentListPage() {
  const router = useRouter();
  const { getActiveTournaments } = useTournamentSocket();
  const { toast } = useToast();
  const { currentTheme } = useTheme();
  const supabase = createClientComponentClient();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const primaryColor = currentTheme.colors.primary[0];
  const primaryColorHover = currentTheme.colors.primary[1] || primaryColor;

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUserId(data.user.id);
      }
    });
  }, [supabase]);

  // Fetch active tournaments
  const fetchTournaments = async (showLoading = true) => {
    if (showLoading) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }

    try {
      const response = await getActiveTournaments();

      if ("error" in response) {
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive",
        });
        return;
      }

      setTournaments(response.tournaments || []);
    } catch (error: any) {
      console.error("[Tournaments] Failed to fetch:", error);
      toast({
        title: "Error",
        description: "Failed to load tournaments",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTournaments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTournamentClick = (tournament: Tournament) => {
    const id = tournament.id || tournament.tournamentId;
    if (id) {
      router.push(`/play/tournaments/${id}`);
    }
  };

  if (isLoading) {
    return (
      <PlayLayout title="Tournaments">
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      </PlayLayout>
    );
  }

  return (
    <PlayLayout
      title="Tournaments"
      footer={
        <Link href="/play/tournaments/create" className="w-full">
          <Button
            size="lg"
            className="w-full font-bold text-sm h-12"
            style={{
              background: `linear-gradient(to right, ${primaryColor}, ${primaryColorHover})`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `linear-gradient(to right, ${primaryColorHover}, ${primaryColor})`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = `linear-gradient(to right, ${primaryColor}, ${primaryColorHover})`;
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Tournament
          </Button>
        </Link>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Link
            href="/play"
            className="inline-flex items-center text-xs text-slate-500 hover:text-white"
          >
            <ArrowLeft className="h-3 w-3 mr-1" /> Back
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchTournaments(false)}
            disabled={isRefreshing}
            className="h-7 text-xs"
          >
            <RefreshCw
              className={`h-3 w-3 mr-1 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {/* Tournament List */}
        {tournaments.length === 0 ? (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-8 text-center">
              <Trophy className="h-12 w-12 text-slate-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-300 mb-2">
                No Active Tournaments
              </h3>
              <p className="text-sm text-slate-400 mb-4">
                There are no tournaments currently available. Create one to get
                started!
              </p>
              <Link href="/play/tournaments/create">
                <Button variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Tournament
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
                {tournaments.map((tournament) => {
              const id = tournament.id || tournament.tournamentId;
              const hostId = tournament.host_id || tournament.hostId;
              const isHost = currentUserId === hostId;
              const status = tournament.status || "setup";
              const title = tournament.title || tournament.name || "Untitled";
              const maxPlayers = tournament.max_players || tournament.maxPlayers;
              const playersPerTable =
                tournament.max_players_per_table ||
                tournament.maxPlayersPerTable ||
                9;

              return (
                <Card
                  key={id}
                  className="bg-slate-800/50 border-slate-700 hover:border-slate-600 cursor-pointer transition-colors"
                  onClick={() => handleTournamentClick(tournament)}
                >
                  <CardContent className="p-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-semibold text-sm text-slate-200 truncate flex-1 min-w-0">
                          {title}
                        </h3>
                        <StatusBadge status={status} />
                        {isHost && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            Host
                          </Badge>
                        )}
                      </div>
                      {tournament.description && (
                        <p className="text-xs text-slate-400 line-clamp-1">
                          {tournament.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {maxPlayers ? `Max ${maxPlayers}` : "Unlimited"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Trophy className="h-3 w-3" />
                          {playersPerTable}/table
                        </span>
                        {tournament.blind_level_duration_minutes ||
                        tournament.blindLevelDurationMinutes ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {tournament.blind_level_duration_minutes ||
                              tournament.blindLevelDurationMinutes}m
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PlayLayout>
  );
}
