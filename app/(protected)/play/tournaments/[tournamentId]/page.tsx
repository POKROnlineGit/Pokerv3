"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { PlayLayout } from "@/components/layout/PlayLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  useTournamentSocket,
  useTournamentEvents,
} from "@/lib/api/socket/tournament";
import { useSocket } from "@/lib/api/socket/client";
import {
  TournamentStateResponse,
  TournamentStatusType,
  TournamentCompletedEvent,
  TournamentPlayerTransferredEvent,
  TournamentLevelWarningEvent,
  TournamentPlayerEliminatedEvent,
  BlindLevel,
} from "@/lib/types/tournament";
import { useToast } from "@/lib/hooks";
import { createClientComponentClient } from "@/lib/api/supabase/client";
import {
  Loader2,
  Users,
  Play,
  Pause,
  Square,
  X,
  Trophy,
  Clock,
  ArrowLeft,
  Table2,
  AlertTriangle,
  Check,
} from "lucide-react";
import Link from "next/link";

// Status badge component
function StatusBadge({ status }: { status: TournamentStatusType }) {
  const statusConfig: Record<
    TournamentStatusType,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }
  > = {
    setup: { label: "Setup", variant: "secondary", icon: null },
    registration: { label: "Registration Open", variant: "default", icon: <Users className="h-3 w-3" /> },
    active: { label: "In Progress", variant: "default", icon: <Play className="h-3 w-3" /> },
    paused: { label: "Paused", variant: "outline", icon: <Pause className="h-3 w-3" /> },
    completed: { label: "Completed", variant: "secondary", icon: <Trophy className="h-3 w-3" /> },
    cancelled: { label: "Cancelled", variant: "destructive", icon: <X className="h-3 w-3" /> },
  };

  const config = statusConfig[status] || { label: status, variant: "secondary", icon: null };

  return (
    <Badge variant={config.variant} className="capitalize flex items-center gap-1">
      {config.icon}
      {config.label}
    </Badge>
  );
}

// Countdown timer component
function CountdownTimer({ targetTime, label }: { targetTime: string | null; label: string }) {
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
    <div className="flex items-center gap-1.5 text-xs">
      <Clock className="h-3 w-3 text-slate-400 flex-shrink-0" />
      <span className="text-slate-400">{label}:</span>
      <span className="font-mono font-bold text-amber-400">{timeLeft}</span>
    </div>
  );
}

// Level warning notification
function LevelWarningBanner({ timeRemainingMs, currentLevel }: { timeRemainingMs: number; currentLevel: number }) {
  const seconds = Math.floor(timeRemainingMs / 1000);
  
  return (
    <div className="bg-amber-500/20 border border-amber-500/50 rounded-lg p-2 flex items-center gap-2 animate-pulse">
      <AlertTriangle className="h-3 w-3 text-amber-400 flex-shrink-0" />
      <span className="text-amber-200 text-xs font-medium truncate">
        Blinds increase in {seconds}s!
      </span>
    </div>
  );
}

