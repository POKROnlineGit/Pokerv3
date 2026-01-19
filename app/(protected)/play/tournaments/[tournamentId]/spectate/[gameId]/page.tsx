"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PokerTable } from "@/components/features/game/PokerTable";
import { PlayLayout } from "@/components/layout/PlayLayout";
import { GameState } from "@/lib/types/poker";
import { getSocket } from "@/lib/api/socket/client";
import { createClientComponentClient } from "@/lib/api/supabase/client";
import { useToast } from "@/lib/hooks";
import { useStatus } from "@/components/providers/StatusProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  TournamentStateResponse,
  TournamentBlindLevelAdvancedEvent,
  TournamentLevelWarningEvent,
  TournamentTablesMergedEvent,
  TournamentCompletedEvent,
  BlindLevel,
  TournamentStatusType,
} from "@/lib/types/tournament";
import {
  Users,
  Clock,
  TrendingUp,
  Table2,
  Trophy,
  AlertTriangle,
  ArrowLeft,
  Eye,
  Play,
  Pause,
  Square,
  Loader2,
} from "lucide-react";
import Link from "next/link";

// Countdown timer component
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

// Status badge component
function StatusBadge({ status }: { status: TournamentStatusType }) {
  const statusConfig: Record<
    TournamentStatusType,
    { label: string; className: string }
  > = {
    setup: { label: "Setup", className: "bg-slate-500/20 text-slate-400" },
    registration: { label: "Registration", className: "bg-blue-500/20 text-blue-400" },
    active: { label: "Active", className: "bg-emerald-500/20 text-emerald-400" },
    paused: { label: "Paused", className: "bg-amber-500/20 text-amber-400" },
    completed: { label: "Completed", className: "bg-slate-500/20 text-slate-400" },
    cancelled: { label: "Cancelled", className: "bg-red-500/20 text-red-400" },
  };

  const config = statusConfig[status] || statusConfig.setup;

  return (
    <Badge className={`${config.className} text-[10px] px-1.5`}>
      {config.label}
    </Badge>
  );
}

