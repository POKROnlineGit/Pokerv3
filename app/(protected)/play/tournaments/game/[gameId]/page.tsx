"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { PokerTable } from "@/components/features/game/PokerTable";
import { ActionPopup } from "@/components/features/game/ActionPopup";
import { HandRankingsSidebar } from "@/components/features/game/HandRankingsSidebar";
import { PlayLayout } from "@/components/layout/PlayLayout";
import { GameState, ActionType, Player } from "@/lib/types/poker";
import { getClientHandStrength } from "@backend/domain/evaluation/ClientHandEvaluator";
import { getSocket } from "@/lib/api/socket/client";
import { createClientComponentClient } from "@/lib/api/supabase/client";
import { useToast } from "@/lib/hooks";
import { useStatus } from "@/components/providers/StatusProvider";
import { normalizeGameState } from "@/lib/api/socket/utils/normalizers";
import type { GameStateEvent } from "@/lib/api/socket/types/game";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TournamentStateResponse,
  TournamentStatusType,
  TournamentBlindLevelAdvancedEvent,
  TournamentLevelWarningEvent,
  TournamentPlayerEliminatedEvent,
  BlindLevel,
  normalizeTournament,
  normalizeParticipant,
  TournamentStatusInfo,
} from "@/lib/types/tournament";
import {
  Users,
  Clock,
  TrendingUp,
  Table2,
  Trophy,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

// Tournament HUD Component
function TournamentHUD({
  tournamentName,
  playersRemaining,
  tablesRemaining,
  currentBlinds,
  nextBlinds,
  levelEndsAt,
  currentLevel,
  showLevelWarning,
  levelWarningSeconds,
}: {
  tournamentName?: string;
  playersRemaining: number;
  tablesRemaining: number;
  currentBlinds: { small: number; big: number };
  nextBlinds?: BlindLevel | null;
  levelEndsAt?: string | null;
  currentLevel: number;
  showLevelWarning: boolean;
  levelWarningSeconds?: number;
}) {
  const [countdown, setCountdown] = useState<string>("");

  // Countdown timer
  useEffect(() => {
    if (!levelEndsAt) {
      setCountdown("");
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const target = new Date(levelEndsAt).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setCountdown("0:00");
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setCountdown(`${minutes}:${seconds.toString().padStart(2, "0")}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [levelEndsAt]);

  return (
    <div className="space-y-3">
      {/* Tournament Name */}
      {tournamentName && (
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-white truncate">
            {tournamentName}
          </span>
        </div>
      )}

      {/* Level Warning Banner */}
      {showLevelWarning && levelWarningSeconds !== undefined && (
        <div className="bg-amber-500/20 border border-amber-500/50 rounded-lg p-2 flex items-center gap-2 animate-pulse">
          <AlertTriangle className="h-3 w-3 text-amber-400 flex-shrink-0" />
          <span className="text-amber-200 text-xs font-medium">
            Blinds increase in {levelWarningSeconds}s!
          </span>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Players Remaining */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-2">
            <div className="flex items-center gap-1.5">
              <Users className="h-3 w-3 text-slate-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400 truncate">Players</p>
                <p className="text-sm font-bold">{playersRemaining}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tables Remaining */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-2">
            <div className="flex items-center gap-1.5">
              <Table2 className="h-3 w-3 text-slate-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400 truncate">Tables</p>
                <p className="text-sm font-bold">{tablesRemaining}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Blinds Info */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-400">
                Level {currentLevel}
              </p>
              <p className="text-base font-bold text-white">
                {currentBlinds.small}/{currentBlinds.big}
              </p>
            </div>
            {countdown && (
              <div className="text-right">
                <p className="text-[10px] text-slate-400">Increases in</p>
                <p className="text-sm font-mono font-bold text-amber-400">
                  {countdown}
                </p>
              </div>
            )}
          </div>
          {nextBlinds && (
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <TrendingUp className="h-3 w-3" />
              <span>Next: {nextBlinds.small}/{nextBlinds.big}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Back to Tournament Link */}
      <Link
        href={`/play/tournaments`}
        className="inline-flex items-center text-sm text-slate-500 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Tournament Lobby
      </Link>
    </div>
  );
}

export default function TournamentGamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  // Game state
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isHeadsUp, setIsHeadsUp] = useState(false);
  const [playerDisconnectTimers, setPlayerDisconnectTimers] = useState<
    Record<string, number>
  >({});
  const [turnTimer, setTurnTimer] = useState<{
    deadline: number;
    duration: number;
    activeSeat: number;
  } | null>(null);
  const [showHandRankings, setShowHandRankings] = useState(false);

  // Tournament state
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [tournamentInfo, setTournamentInfo] =
    useState<TournamentStateResponse | null>(null);
  const [showLevelWarning, setShowLevelWarning] = useState(false);
  const [levelWarningSeconds, setLevelWarningSeconds] = useState<number>(0);

  // Refs
  const joinRetryCountRef = useRef<number>(0);
  const joinRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tournamentJoinedRef = useRef<boolean>(false);
  const previousGameStateRef = useRef<GameState | null>(null);

  const supabase = createClientComponentClient();
  const { toast } = useToast();
  const { setStatus, clearStatus } = useStatus();

  // Calculate current hand strength
  const currentHandStrength = useMemo(() => {
    if (!gameState || !currentUserId) return null;
    const heroPlayer = gameState.players.find(
      (p: Player) => p.id === currentUserId
    );
    if (
      !heroPlayer ||
      !heroPlayer.holeCards ||
      heroPlayer.holeCards.length < 2
    ) {
      return null;
    }

    const holeCards = heroPlayer.holeCards.filter(
      (c: string | "HIDDEN" | null): c is string => c !== null && c !== "HIDDEN"
    );
    const communityCards = (gameState.communityCards || []).filter(
      (c: string | "HIDDEN" | null): c is string => c !== null && c !== "HIDDEN"
    );

    if (holeCards.length < 2) {
      return null;
    }

    try {
      return getClientHandStrength(holeCards, communityCards);
    } catch (error) {
      console.error("Error calculating hand strength:", error);
      return null;
    }
  }, [gameState?.players, gameState?.communityCards, currentUserId]);

  // Derived tournament values (normalized)
  const normalizedTournamentData = useMemo(() => {
    if (!tournamentInfo?.tournament) return null;
    return normalizeTournament(tournamentInfo.tournament);
  }, [tournamentInfo?.tournament]);

  const blindStructure = normalizedTournamentData?.blindStructureTemplate || [];

  const currentBlindLevel = useMemo(() => {
    if (typeof tournamentInfo?.status === "object") {
      return (tournamentInfo.status as TournamentStatusInfo).currentBlindLevel ?? 0;
    }
    return normalizedTournamentData?.currentBlindLevel ?? 0;
  }, [tournamentInfo?.status, normalizedTournamentData]);

  const levelEndsAt = useMemo(() => {
    if (typeof tournamentInfo?.status === "object") {
      return (tournamentInfo.status as TournamentStatusInfo).levelEndsAt;
    }
    return normalizedTournamentData?.levelEndsAt;
  }, [tournamentInfo?.status, normalizedTournamentData]);

  const nextBlinds: BlindLevel | null =
    blindStructure[currentBlindLevel + 1] || null;

  const playersRemaining = useMemo(() => {
    if (typeof tournamentInfo?.status === "object") {
      return (tournamentInfo.status as TournamentStatusInfo).totalPlayers ?? 0;
    }
    if (!tournamentInfo?.participants) return 0;
    const normalizedParticipants = tournamentInfo.participants.map((p) => normalizeParticipant(p));
    return normalizedParticipants.filter(
      (p) => p.status === "active" || p.status === "registered"
    ).length;
  }, [tournamentInfo?.status, tournamentInfo?.participants]);

  const tablesRemaining = useMemo(() => {
    if (typeof tournamentInfo?.status === "object") {
      return (tournamentInfo.status as TournamentStatusInfo).tableCount ?? 0;
    }
    return tournamentInfo?.tables?.length ?? 0;
  }, [tournamentInfo?.status, tournamentInfo?.tables]);

  const tournamentName = normalizedTournamentData?.title;

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUserId(data.user.id);
      }
    });
  }, [supabase]);

  // Connect to game socket
  useEffect(() => {
    if (!currentUserId) return;

    let mounted = true;
    const socket = getSocket();

    const connectAndJoin = () => {
      if (!socket.connected) {
        socket.connect();
      }

      const onConnect = () => {
        if (mounted) {
          joinRetryCountRef.current = 0;
          socket.emit("joinGame", { gameId }, (response: any) => {
            if (response?.error) {
              console.error("[TournamentGame] Join error:", response.error);
              toast({
                title: "Error Joining Game",
                description: response.error,
                variant: "destructive",
              });
            }
          });
          setIsSyncing(true);
        }
      };

      if (socket.connected) {
        onConnect();
      } else {
        socket.once("connect", onConnect);
      }
    };

    // Handle game state
    const handleGameState = (serverState: GameStateEvent) => {
      if (!mounted) return;

      setIsInitializing(false);
      setIsSyncing(false);

      // Normalize the game state (including pots)
      const normalizedState = normalizeGameState(serverState, {
        gameId,
        previousState: previousGameStateRef.current,
        defaultConfig: undefined,
      });

      // Update previous state ref for next normalization
      previousGameStateRef.current = normalizedState;

      // Clear turn timer if needed
      setTurnTimer((prevTimer) => {
        if (!prevTimer) return null;
        if (
          normalizedState.currentActorSeat === null ||
          normalizedState.currentActorSeat === undefined
        ) {
          return null;
        }
        if (normalizedState.currentActorSeat !== prevTimer.activeSeat) {
          return null;
        }
        return prevTimer;
      });

      // Check if this is a tournament game
      const tId = normalizedState.tournamentId;
      if (tId && !tournamentJoinedRef.current) {
        setTournamentId(tId);
        // Fetch tournament state
        socket.emit(
          "get_tournament_state",
          { tournamentId: tId },
          (response: any) => {
            if (response && !response.error) {
              setTournamentInfo(response);
            }
          }
        );
        // Join tournament room for updates
        socket.emit("join_tournament_room", { tournamentId: tId });
        tournamentJoinedRef.current = true;
      }

      // Detect heads-up mode from game config (not player count)
      setIsHeadsUp(normalizedState.config?.maxPlayers === 2);

      setGameState(normalizedState);
    };

    // Handle turn timer
    const handleTurnTimerStarted = (data: {
      deadline: number;
      duration: number;
      activeSeat: number;
    }) => {
      if (mounted) {
        setTurnTimer(data);
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
        setIsSyncing(true);
        socket.emit("joinGame", { gameId });
      }
    };

    // Tournament events
    const handleTournamentState = (state: TournamentStateResponse & { tournamentId?: string }) => {
      if (mounted && tournamentId && state.tournamentId === tournamentId) {
        setTournamentInfo(state);
      }
    };

    const handleBlindLevelAdvanced = (data: TournamentBlindLevelAdvancedEvent) => {
      if (mounted && tournamentId && data.tournamentId === tournamentId) {
        setTournamentInfo((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            status:
              typeof prev.status === "object"
                ? {
                    ...(prev.status as TournamentStatusInfo),
                    currentBlindLevel: data.level,
                    levelEndsAt: data.levelEndsAt,
                  }
                : prev.status,
            tournament: {
              ...prev.tournament,
              // Update both snake_case and camelCase to ensure normalization picks it up
              current_blind_level: data.level,
              level_ends_at: data.levelEndsAt,
            },
          };
        });
      }
    };

    const handleLevelWarning = (data: TournamentLevelWarningEvent) => {
      if (mounted && tournamentId && data.tournamentId === tournamentId) {
        const seconds = Math.floor(data.timeRemainingMs / 1000);
        setLevelWarningSeconds(seconds);
        setShowLevelWarning(true);
        // Auto-hide after 5 seconds
        setTimeout(() => setShowLevelWarning(false), 5000);
      }
    };

    const handlePlayerEliminated = (data: TournamentPlayerEliminatedEvent) => {
      if (mounted && tournamentId && data.tournamentId === tournamentId) {
        // Refetch tournament state
        socket.emit(
          "get_tournament_state",
          { tournamentId },
          (response: any) => {
            if (response && !response.error) {
              setTournamentInfo(response);
            }
          }
        );

        // Check if current user was eliminated
        if (data.playerId === currentUserId) {
          toast({
            title: "Eliminated",
            description: `You finished in position #${data.finishPosition}`,
            variant: "destructive",
          });
        }
      }
    };

    // Handle socket errors
    const handleSocketError = (error: { error?: string; message?: string }) => {
      if (!mounted) return;

      const errorMessage = error.error || error.message || "An error occurred";
      console.error("[TournamentGame] Socket error:", errorMessage);

      if (errorMessage.includes("Game not found") || errorMessage.includes("Tournament not found")) {
        // Retry logic similar to standard game page
        const maxRetries = 3;
        const retryDelay = 500;

        if (joinRetryCountRef.current < maxRetries) {
          joinRetryCountRef.current += 1;
          setTimeout(() => {
            if (!mounted) return;
            socket.emit("joinGame", { gameId });
          }, retryDelay);
        } else {
          // All retries exhausted
          joinRetryCountRef.current = 0;
          mounted = false;
          toast({
            title: "Game Not Found",
            description: "This tournament game no longer exists.",
            variant: "destructive",
          });
          setTimeout(() => {
            router.replace("/play");
          }, 1500);
        }
      } else if (errorMessage.includes("Not a player in this game")) {
        toast({
          title: "Access Denied",
          description: "You are not a player in this tournament game.",
          variant: "destructive",
        });
        mounted = false;
        setTimeout(() => {
          router.replace("/play");
        }, 1500);
      }
    };

    // Register event listeners
    socket.on("gameState", handleGameState);
    socket.on("turn_timer_started", handleTurnTimerStarted);
    socket.on("disconnect", handleDisconnect);
    socket.on("reconnect", handleReconnect);
    socket.on("connect", handleReconnect);
    socket.on("tournamentState", handleTournamentState);
    socket.on("TOURNAMENT_BLIND_LEVEL_ADVANCED", handleBlindLevelAdvanced);
    socket.on("TOURNAMENT_LEVEL_WARNING", handleLevelWarning);
    socket.on("TOURNAMENT_PLAYER_ELIMINATED", handlePlayerEliminated);
    socket.on("error", handleSocketError);

    connectAndJoin();

    return () => {
      mounted = false;
      socket.off("gameState", handleGameState);
      socket.off("turn_timer_started", handleTurnTimerStarted);
      socket.off("disconnect", handleDisconnect);
      socket.off("reconnect", handleReconnect);
      socket.off("connect", handleReconnect);
      socket.off("tournamentState", handleTournamentState);
      socket.off("TOURNAMENT_BLIND_LEVEL_ADVANCED", handleBlindLevelAdvanced);
      socket.off("TOURNAMENT_LEVEL_WARNING", handleLevelWarning);
      socket.off("TOURNAMENT_PLAYER_ELIMINATED", handlePlayerEliminated);
      socket.off("error", handleSocketError);

      // Leave tournament room
      if (tournamentId) {
        socket.emit("leave_tournament_room", { tournamentId });
      }
    };
  }, [currentUserId, gameId, tournamentId, toast]);

  // Status management
  useEffect(() => {
    if (isDisconnected) {
      setStatus({
        id: "game-disconnect",
        priority: 100,
        type: "error",
        title: "Connection Lost",
        message: "Reconnecting...",
      });
    } else {
      clearStatus("game-disconnect");
    }
  }, [isDisconnected, setStatus, clearStatus]);

  // Handle action
  const handleAction = (
    action: ActionType,
    amount?: number,
    isAllInCall?: boolean
  ) => {
    if (!gameState || !currentUserId) return;

    const socket = getSocket();
    const player = gameState.players.find((p) => p.id === currentUserId);

    if (!player) return;

    const payload = {
      gameId,
      type: action,
      amount,
      seat: player.seat,
      isAllInCall,
    };

    socket.emit("action", payload);
  };

  const handleRevealCard = (cardIndex: number) => {
    if (!gameState || !currentUserId) return;
    if (gameState.currentPhase !== "showdown") return;

    const socket = getSocket();
    const player = gameState.players.find((p) => p.id === currentUserId);

    if (!player) return;

    socket.emit("action", {
      gameId,
      type: "reveal",
      index: cardIndex,
      seat: player.seat,
    });
  };

  // Table content
  const tableContent = (
    <>
      {isInitializing || !gameState || !currentUserId ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-white">
            {isInitializing
              ? "Joining tournament table..."
              : !currentUserId
              ? "Authenticating..."
              : "Connecting to game..."}
          </div>
        </div>
      ) : (
        <>
          <div className="h-full w-full flex items-center justify-center">
            <PokerTable
              gameState={gameState}
              currentUserId={currentUserId}
              onRevealCard={handleRevealCard}
              isLocalGame={false}
              isHeadsUp={isHeadsUp}
              playerDisconnectTimers={playerDisconnectTimers}
              turnTimer={turnTimer}
              isSyncing={isSyncing}
            />
          </div>

          <HandRankingsSidebar
            isVisible={showHandRankings}
            isHoldem={true}
            currentHandStrength={currentHandStrength}
          />
        </>
      )}
    </>
  );

  // Action popup
  const actionPopupContent = (
    <ActionPopup
      gameState={gameState}
      currentUserId={currentUserId}
      onAction={handleAction}
      onRevealCard={handleRevealCard}
      isLocalGame={false}
    />
  );

  // Sidebar content - Tournament HUD
  const sidebarContent = (
    <TournamentHUD
      tournamentName={tournamentName}
      playersRemaining={playersRemaining}
      tablesRemaining={tablesRemaining}
      currentBlinds={{
        small: gameState?.smallBlind ?? blindStructure[currentBlindLevel]?.small ?? 0,
        big: gameState?.bigBlind ?? blindStructure[currentBlindLevel]?.big ?? 0,
      }}
      nextBlinds={nextBlinds}
      levelEndsAt={levelEndsAt}
      currentLevel={currentBlindLevel + 1}
      showLevelWarning={showLevelWarning}
      levelWarningSeconds={levelWarningSeconds}
    />
  );

  return (
    <PlayLayout
      title="Tournament"
      tableContent={tableContent}
      actionPopup={actionPopupContent}
    >
      {sidebarContent}
    </PlayLayout>
  );
}