export default function TournamentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.tournamentId as string;
  const {
    getTournamentState,
    registerTournament,
    unregisterTournament,
    joinTournamentRoom,
    tournamentAdminAction,
    getTournamentLeaderboard,
    joinTable,
  } = useTournamentSocket();
  const socket = useSocket();
  const { toast } = useToast();
  const supabase = createClientComponentClient();

  const [tournamentData, setTournamentData] =
    useState<TournamentStateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isUnregistering, setIsUnregistering] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showLevelWarning, setShowLevelWarning] = useState<TournamentLevelWarningEvent | null>(null);
  const hasCheckedRef = useRef(false);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUserId(data.user.id);
      }
    });
  }, [supabase]);

  // Handle tournament started - join assigned table
  const handleTournamentStarted = useCallback(async (startedTournamentId: string) => {
    if (startedTournamentId !== tournamentId || !currentUserId) return;

    // Get state to find table assignment
    const state = await getTournamentState(tournamentId);
    if ("error" in state) {
      console.error("[Tournament] Failed to get state after start:", state.error);
      return;
    }

    // Find current user's participant data
    const myParticipant = state.participants.find(
      (p) => (p.userId || p.user_id) === currentUserId
    );

    if (myParticipant) {
      const tableId =
        myParticipant.current_table_id ||
        myParticipant.current_game_id ||
        myParticipant.gameId ||
        myParticipant.tableId;

      if (tableId) {
        // Join the table game
        const result = await joinTable(tableId);
        if ("error" in result) {
          toast({
            title: "Error Joining Table",
            description: result.error || "Failed to join tournament table",
            variant: "destructive",
          });
        } else {
          // Navigate to game
          router.push(`/play/game/${tableId}`);
        }
      }
    }
  }, [tournamentId, currentUserId, getTournamentState, joinTable, router, toast]);

  // Handle player transferred
  const handlePlayerTransferred = useCallback(async (data: TournamentPlayerTransferredEvent) => {
    const playerId = data.playerId || data.userId;
    if (playerId !== currentUserId) return;

    const newTableId = data.targetTableId || data.toTableId || data.newTableId;
    if (!newTableId) {
      console.error("[Tournament] No new table ID in transfer event");
      return;
    }

    toast({
      title: "Table Transfer",
      description: "You're being moved to a new table...",
      variant: "default",
    });

    const result = await joinTable(newTableId);
    if ("error" in result) {
      toast({
        title: "Error Joining Table",
        description: result.error || "Failed to join new table",
        variant: "destructive",
      });
    } else {
      router.push(`/play/game/${newTableId}`);
    }
  }, [currentUserId, joinTable, router, toast]);

  // Handle tournament completed
  const handleTournamentCompleted = useCallback((data: TournamentCompletedEvent) => {
    const myResult = data.results.find((r) => r.playerId === currentUserId);
    if (myResult) {
      toast({
        title: "Tournament Complete!",
        description: `You finished in position #${myResult.position}${myResult.prize ? ` - Prize: ${myResult.prize}` : ""}`,
        variant: "default",
      });
    } else {
      toast({
        title: "Tournament Complete",
        description: `Winner: Player ${data.winnerId.slice(0, 8)}...`,
        variant: "default",
      });
    }
  }, [currentUserId, toast]);

  // Handle level warning
  const handleLevelWarning = useCallback((data: TournamentLevelWarningEvent) => {
    setShowLevelWarning(data);
    // Auto-hide after 5 seconds
    setTimeout(() => setShowLevelWarning(null), 5000);
  }, []);

  // Handle player eliminated
  const handlePlayerEliminated = useCallback((data: TournamentPlayerEliminatedEvent) => {
    if (data.playerId === currentUserId) {
      toast({
        title: "Eliminated",
        description: `You finished in position #${data.finishPosition}${data.prizeAmount ? ` - Prize: ${data.prizeAmount}` : ""}`,
        variant: "destructive",
      });
    }
  }, [currentUserId, toast]);

  const {
    tournamentState: realTimeState,
    statusChange,
    participantCount,
    blindLevel,
    levelWarning,
    tournamentStarted,
    tournamentCompleted,
  } = useTournamentEvents(tournamentId, {
    currentUserId,
    onTournamentStarted: handleTournamentStarted,
    onPlayerTransferred: handlePlayerTransferred,
    onTournamentCompleted: handleTournamentCompleted,
    onLevelWarning: handleLevelWarning,
    onPlayerEliminated: handlePlayerEliminated,
  });

  // Check tournament state on load
  useEffect(() => {
    const checkTournamentState = async () => {
      if (!currentUserId || !tournamentId || hasCheckedRef.current) return;

      setIsLoading(true);
      hasCheckedRef.current = true;

      try {
        const response = await getTournamentState(tournamentId);

        if ("error" in response) {
          toast({
            title: "Tournament Not Found",
            description: response.error,
            variant: "destructive",
          });
          router.replace("/play/tournaments");
          return;
        }

        // Extract status
        let status: TournamentStatusType;
        let hostId: string | undefined;

        if (typeof response.status === "string") {
          status = response.status as TournamentStatusType;
          hostId = response.hostId;
        } else if ((response as any).status?.status) {
          status = (response as any).status.status;
          hostId = response.hostId;
        } else {
          status = (response as any).tournament?.status;
          hostId = (response as any).tournament?.host_id || response.hostId;
        }

        const isHost = hostId === currentUserId;

        // Handle setup status
        if (status === "setup") {
          if (isHost) {
            router.replace(`/play/tournaments/setup/${tournamentId}`);
          } else {
            toast({
              title: "Tournament Not Available",
              description: "This tournament is not currently open for registration.",
              variant: "default",
            });
            router.replace("/play/tournaments");
          }
          return;
        }

        setTournamentData(response as TournamentStateResponse);
        setIsLoading(false);
        
        // Join tournament room for real-time updates
        joinTournamentRoom(tournamentId).catch((err) => {
          console.error("[Tournament] Failed to join room:", err);
        });
      } catch (error: any) {
        console.error("[Tournament] Error checking state:", error);
        toast({
          title: "Error",
          description: "Failed to load tournament",
          variant: "destructive",
        });
        router.replace("/play/tournaments");
      }
    };

    if (tournamentId && currentUserId) {
      checkTournamentState();
    }
  }, [tournamentId, currentUserId, getTournamentState, router, toast, joinTournamentRoom]);

  // Update from real-time state
  useEffect(() => {
    if (realTimeState) {
      setTournamentData(realTimeState);
    }
  }, [realTimeState]);

  // Update level warning from event
  useEffect(() => {
    if (levelWarning) {
      setShowLevelWarning(levelWarning);
      setTimeout(() => setShowLevelWarning(null), 5000);
    }
  }, [levelWarning]);

  // Loading state
  if (isLoading || !tournamentData) {
    return (
      <PlayLayout title="Tournament">
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      </PlayLayout>
    );
  }

  // Extract data from state
  const tournament = tournamentData.tournament;
  const status: TournamentStatusType =
    typeof tournamentData.status === "string"
      ? (tournamentData.status as TournamentStatusType)
      : ((tournamentData as any).status?.status || tournament?.status) as TournamentStatusType;
  const participants = tournamentData.participants || [];
  const tables = tournamentData.tables || [];
  const hostId = tournamentData.hostId || tournament?.host_id;
  const canRegister = tournamentData.canRegister ?? false;

  const isHost = currentUserId ? hostId === currentUserId : false;
  const isRegistered = currentUserId
    ? participants.some((p) => (p.userId || p.user_id) === currentUserId)
    : false;

  // Get current blind level info
  const currentBlindLevel = tournament?.current_blind_level ?? 0;
  const blindStructure: BlindLevel[] =
    tournament?.blind_structure_template ||
    tournament?.blindStructureTemplate ||
    [];
  const currentBlinds = blindStructure[currentBlindLevel] || { small: 0, big: 0 };
  const nextBlinds = blindStructure[currentBlindLevel + 1];
  const levelEndsAt = tournament?.level_ends_at;

  // Find my participant data
  const myParticipant = currentUserId
    ? participants.find((p) => (p.userId || p.user_id) === currentUserId)
    : null;
  const myTableId = myParticipant?.current_table_id || myParticipant?.tableId;

  // ============================================
  // ACTION HANDLERS
  // ============================================

  const handleRegister = async () => {
    setIsRegistering(true);
    try {
      const response = await registerTournament(tournamentId);
      if ("error" in response) {
        toast({
          title: "Registration Failed",
          description: response.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Registered",
          description: "You have been registered for the tournament",
        });
        // Refresh state
        const updated = await getTournamentState(tournamentId);
        if (!("error" in updated)) {
          setTournamentData(updated as TournamentStateResponse);
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to register",
        variant: "destructive",
      });
    } finally {
      setIsRegistering(false);
    }
  };

  const handleUnregister = async () => {
    setIsUnregistering(true);
    try {
      const response = await unregisterTournament(tournamentId);
      if ("error" in response) {
        toast({
          title: "Unregister Failed",
          description: response.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Unregistered",
          description: "You have been removed from the tournament",
        });
        // Refresh state
        const updated = await getTournamentState(tournamentId);
        if (!("error" in updated)) {
          setTournamentData(updated as TournamentStateResponse);
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to unregister",
        variant: "destructive",
      });
    } finally {
      setIsUnregistering(false);
    }
  };

  const handleStart = async () => {
    if (participants.length < 2) {
      toast({
        title: "Cannot Start",
        description: "Need at least 2 players to start the tournament",
        variant: "destructive",
      });
      return;
    }

    setIsStarting(true);
    try {
      const response = await tournamentAdminAction(tournamentId, "START_TOURNAMENT");
      if ("error" in response) {
        toast({
          title: "Error Starting Tournament",
          description: response.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Tournament Started",
          description: "The tournament has begun!",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to start tournament",
        variant: "destructive",
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handlePauseResume = async () => {
    setIsPausing(true);
    const action = status === "paused" ? "RESUME_TOURNAMENT" : "PAUSE_TOURNAMENT";
    try {
      const response = await tournamentAdminAction(tournamentId, action);
      if ("error" in response) {
        toast({
          title: `Error ${status === "paused" ? "Resuming" : "Pausing"}`,
          description: response.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: status === "paused" ? "Resumed" : "Paused",
          description: `Tournament has been ${status === "paused" ? "resumed" : "paused"}`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsPausing(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this tournament? This cannot be undone.")) {
      return;
    }

    setIsCancelling(true);
    try {
      const response = await tournamentAdminAction(tournamentId, "CANCEL_TOURNAMENT");
      if ("error" in response) {
        toast({
          title: "Error Cancelling",
          description: response.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Tournament Cancelled",
          description: "The tournament has been cancelled",
        });
        router.replace("/play/tournaments");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleGoToTable = () => {
    if (myTableId) {
      router.push(`/play/game/${myTableId}`);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <PlayLayout
      title={tournament?.title || tournament?.name || "Tournament"}
      footer={
        <div className="flex flex-col gap-2 w-full">
          {/* Player actions */}
          {!isHost && status === "registration" && (
            isRegistered ? (
              <Button
                onClick={handleUnregister}
                disabled={isUnregistering}
                size="lg"
                variant="outline"
                className="w-full font-bold text-sm h-12"
              >
                {isUnregistering ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <X className="mr-2 h-4 w-4" />
                )}
                Unregister
              </Button>
            ) : canRegister ? (
              <Button
                onClick={handleRegister}
                disabled={isRegistering}
                size="lg"
                className="w-full font-bold text-sm h-12"
              >
                {isRegistering ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Users className="mr-2 h-4 w-4" />
                )}
                Register
              </Button>
            ) : null
          )}

          {/* Go to table button for active players */}
          {isRegistered && status === "active" && myTableId && (
            <Button
              onClick={handleGoToTable}
              size="lg"
              className="w-full font-bold text-sm h-12"
            >
              <Table2 className="mr-2 h-4 w-4" />
              Go to Table
            </Button>
          )}

          {/* Host actions */}
          {isHost && status === "registration" && (
            <Button
              onClick={handleStart}
              disabled={isStarting || participants.length < 2}
              size="lg"
              className="w-full font-bold text-sm h-12"
            >
              {isStarting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Start Tournament
            </Button>
          )}

          {isHost && (status === "active" || status === "paused") && (
            <div className="flex gap-2">
              <Button
                onClick={handlePauseResume}
                disabled={isPausing}
                size="lg"
                variant="outline"
                className="flex-1 font-bold text-sm h-12"
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
                onClick={handleCancel}
                disabled={isCancelling}
                size="lg"
                variant="destructive"
                className="font-bold text-sm h-12 px-3"
              >
                {isCancelling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}

          {isHost && status !== "active" && status !== "paused" && status !== "completed" && status !== "cancelled" && (
            <Button
              onClick={handleCancel}
              disabled={isCancelling}
              size="lg"
              variant="destructive"
              className="w-full font-bold text-sm h-12"
            >
              {isCancelling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Square className="mr-2 h-4 w-4" />
                  Cancel
                </>
              )}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-3 p-0">
        <Link
          href="/play/tournaments"
          className="inline-flex items-center text-sm text-slate-500 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Tournaments
        </Link>

        {/* Level Warning Banner */}
        {showLevelWarning && (
          <LevelWarningBanner
            timeRemainingMs={showLevelWarning.timeRemainingMs}
            currentLevel={showLevelWarning.currentLevel}
          />
        )}

        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold truncate flex-1 min-w-0">
              {tournament?.title || tournament?.name || "Tournament"}
            </h1>
            <StatusBadge status={status} />
          </div>
          {tournament?.description && (
            <p className="text-sm text-slate-400 line-clamp-2">{tournament.description}</p>
          )}
        </div>

        {/* Status banners */}
        {isRegistered && status === "registration" && (
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2">
            <Check className="h-3 w-3 text-emerald-400 flex-shrink-0" />
            <p className="text-emerald-400 text-xs font-medium truncate">
              You are registered
            </p>
          </div>
        )}

        {isHost && (
          <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center gap-2">
            <Trophy className="h-3 w-3 text-blue-400 flex-shrink-0" />
            <p className="text-blue-400 text-xs font-medium truncate flex-1 min-w-0">
              You are the host
            </p>
            {status === "setup" && (
              <Link href={`/play/tournaments/setup/${tournamentId}`}>
                <Button variant="link" size="sm" className="text-blue-400 text-xs h-auto p-0 ml-1">
                  Settings →
                </Button>
              </Link>
            )}
          </div>
        )}

        {/* Blind Info (active/paused tournaments) */}
        {(status === "active" || status === "paused") && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-3">
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-slate-400">Level {currentBlindLevel + 1}</p>
                  <p className="text-xl font-bold text-white">
                    {currentBlinds.small} / {currentBlinds.big}
                  </p>
                  {nextBlinds && (
                    <p className="text-xs text-slate-500">
                      Next: {nextBlinds.small}/{nextBlinds.big}
                    </p>
                  )}
                </div>
                <CountdownTimer targetTime={levelEndsAt ?? null} label="Ends" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 truncate">Participants</p>
                  <p className="text-lg font-bold truncate">
                    {participantCount !== null ? participantCount : participants.length}
                    {tournament?.max_players && (
                      <span className="text-slate-500 text-xs font-normal">
                        /{tournament.max_players}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Table2 className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 truncate">Tables</p>
                  <p className="text-lg font-bold">
                    {tables.length || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tournament Settings */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2 px-3 pt-3">
            <CardTitle className="text-xs font-medium text-slate-400">Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs px-3 pb-3">
            <div className="flex justify-between">
              <span className="text-slate-400 truncate">Starting Stack</span>
              <span className="font-medium ml-2">
                {tournament?.starting_stack || tournament?.startingStack || 10000}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 truncate">Per Table</span>
              <span className="font-medium ml-2">
                {tournament?.max_players_per_table || tournament?.maxPlayersPerTable || 9}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 truncate">Level Duration</span>
              <span className="font-medium ml-2">
                {tournament?.blind_level_duration_minutes || tournament?.blindLevelDurationMinutes || 10}m
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 truncate">Blind Levels</span>
              <span className="font-medium ml-2">{blindStructure.length}</span>
            </div>
          </CardContent>
        </Card>

        {/* Participants List */}
        {participants.length > 0 && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2 px-3 pt-3">
              <CardTitle className="text-xs font-medium text-slate-400">
                Participants ({participants.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {participants.map((p, i) => {
                  const playerId = p.user_id || p.userId;
                  const username = p.profiles?.username || p.username || playerId?.slice(0, 8) + "...";
                  const isMe = playerId === currentUserId;
                  const chips = p.current_stack ?? p.chips;
                  const pStatus = p.status;

                  return (
                    <div
                      key={playerId || i}
                      className={`flex items-center justify-between p-1.5 rounded text-xs ${
                        isMe ? "bg-slate-700/50" : ""
                      } ${pStatus === "eliminated" ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="text-slate-500 w-4 text-center text-xs flex-shrink-0">{i + 1}</span>
                        <span className={`truncate ${isMe ? "text-blue-400 font-medium" : "text-slate-200"}`}>
                          {username}
                        </span>
                        {isMe && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 flex-shrink-0">You</Badge>
                        )}
                        {pStatus === "eliminated" && (
                          <Badge variant="destructive" className="text-[10px] px-1 py-0 flex-shrink-0">Out</Badge>
                        )}
                      </div>
                      {(status === "active" || status === "paused") && chips !== undefined && (
                        <span className="text-slate-400 font-mono text-xs ml-2 flex-shrink-0">
                          {chips.toLocaleString()}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tables (for active tournaments) */}
        {tables.length > 0 && (status === "active" || status === "paused") && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2 px-3 pt-3">
              <CardTitle className="text-xs font-medium text-slate-400">
                Tables ({tables.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="space-y-1.5">
                {tables.map((table, i) => (
                  <div
                    key={table.tableId}
                    className={`flex items-center justify-between p-2 rounded border text-xs ${
                      table.tableId === myTableId
                        ? "bg-blue-500/10 border-blue-500/30"
                        : "bg-slate-900/50 border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <Table2 className="h-3 w-3 text-slate-400 flex-shrink-0" />
                      <span className="font-medium truncate">
                        Table {(table as any).tournamentTableIndex !== undefined
                          ? (table as any).tournamentTableIndex + 1
                          : i + 1}
                      </span>
                      {table.tableId === myTableId && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 text-blue-400 flex-shrink-0">
                          Yours
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 flex-shrink-0">
                      <span className="whitespace-nowrap">
                        {table.playerCount ?? (typeof table.players === 'number' ? table.players : Array.isArray(table.players) ? table.players.length : 0)}/{table.maxPlayers ?? 9}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tournament Results (completed) */}
        {status === "completed" && tournamentCompleted && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-400" />
                Final Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {tournamentCompleted.results.slice(0, 10).map((result) => (
                  <div
                    key={result.playerId}
                    className={`flex items-center justify-between p-2 rounded ${
                      result.playerId === currentUserId ? "bg-slate-700/50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`font-bold w-8 text-center ${
                        result.position === 1 ? "text-amber-400" :
                        result.position === 2 ? "text-slate-300" :
                        result.position === 3 ? "text-amber-600" : "text-slate-400"
                      }`}>
                        #{result.position}
                      </span>
                      <span className={result.playerId === currentUserId ? "text-blue-400" : ""}>
                        {result.playerId.slice(0, 8)}...
                      </span>
                    </div>
                    {result.prize && (
                      <span className="text-emerald-400 font-medium">
                        +{result.prize}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PlayLayout>
  );
}