export default function TournamentSpectatePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;
  const tournamentId = params.tournamentId as string;

  // Game state
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Tournament state
  const [tournamentInfo, setTournamentInfo] = useState<TournamentStateResponse | null>(null);
  const [showLevelWarning, setShowLevelWarning] = useState(false);
  const [levelWarningSeconds, setLevelWarningSeconds] = useState<number>(0);
  const [isPausing, setIsPausing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Refs
  const tournamentJoinedRef = useRef<boolean>(false);

  const supabase = createClientComponentClient();
  const { toast } = useToast();
  const { setStatus, clearStatus } = useStatus();

  // Derived tournament values
  const blindStructure =
    tournamentInfo?.tournament?.blind_structure_template ||
    (tournamentInfo?.tournament as any)?.blindStructureTemplate ||
    [];

  const currentBlindLevel = useMemo(() => {
    if (typeof tournamentInfo?.status === "object") {
      return (tournamentInfo.status as any).currentBlindLevel ?? 0;
    }
    return tournamentInfo?.tournament?.current_blind_level ?? 0;
  }, [tournamentInfo]);

  const levelEndsAt = useMemo(() => {
    if (typeof tournamentInfo?.status === "object") {
      return (tournamentInfo.status as any).levelEndsAt;
    }
    return tournamentInfo?.tournament?.level_ends_at;
  }, [tournamentInfo]);

  const currentBlinds = blindStructure[currentBlindLevel] || { small: 0, big: 0 };
  const nextBlinds: BlindLevel | null = blindStructure[currentBlindLevel + 1] || null;

  const playersRemaining = useMemo(() => {
    if (typeof tournamentInfo?.status === "object") {
      return (tournamentInfo.status as any).totalPlayers ?? 0;
    }
    return (
      tournamentInfo?.participants?.filter(
        (p) => p.status === "active" || (p as any).status === "playing"
      ).length ?? 0
    );
  }, [tournamentInfo]);

  const tablesRemaining = useMemo(() => {
    if (typeof tournamentInfo?.status === "object") {
      return (tournamentInfo.status as any).tableCount ?? 0;
    }
    return tournamentInfo?.tables?.length ?? 0;
  }, [tournamentInfo]);

  const tournamentName =
    tournamentInfo?.tournament?.title ||
    (tournamentInfo?.tournament as any)?.name;

  const tournamentStatus: TournamentStatusType =
    typeof tournamentInfo?.status === "string"
      ? tournamentInfo.status
      : (tournamentInfo?.status as any)?.status ||
        tournamentInfo?.tournament?.status ||
        "active";

  const isHost = currentUserId === tournamentInfo?.hostId;

  // Get table index for display
  const tableIndex = useMemo(() => {
    if (!tournamentInfo?.tables) return 1;
    const table = tournamentInfo.tables.find((t) => t.tableId === gameId);
    return table?.tournamentTableIndex !== undefined
      ? table.tournamentTableIndex + 1
      : 1;
  }, [tournamentInfo?.tables, gameId]);

  // Get table max seats for PokerTable
  const tableMaxSeats = useMemo(() => {
    if (!tournamentInfo?.tables) return undefined;
    const table = tournamentInfo.tables.find((t) => t.tableId === gameId);
    return (table as any)?.maxSeats || tournamentInfo?.tournament?.max_players_per_table;
  }, [tournamentInfo?.tables, tournamentInfo?.tournament?.max_players_per_table, gameId]);

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUserId(data.user.id);
      }
    });
  }, [supabase]);

  // Connect to spectate
  useEffect(() => {
    if (!currentUserId || !tournamentId) return;

    let mounted = true;
    const socket = getSocket();

    const connectAndSpectate = () => {
      if (!socket.connected) {
        socket.connect();
      }

      const onConnect = () => {
        if (!mounted) return;

        // Start spectating
        socket.emit(
          "spectate_tournament_table",
          { tournamentId, tableId: gameId },
          (response: any) => {
            if (response?.error) {
              console.error("[Spectate] Error:", response.error);
              toast({
                title: "Cannot Spectate",
                description: response.error,
                variant: "destructive",
              });
              router.push(`/play/tournaments/${tournamentId}`);
              return;
            }

            if (response?.gameState || response?.state) {
              setGameState(response.gameState || response.state);
              setIsInitializing(false);
            }
          }
        );

        // Fetch tournament state
        socket.emit(
          "get_tournament_state",
          { tournamentId },
          (response: any) => {
            if (response && !response.error) {
              setTournamentInfo(response);
            }
          }
        );

        // Join tournament room for updates
        if (!tournamentJoinedRef.current) {
          socket.emit("join_tournament_room", { tournamentId });
          tournamentJoinedRef.current = true;
        }
      };

      if (socket.connected) {
        onConnect();
      } else {
        socket.once("connect", onConnect);
      }
    };

    // Handle game state updates
    const handleGameState = (state: GameState) => {
      if (!mounted) return;
      if (state.gameId === gameId) {
        setGameState(state);
        setIsInitializing(false);
      }
    };

    // Handle disconnect
    const handleDisconnect = () => {
      if (mounted) {
        setIsDisconnected(true);
      }
    };

    const handleReconnect = () => {
      if (mounted) {
        setIsDisconnected(false);
        // Re-spectate
        socket.emit(
          "spectate_tournament_table",
          { tournamentId, tableId: gameId },
          (response: any) => {
            if (response?.gameState || response?.state) {
              setGameState(response.gameState || response.state);
            }
          }
        );
      }
    };

    // Tournament events
    const handleTournamentState = (state: TournamentStateResponse) => {
      if (mounted && (state as any).tournamentId === tournamentId) {
        setTournamentInfo(state);
      }
    };

    const handleBlindLevelAdvanced = (data: TournamentBlindLevelAdvancedEvent) => {
      if (mounted && data.tournamentId === tournamentId) {
        setTournamentInfo((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            status:
              typeof prev.status === "object"
                ? {
                    ...(prev.status as any),
                    currentBlindLevel: data.level,
                    levelEndsAt: data.levelEndsAt,
                  }
                : prev.status,
            tournament: {
              ...prev.tournament,
              current_blind_level: data.level,
              level_ends_at: data.levelEndsAt,
            },
          };
        });
      }
    };

    const handleLevelWarning = (data: TournamentLevelWarningEvent) => {
      if (mounted && data.tournamentId === tournamentId) {
        const seconds = Math.floor(data.timeRemainingMs / 1000);
        setLevelWarningSeconds(seconds);
        setShowLevelWarning(true);
        setTimeout(() => setShowLevelWarning(false), 5000);
      }
    };

    const handleTablesMerged = (data: TournamentTablesMergedEvent) => {
      if (mounted && data.tournamentId === tournamentId) {
        // If the table we're spectating was closed, go back
        if (data.closedTableId === gameId) {
          toast({
            title: "Table Merged",
            description: "The table you were watching has been merged",
          });
          router.push(`/play/tournaments/${tournamentId}`);
        }
      }
    };

    const handleTournamentCompleted = (data: TournamentCompletedEvent) => {
      if (mounted && data.tournamentId === tournamentId) {
        toast({
          title: "Tournament Complete",
          description: `Winner: ${data.winnerUsername || data.winnerId.slice(0, 8)}...`,
        });
        router.push(`/play/tournaments/${tournamentId}`);
      }
    };

    // Register event listeners
    socket.on("gameState", handleGameState);
    socket.on("disconnect", handleDisconnect);
    socket.on("reconnect", handleReconnect);
    socket.on("connect", handleReconnect);
    socket.on("tournamentState", handleTournamentState);
    socket.on("TOURNAMENT_BLIND_LEVEL_ADVANCED", handleBlindLevelAdvanced);
    socket.on("TOURNAMENT_LEVEL_WARNING", handleLevelWarning);
    socket.on("TOURNAMENT_TABLES_MERGED", handleTablesMerged);
    socket.on("TOURNAMENT_COMPLETED", handleTournamentCompleted);

    connectAndSpectate();

    return () => {
      mounted = false;
      socket.off("gameState", handleGameState);
      socket.off("disconnect", handleDisconnect);
      socket.off("reconnect", handleReconnect);
      socket.off("connect", handleReconnect);
      socket.off("tournamentState", handleTournamentState);
      socket.off("TOURNAMENT_BLIND_LEVEL_ADVANCED", handleBlindLevelAdvanced);
      socket.off("TOURNAMENT_LEVEL_WARNING", handleLevelWarning);
      socket.off("TOURNAMENT_TABLES_MERGED", handleTablesMerged);
      socket.off("TOURNAMENT_COMPLETED", handleTournamentCompleted);

      // Stop spectating and leave room
      socket.emit("stop_spectating_tournament", { tournamentId });
      socket.emit("leave_tournament_room", { tournamentId });
    };
  }, [currentUserId, gameId, tournamentId, toast, router]);

  // Status management
  useEffect(() => {
    if (isDisconnected) {
      setStatus({
        id: "spectate-disconnect",
        priority: 100,
        type: "error",
        title: "Connection Lost",
        message: "Reconnecting...",
      });
    } else {
      clearStatus("spectate-disconnect");
    }
  }, [isDisconnected, setStatus, clearStatus]);

  // Host actions
  const handlePauseResume = async () => {
    if (!tournamentId) return;
    setIsPausing(true);
    const socket = getSocket();
    const action = tournamentStatus === "paused" ? "RESUME_TOURNAMENT" : "PAUSE_TOURNAMENT";

    socket.emit(
      "tournament_admin_action",
      { tournamentId, action },
      (response: any) => {
        setIsPausing(false);
        if (response?.error) {
          toast({
            title: "Error",
            description: response.error,
            variant: "destructive",
          });
        }
      }
    );
  };

  const handleCancel = async () => {
    if (!tournamentId) return;
    setIsCancelling(true);
    const socket = getSocket();

    socket.emit(
      "tournament_admin_action",
      { tournamentId, action: "CANCEL_TOURNAMENT" },
      (response: any) => {
        setIsCancelling(false);
        if (response?.error) {
          toast({
            title: "Error",
            description: response.error,
            variant: "destructive",
          });
        } else {
          router.push(`/play/tournaments/${tournamentId}`);
        }
      }
    );
  };

  // Table content
  const tableContent = (
    <>
      {isInitializing || !gameState ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-white">
            {isInitializing ? "Joining as spectator..." : "Connecting..."}
          </div>
        </div>
      ) : (
        <div className="h-full w-full flex items-center justify-center">
          <PokerTable
            gameState={gameState}
            currentUserId="" // Empty string since spectators don't have a seat
            maxSeats={tableMaxSeats}
          />

          {/* Paused overlay */}
          {tournamentStatus === "paused" && (
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
      )}
    </>
  );

  // Sidebar content
  const sidebarContent = (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-purple-400" />
            <h3 className="font-bold text-sm text-white">Spectating</h3>
          </div>
          <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px]">
            Table {tableIndex}
          </Badge>
        </div>
      </div>

      <Separator className="bg-slate-800" />

      {/* Tournament Info */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Trophy className="h-3 w-3 text-amber-400" />
          <p className="text-sm text-white truncate">
            {tournamentName || "Tournament"}
          </p>
        </div>
      </div>

      {/* Level Warning Banner */}
      {showLevelWarning && levelWarningSeconds > 0 && (
        <div className="bg-amber-500/20 border border-amber-500/50 rounded-lg p-2 flex items-center gap-2 animate-pulse">
          <AlertTriangle className="h-3 w-3 text-amber-400 flex-shrink-0" />
          <span className="text-amber-200 text-xs font-medium">
            Blinds increase in {levelWarningSeconds}s!
          </span>
        </div>
      )}

      <Separator className="bg-slate-800" />

      {/* Quick Stats */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Status</span>
          <StatusBadge status={tournamentStatus} />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Level</span>
          <span className="font-mono text-white">
            {currentBlindLevel + 1} ({currentBlinds.small}/{currentBlinds.big})
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Players</span>
          <span className="text-white">{playersRemaining}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Tables</span>
          <span className="text-white">{tablesRemaining}</span>
        </div>
        {levelEndsAt && tournamentStatus === "active" && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Level Ends</span>
            <CountdownTimer targetTime={levelEndsAt} />
          </div>
        )}
        {nextBlinds && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Next Blinds</span>
            <span className="text-slate-300">
              {nextBlinds.small}/{nextBlinds.big}
            </span>
          </div>
        )}
      </div>

      {/* Host controls */}
      {isHost && (
        <>
          <Separator className="bg-slate-800" />
          <div className="space-y-2">
            <p className="text-xs text-slate-400 font-medium">Host Controls</p>
            <div className="flex gap-2">
              <Button
                onClick={handlePauseResume}
                disabled={isPausing}
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
              >
                {isPausing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : tournamentStatus === "paused" ? (
                  <Play className="h-3 w-3" />
                ) : (
                  <Pause className="h-3 w-3" />
                )}
              </Button>
              <Button
                onClick={handleCancel}
                disabled={isCancelling}
                variant="destructive"
                size="sm"
                className="text-xs px-3"
              >
                {isCancelling ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Square className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        </>
      )}

      <Separator className="bg-slate-800" />

      {/* Back link */}
      <Link
        href={`/play/tournaments/${tournamentId}`}
        className="inline-flex items-center text-xs text-slate-500 hover:text-white"
      >
        <ArrowLeft className="h-3 w-3 mr-1" /> Back to Tournament
      </Link>
    </div>
  );

  return (
    <PlayLayout
      title="Spectating"
      tableContent={tableContent}
      footer={
        <Button
          onClick={() => router.push(`/play/tournaments/${tournamentId}`)}
          variant="outline"
          size="lg"
          className="w-full font-bold text-sm h-12"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Tables
        </Button>
      }
    >
      {sidebarContent}
    </PlayLayout>
  );
}
