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
  TournamentPlayerBannedEvent,
  TournamentPlayerLeftEvent,
  BlindLevel,
  normalizeParticipant,
  normalizeTournament,
  NormalizedParticipant,
} from "@/lib/types/tournament";
import { useToast } from "@/lib/hooks";
import { createClientComponentClient } from "@/lib/api/supabase/client";
import { TournamentRegistrationContent } from "@/components/features/tournament/TournamentRegistrationContent";
import { TournamentOverview } from "@/components/features/tournament/TournamentOverview";
import { TournamentTableList } from "@/components/features/tournament/TournamentTableList";
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
  Settings,
  Save,
  Plus,
  Ban,
  LogOut,
  Copy,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
    updateTournamentSettings,
    banPlayer,
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
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  const [isBanning, setIsBanning] = useState<string | null>(null); // Tracks which player is being banned
  const [isLeaving, setIsLeaving] = useState(false);
  const hasCheckedRef = useRef(false);

  // Spectator loading state (for button)
  const [isSpectatingLoading, setIsSpectatingLoading] = useState<string | null>(null);

  // Settings form state (for registration phase)
  const [settingsForm, setSettingsForm] = useState<{
    maxPlayersPerTable: string;
    startingStack: string;
    blindLevelDurationMinutes: string;
    blindStructure: BlindLevel[];
  }>({
    maxPlayersPerTable: "9",
    startingStack: "10000",
    blindLevelDurationMinutes: "10",
    blindStructure: [],
  });

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUserId(data.user.id);
      }
    });
  }, [supabase]);

  // Initialize settings form from tournament data (for registration phase)
  useEffect(() => {
    if (!tournamentData) return;

    const tournament = tournamentData.tournament;
    const normalized = normalizeTournament(tournament);
    const currentStatus: TournamentStatusType =
      typeof tournamentData.status === "string"
        ? (tournamentData.status as TournamentStatusType)
        : normalized.status;

    if (currentStatus === "registration") {
      setSettingsForm({
        maxPlayersPerTable: normalized.maxPlayersPerTable?.toString() || "9",
        startingStack: normalized.startingStack?.toString() || "10000",
        blindLevelDurationMinutes: normalized.blindLevelDurationMinutes?.toString() || "10",
        blindStructure: normalized.blindStructureTemplate.length > 0
          ? normalized.blindStructureTemplate
          : [{ small: 10, big: 20 }, { small: 20, big: 40 }, { small: 50, big: 100 }],
      });
    }
  }, [tournamentData]);

  // Handle tournament started - join assigned table
  const handleTournamentStarted = useCallback(async (startedTournamentId: string) => {
    if (startedTournamentId !== tournamentId || !currentUserId) return;

    // Get state to find table assignment
    const state = await getTournamentState(tournamentId);
    if ("error" in state) {
      console.error("[Tournament] Failed to get state after start:", state.error);
      return;
    }

    // Find current user's participant data (normalize to handle both naming formats)
    const normalizedParticipants = state.participants.map((p) => normalizeParticipant(p));
    const myParticipant = normalizedParticipants.find(
      (p) => p.odanUserId === currentUserId
    );

    if (myParticipant && myParticipant.currentTableId) {
      // Join the table game
      const result = await joinTable(myParticipant.currentTableId);
      if ("error" in result) {
        toast({
          title: "Error Joining Table",
          description: result.error || "Failed to join tournament table",
          variant: "destructive",
        });
      } else {
        // Navigate to tournament game page
        router.push(`/play/tournaments/game/${myParticipant.currentTableId}`);
      }
    }
  }, [tournamentId, currentUserId, getTournamentState, joinTable, router, toast]);

  // Handle player transferred
  const handlePlayerTransferred = useCallback(async (data: TournamentPlayerTransferredEvent) => {
    if (data.playerId !== currentUserId) return;

    if (!data.targetTableId) {
      console.error("[Tournament] No target table ID in transfer event");
      return;
    }

    toast({
      title: "Table Transfer",
      description: "You're being moved to a new table...",
      variant: "default",
    });

    const result = await joinTable(data.targetTableId);
    if ("error" in result) {
      toast({
        title: "Error Joining Table",
        description: result.error || "Failed to join new table",
        variant: "destructive",
      });
    } else {
      router.push(`/play/tournaments/game/${data.targetTableId}`);
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

  // Handle player banned
  const handlePlayerBanned = useCallback(async (data: TournamentPlayerBannedEvent) => {
    if (data.playerId === currentUserId) {
      toast({
        title: "Banned",
        description: data.reason || "You have been banned from this tournament",
        variant: "destructive",
      });
      router.replace("/play/tournaments");
    } else {
      // Another player was banned - refresh state
      const updated = await getTournamentState(tournamentId);
      if (!("error" in updated)) {
        setTournamentData(updated as TournamentStateResponse);
      }
    }
  }, [currentUserId, toast, router, tournamentId, getTournamentState]);

  // Handle player left
  const handlePlayerLeft = useCallback(async (data: TournamentPlayerLeftEvent) => {
    if (data.playerId === currentUserId) {
      toast({
        title: "Left Tournament",
        description: "You have left the tournament",
      });
      router.replace("/play/tournaments");
    } else {
      // Another player left - refresh state
      const updated = await getTournamentState(tournamentId);
      if (!("error" in updated)) {
        setTournamentData(updated as TournamentStateResponse);
      }
    }
  }, [currentUserId, toast, router, tournamentId, getTournamentState]);

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
    onPlayerBanned: handlePlayerBanned,
    onPlayerLeft: handlePlayerLeft,
  });


  // ============================================
  // SPECTATOR HANDLERS
  // ============================================

  const handleSpectate = useCallback((tableId: string) => {
    if (!tournamentId) return;
    setIsSpectatingLoading(tableId);
    // Navigate to the spectate page
    router.push(`/play/tournaments/${tournamentId}/spectate/${tableId}`);
  }, [tournamentId, router]);

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

        // Extract status using normalization
        const normalizedTournamentData = normalizeTournament(response.tournament);
        const status: TournamentStatusType =
          typeof response.status === "string"
            ? (response.status as TournamentStatusType)
            : normalizedTournamentData.status;
        const hostId = response.hostId || normalizedTournamentData.hostId;

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

  // Extract and normalize data from state
  const tournament = tournamentData.tournament;
  const normalizedTournament = normalizeTournament(tournament);
  const rawParticipants = tournamentData.participants || [];
  const normalizedParticipants: NormalizedParticipant[] = rawParticipants.map((p) =>
    normalizeParticipant(p)
  );
  const tables = tournamentData.tables || [];
  const hostId = tournamentData.hostId || normalizedTournament.hostId;
  const canRegister = tournamentData.canRegister ?? false;

  // Determine status (handle both string and object formats)
  const status: TournamentStatusType =
    typeof tournamentData.status === "string"
      ? (tournamentData.status as TournamentStatusType)
      : normalizedTournament.status;

  const isHost = currentUserId ? hostId === currentUserId : false;
  const isRegistered = currentUserId
    ? normalizedParticipants.some((p) => p.odanUserId === currentUserId)
    : false;

  // Get current blind level info
  const currentBlindLevel = normalizedTournament.currentBlindLevel;
  const blindStructure: BlindLevel[] = normalizedTournament.blindStructureTemplate;
  const currentBlinds = blindStructure[currentBlindLevel] || { small: 0, big: 0 };
  const nextBlinds = blindStructure[currentBlindLevel + 1];
  const levelEndsAt = normalizedTournament.levelEndsAt;

  // Find my participant data
  const myParticipant = currentUserId
    ? normalizedParticipants.find((p) => p.odanUserId === currentUserId)
    : null;
  const myTableId = myParticipant?.currentTableId;
  const isEliminated = myParticipant?.status === "eliminated";

  // Determine if user can spectate
  // Host can always spectate, eliminated players can spectate, active players cannot
  const canSpectate = isHost || isEliminated || !myTableId;

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
    if (normalizedParticipants.length < 2) {
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
      router.push(`/play/tournaments/game/${myTableId}`);
    }
  };

  const handleBanPlayer = async (playerId: string) => {
    if (!confirm("Are you sure you want to ban this player from the tournament?")) {
      return;
    }

    setIsBanning(playerId);
    try {
      const response = await banPlayer(tournamentId, playerId);
      if ("error" in response) {
        toast({
          title: "Error Banning Player",
          description: response.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Player Banned",
          description: "The player has been removed from the tournament",
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
        description: error.message || "Failed to ban player",
        variant: "destructive",
      });
    } finally {
      setIsBanning(null);
    }
  };

  const handleLeaveTournament = async () => {
    if (!confirm("Are you sure you want to leave this tournament?")) {
      return;
    }

    setIsLeaving(true);
    try {
      const response = await unregisterTournament(tournamentId);
      if ("error" in response) {
        toast({
          title: "Error Leaving Tournament",
          description: response.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Left Tournament",
          description: "You have left the tournament",
        });
        router.replace("/play/tournaments");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to leave tournament",
        variant: "destructive",
      });
    } finally {
      setIsLeaving(false);
    }
  };

  const handleUpdateSettings = async () => {
    // Validation
    if (
      !settingsForm.maxPlayersPerTable ||
      parseInt(settingsForm.maxPlayersPerTable) < 2 ||
      parseInt(settingsForm.maxPlayersPerTable) > 10
    ) {
      toast({
        title: "Validation Error",
        description: "Players per table must be between 2 and 10",
        variant: "destructive",
      });
      return;
    }

    if (
      !settingsForm.startingStack ||
      parseInt(settingsForm.startingStack) <= 0
    ) {
      toast({
        title: "Validation Error",
        description: "Starting stack must be greater than 0",
        variant: "destructive",
      });
      return;
    }

    if (
      !settingsForm.blindLevelDurationMinutes ||
      parseInt(settingsForm.blindLevelDurationMinutes) <= 0
    ) {
      toast({
        title: "Validation Error",
        description: "Blind level duration must be greater than 0",
        variant: "destructive",
      });
      return;
    }

    if (settingsForm.blindStructure.length === 0) {
      toast({
        title: "Validation Error",
        description: "At least one blind level is required",
        variant: "destructive",
      });
      return;
    }

    // Validate blind structure
    for (let i = 0; i < settingsForm.blindStructure.length; i++) {
      const level = settingsForm.blindStructure[i];
      if (level.small <= 0 || level.big <= 0 || level.big <= level.small) {
        toast({
          title: "Validation Error",
          description: `Blind level ${i + 1}: Big blind must be greater than small blind, and both must be positive`,
          variant: "destructive",
        });
        return;
      }
    }

    setIsUpdatingSettings(true);

    try {
      // Build settings payload
      const settings: any = {
        maxPlayersPerTable: parseInt(settingsForm.maxPlayersPerTable),
        startingStack: parseInt(settingsForm.startingStack),
        blindLevelDurationMinutes: parseInt(
          settingsForm.blindLevelDurationMinutes
        ),
        blindStructureTemplate: settingsForm.blindStructure,
      };

      const response = await updateTournamentSettings(tournamentId, settings);

      if ("error" in response) {
        toast({
          title: "Error Updating Settings",
          description: response.error || "Failed to update tournament settings",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Settings Updated",
        description: "Tournament settings have been saved successfully",
        variant: "default",
      });

      // Refresh tournament data
      const updatedResponse = await getTournamentState(tournamentId);
      if (!("error" in updatedResponse)) {
        setTournamentData(updatedResponse as TournamentStateResponse);
      }
    } catch (error: any) {
      console.error("[Tournament] Failed to update settings:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update tournament settings",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  // Helper functions for blind structure
  const addBlindLevel = () => {
    const lastLevel =
      settingsForm.blindStructure[settingsForm.blindStructure.length - 1];
    const newSmall = lastLevel ? lastLevel.big : 10;
    const newBig = lastLevel ? lastLevel.big * 2 : 20;
    setSettingsForm({
      ...settingsForm,
      blindStructure: [
        ...settingsForm.blindStructure,
        { small: newSmall, big: newBig },
      ],
    });
  };

  const removeBlindLevel = (index: number) => {
    if (settingsForm.blindStructure.length > 1) {
      setSettingsForm({
        ...settingsForm,
        blindStructure: settingsForm.blindStructure.filter(
          (_, i) => i !== index
        ),
      });
    }
  };

  const updateBlindLevel = (
    index: number,
    type: "small" | "big",
    value: number
  ) => {
    const updated = [...settingsForm.blindStructure];
    updated[index] = { ...updated[index], [type]: value };
    setSettingsForm({ ...settingsForm, blindStructure: updated });
  };

  // ============================================
  // RENDER
  // ============================================

  // Registration phase: use tableContent for main area, minimal sidebar
  if (status === "registration") {
    return (
      <PlayLayout
        title={normalizedTournament.title || "Tournament"}
        tableContent={
          <TournamentRegistrationContent
            tournament={tournament}
            participants={rawParticipants}
            isHost={isHost}
            isRegistered={isRegistered}
            currentUserId={currentUserId}
            participantCount={participantCount}
            canRegister={canRegister}
            onBanPlayer={handleBanPlayer}
            isBanning={isBanning}
          />
        }
        footer={
          <div className="flex flex-col gap-2 w-full">
            {/* Player registration actions */}
            {!isHost && (
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

            {/* Host buttons - Start and End side by side */}
            {isHost && (
              <div className="flex gap-2">
                <Button
                  onClick={handleStart}
                  disabled={isStarting || normalizedParticipants.length < 2}
                  size="lg"
                  className="flex-1 font-bold text-sm h-12"
                >
                  {isStarting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  Start
                </Button>
                <Button
                  onClick={handleCancel}
                  disabled={isCancelling}
                  size="lg"
                  variant="destructive"
                  className="flex-1 font-bold text-sm h-12"
                >
                  {isCancelling ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="mr-2 h-4 w-4" />
                  )}
                  End
                </Button>
              </div>
            )}
          </div>
        }
      >
        {/* Sidebar content styled like private game host */}
        <div className="space-y-6">
          {/* Header Info */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-white">Tournament Lobby</h3>
              {isHost && (
                <Badge
                  variant="secondary"
                  className="text-xs bg-amber-500/10 text-amber-500 border-amber-500/20"
                >
                  HOST
                </Badge>
              )}
            </div>

            {/* Back link */}
            <Link
              href="/play/tournaments"
              className="inline-flex items-center text-xs text-slate-500 hover:text-white"
            >
              <ArrowLeft className="h-3 w-3 mr-1" /> Back to Tournaments
            </Link>
          </div>

          <Separator className="bg-slate-800" />

          {/* Status indicators */}
          {isRegistered && !isHost && (
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2">
              <Check className="h-3 w-3 text-emerald-400 flex-shrink-0" />
              <p className="text-emerald-400 text-xs font-medium truncate">
                You are registered
              </p>
            </div>
          )}

          {isHost && normalizedParticipants.length < 2 && (
            <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-amber-400 text-xs">
                Need at least 2 players to start
              </p>
            </div>
          )}

          {/* Accordion sections (Host view) */}
          {isHost ? (
            <Accordion
              type="single"
              collapsible
              defaultValue="settings"
              className="w-full"
            >
              {/* Tournament Settings */}
              <AccordionItem value="settings" className="border-slate-800">
                <AccordionTrigger className="text-sm">
                  Tournament Settings
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2">
                  {/* Players Per Table */}
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Players Per Table</Label>
                    <Input
                      type="number"
                      value={settingsForm.maxPlayersPerTable}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          maxPlayersPerTable: e.target.value,
                        })
                      }
                      className="bg-slate-900 border-slate-800 h-7 text-xs"
                      min="2"
                      max="10"
                    />
                  </div>

                  {/* Starting Stack */}
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Starting Stack</Label>
                    <Input
                      type="number"
                      value={settingsForm.startingStack}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          startingStack: e.target.value,
                        })
                      }
                      className="bg-slate-900 border-slate-800 h-7 text-xs"
                      min="1"
                    />
                  </div>

                  {/* Level Duration */}
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-400">Level Duration (minutes)</Label>
                    <Input
                      type="number"
                      value={settingsForm.blindLevelDurationMinutes}
                      onChange={(e) =>
                        setSettingsForm({
                          ...settingsForm,
                          blindLevelDurationMinutes: e.target.value,
                        })
                      }
                      className="bg-slate-900 border-slate-800 h-7 text-xs"
                      min="1"
                    />
                  </div>

                  {/* Blind Structure */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-slate-400">Blind Structure</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={addBlindLevel}
                        className="h-5 px-2 text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {settingsForm.blindStructure.map((level, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-1 bg-slate-900/50 p-1 rounded"
                        >
                          <Input
                            type="number"
                            value={level.small}
                            onChange={(e) =>
                              updateBlindLevel(
                                index,
                                "small",
                                parseInt(e.target.value) || 0
                              )
                            }
                            className="bg-slate-800 border-slate-700 h-6 text-xs flex-1"
                            min="1"
                            placeholder="SB"
                          />
                          <span className="text-xs text-slate-500">/</span>
                          <Input
                            type="number"
                            value={level.big}
                            onChange={(e) =>
                              updateBlindLevel(
                                index,
                                "big",
                                parseInt(e.target.value) || 0
                              )
                            }
                            className="bg-slate-800 border-slate-700 h-6 text-xs flex-1"
                            min="1"
                            placeholder="BB"
                          />
                          {settingsForm.blindStructure.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeBlindLevel(index)}
                              className="h-6 w-6 p-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Save Settings Button inside accordion */}
                  <Button
                    onClick={handleUpdateSettings}
                    disabled={isUpdatingSettings}
                    className="w-full"
                    size="sm"
                  >
                    {isUpdatingSettings ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save Settings
                  </Button>
                </AccordionContent>
              </AccordionItem>

              {/* Participants Overview */}
              <AccordionItem value="participants" className="border-slate-800">
                <AccordionTrigger className="text-sm">
                  Participants
                  {normalizedParticipants.length > 0 && (
                    <Badge className="ml-2 bg-emerald-500">
                      {participantCount !== null ? participantCount : normalizedParticipants.length}
                    </Badge>
                  )}
                </AccordionTrigger>
                <AccordionContent>
                  <div className="text-xs text-slate-400 py-2">
                    {participantCount !== null ? participantCount : normalizedParticipants.length}
                    {normalizedTournament.maxPlayers && ` / ${normalizedTournament.maxPlayers}`} players registered
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          ) : (
            /* Non-host view - simple info */
            <div className="space-y-3">
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-slate-400 truncate">Players</p>
                      <p className="text-lg font-bold truncate">
                        {participantCount !== null ? participantCount : normalizedParticipants.length}
                        {normalizedTournament.maxPlayers && (
                          <span className="text-slate-500 text-xs font-normal">
                            /{normalizedTournament.maxPlayers}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </PlayLayout>
    );
  }

  // ============================================
  // ACTIVE/PAUSED TOURNAMENT WITH SPECTATOR SYSTEM
  // ============================================

  if (status === "active" || status === "paused") {
    // Tournament overview with table list
    return (
      <PlayLayout
        title={normalizedTournament.title || "Tournament"}
        tableContent={
          <div className="w-full h-full overflow-auto p-4">
            <TournamentOverview
              tournament={tournament}
              participants={rawParticipants}
              status={status}
              isHost={isHost}
              currentUserId={currentUserId}
              currentBlindLevel={currentBlindLevel}
              levelEndsAt={levelEndsAt ?? null}
              onPauseResume={handlePauseResume}
              onCancel={handleCancel}
              onBanPlayer={handleBanPlayer}
              isPausing={isPausing}
              isCancelling={isCancelling}
              isBanning={isBanning}
            />

            <div className="max-w-4xl mx-auto mt-4 px-4 md:px-6">
              <TournamentTableList
                tables={tables}
                currentUserId={currentUserId}
                myTableId={myTableId ?? null}
                canSpectate={canSpectate}
                onSpectate={handleSpectate}
                isSpectating={isSpectatingLoading}
              />
            </div>
          </div>
        }
        footer={
          <div className="flex flex-col gap-2 w-full">
            {/* Go to table button for active players */}
            {isRegistered && !isEliminated && myTableId && (
              <Button
                onClick={handleGoToTable}
                size="lg"
                className="w-full font-bold text-sm h-12"
              >
                <Table2 className="mr-2 h-4 w-4" />
                Go to My Table
              </Button>
            )}

            {/* Leave Tournament button for non-host players */}
            {!isHost && isRegistered && (
              <Button
                onClick={handleLeaveTournament}
                disabled={isLeaving}
                size="lg"
                variant="outline"
                className="w-full font-bold text-sm h-10 text-red-400 border-red-400/30 hover:bg-red-500/10"
              >
                {isLeaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="mr-2 h-4 w-4" />
                )}
                Leave Tournament
              </Button>
            )}
          </div>
        }
      >
        {/* Minimal Sidebar */}
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-white">Tournament</h3>
              {isHost && (
                <Badge
                  variant="secondary"
                  className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20"
                >
                  HOST
                </Badge>
              )}
            </div>
            <Link
              href="/play/tournaments"
              className="inline-flex items-center text-xs text-slate-500 hover:text-white"
            >
              <ArrowLeft className="h-3 w-3 mr-1" /> Back to Tournaments
            </Link>
          </div>

          <Separator className="bg-slate-800" />

          {/* Level Warning */}
          {showLevelWarning && (
            <LevelWarningBanner
              timeRemainingMs={showLevelWarning.timeRemainingMs}
              currentLevel={showLevelWarning.currentLevel}
            />
          )}

          {/* Quick Stats */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Status</span>
              <StatusBadge status={status} />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Level</span>
              <span className="font-mono text-white">
                {currentBlindLevel + 1} ({currentBlinds.small}/{currentBlinds.big})
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Players</span>
              <span className="text-white">
                {normalizedParticipants.filter((p) => p.status !== "eliminated").length} / {normalizedParticipants.length}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Tables</span>
              <span className="text-white">{tables.length}</span>
            </div>
            {levelEndsAt && status === "active" && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Level Ends</span>
                <CountdownTimer targetTime={levelEndsAt} label="" />
              </div>
            )}
          </div>

          {/* Eliminated status */}
          {isEliminated && (
            <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-xs font-medium">
                You have been eliminated
              </p>
              <p className="text-slate-500 text-[10px] mt-1">
                You can spectate any table
              </p>
            </div>
          )}
        </div>
      </PlayLayout>
    );
  }

  // ============================================
  // COMPLETED/CANCELLED/OTHER STATUSES
  // ============================================

  return (
    <PlayLayout
      title={normalizedTournament.title || "Tournament"}
      footer={
        <div className="flex flex-col gap-2 w-full">
          {/* Cancel button for setup status */}
          {isHost && status === "setup" && (
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

        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold truncate flex-1 min-w-0">
              {normalizedTournament.title || "Tournament"}
            </h1>
            <StatusBadge status={status} />
          </div>
          {normalizedTournament.description && (
            <p className="text-sm text-slate-400 line-clamp-2">{normalizedTournament.description}</p>
          )}
        </div>

        {/* Status banners */}
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

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 truncate">Participants</p>
                  <p className="text-lg font-bold truncate">
                    {participantCount !== null ? participantCount : normalizedParticipants.length}
                    {normalizedTournament.maxPlayers && (
                      <span className="text-slate-500 text-xs font-normal">
                        /{normalizedTournament.maxPlayers}
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

        {/* Cancelled message */}
        {status === "cancelled" && (
          <Card className="bg-red-500/10 border-red-500/30">
            <CardContent className="p-4 text-center">
              <X className="h-8 w-8 text-red-400 mx-auto mb-2" />
              <p className="text-red-400 font-medium">Tournament Cancelled</p>
              <p className="text-slate-500 text-sm mt-1">
                This tournament has been cancelled by the host.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </PlayLayout>
  );
}
