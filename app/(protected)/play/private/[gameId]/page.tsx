"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { PlayLayout } from "@/components/layout/PlayLayout";
import { PokerTable } from "@/components/features/game/PokerTable";
import { ActionPopup } from "@/components/features/game/ActionPopup";
import { LeaveGameButton } from "@/components/features/game/LeaveGameButton";
import { getSocket, useSocket } from "@/lib/api/socket/client";
import { createClientComponentClient } from "@/lib/api/supabase/client";
import { GameState } from "@/lib/types/poker";
import { useToast } from "@/lib/hooks";
import {
  Loader2,
  Play,
  Pause,
  UserPlus,
  UserMinus,
  Settings,
  Copy,
  Check,
  X,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTheme } from "@/components/providers/ThemeProvider";

export default function PrivateGamePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { currentTheme } = useTheme();
  const gameId = params.gameId as string;
  const socket = getSocket();
  const socketHook = useSocket();
  const supabase = createClientComponentClient();

  // Get theme colors for buttons
  const primaryColor = currentTheme.colors.primary[0];
  const primaryColorHover = currentTheme.colors.primary[1] || primaryColor;

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(true);
  const [turnTimer, setTurnTimer] = useState<{
    deadline: number;
    duration: number;
    activeSeat: number;
  } | null>(null);
  const wasPlayerRef = useRef<boolean>(false);
  const [wasRejected, setWasRejected] = useState<boolean>(false);

  // Private game layout state
  const [editStackSeat, setEditStackSeat] = useState<number | null>(null);
  const [newStackAmount, setNewStackAmount] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newSmallBlind, setNewSmallBlind] = useState("");
  const [newBigBlind, setNewBigBlind] = useState("");

  // Auth Check
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        const currentPath = window.location.pathname;
        const redirectUrl = `/signin?next=${encodeURIComponent(currentPath)}`;
        router.replace(redirectUrl);
      } else {
        setCurrentUserId(data.user.id);
      }
    });
  }, [router]);

  // Initialize wasPlayerRef on mount
  useEffect(() => {
    if (gameState && currentUserId) {
      wasPlayerRef.current = gameState.players.some(
        (p) => p.id === currentUserId
      );
    }
  }, [gameState, currentUserId]);

  // Socket Connection
  useEffect(() => {
    if (!currentUserId) return;

    if (!socket.connected) socket.connect();

    const onConnect = () => {
      socket.emit("joinGame", gameId);
    };

    const onGameState = (state: GameState) => {

      // Track transition from player to spectator (busted notification)
      if (currentUserId) {
        const wasPlayer = wasPlayerRef.current;
        const isNowPlayer = state.players.some((p) => p.id === currentUserId);
        const isNowSpectator = (state as any).isPrivate && !isNowPlayer;

        // If transitioned from player to spectator, show notification
        if (wasPlayer && isNowSpectator) {
          toast({
            title: "You ran out of chips",
            description: "You are now spectating. Request a seat to rejoin.",
            variant: "default",
          });
        }

        // Update ref for next check
        wasPlayerRef.current = isNowPlayer;
      }

      // Normalize pots from server format to UI format
      // Server sends: pots: [{ amount: 3, eligiblePlayers: [...] }]
      // UI expects: pot: number, sidePots: [{ amount: number, eligibleSeats: number[] }]
      let mainPot = 0;
      let sidePots: Array<{ amount: number; eligibleSeats: number[] }> = [];

      if ((state as any).pots && Array.isArray((state as any).pots)) {
        const potsArray = (state as any).pots;
        if (potsArray.length > 0) {
          mainPot = potsArray[0]?.amount || 0;
          // Convert eligiblePlayers (UUIDs) to eligibleSeats (seat numbers)
          sidePots = potsArray.slice(1).map((pot: any) => ({
            amount: pot?.amount || 0,
            eligibleSeats: (pot?.eligiblePlayers || [])
              .map((playerId: string) => {
                const player = state.players?.find(
                  (p: any) => p.id === playerId
                );
                return player?.seat || 0;
              })
              .filter((seat: number) => seat > 0),
          }));
        }
      } else {
        // Fallback: use pot and sidePots if they exist directly
        mainPot = typeof state.pot === "number" ? state.pot : 0;
        sidePots = Array.isArray(state.sidePots) ? state.sidePots : [];
      }

      // Clean up pendingRequests for players who are now seated
      const privateState = state as GameState & { pendingRequests?: any[] };
      let cleanedPendingRequests = privateState.pendingRequests || [];
      if (cleanedPendingRequests.length > 0) {
        const seatedPlayerIds = state.players.map((p) => p.id);
        cleanedPendingRequests = cleanedPendingRequests.filter((req: any) => {
          const requestUserId = req.id || req.playerId || req.userId;
          return !seatedPlayerIds.includes(requestUserId);
        });
      }

      // Normalize pendingRequests to ensure username field is present
      const normalizedPendingRequests = (cleanedPendingRequests || []).map(
        (req: any) => ({
          id: req.id || req.playerId || req.userId || "",
          username: req.username || "Unknown", // Backend sends it directly, not nested
          userId: req.userId || req.playerId || req.id,
          playerId: req.playerId || req.id || req.userId,
          chips: req.chips || 0,
          // Preserve other fields
          ...req,
        })
      );

      // Normalize players to ensure username field is present
      const normalizedPlayers = Array.isArray(state.players)
        ? state.players.map((p: any) => ({
            id: p.id || p.userId || p.user_id || "",
            username: p.username || `Player ${p.seat || ""}`,
            seat: p.seat || 0,
            chips: typeof p.chips === "number" ? p.chips : 0,
            currentBet: p.currentBet || 0,
            totalBet: p.totalBet ?? p.totalBetThisHand ?? 0,
            holeCards: Array.isArray(p.holeCards)
              ? p.holeCards.filter(
                  (c: any): c is string => typeof c === "string"
                )
              : [],
            folded: Boolean(p.folded),
            allIn: Boolean(p.allIn),
            isBot: Boolean(p.isBot),
            leaving: Boolean(p.leaving),
            playerHandType: p.playerHandType,
            revealedIndices: Array.isArray(p.revealedIndices)
              ? p.revealedIndices
              : [],
            disconnected: Boolean(p.disconnected),
            left: Boolean(p.left),
            isGhost: Boolean(p.isGhost),
            status: p.status,
          }))
        : [];

      // Create normalized state with pot/sidePots in UI format
      const normalizedState: GameState & { pendingRequests?: any[] } = {
        ...state,
        players: normalizedPlayers,
        pot: mainPot,
        sidePots: sidePots,
        pendingRequests: normalizedPendingRequests,
        // Explicitly ensure currentActorSeat is set (null is correct during showdown)
        currentActorSeat:
          typeof state.currentActorSeat === "number"
            ? state.currentActorSeat
            : null,
      };

      // Clear turn timer if game is paused (timers are not processed on backend when paused)
      const isPaused = (state as any).isPaused || false;
      if (isPaused) {
        setTurnTimer(null);
      } else {
        // Clear turn timer if action is no longer being awaited
        // When a new gameState arrives, it means the previous action has been processed
        // If there's an active timer, clear it unless the timer is still valid (same seat still acting)
        setTurnTimer((prevTimer) => {
          if (!prevTimer) return null; // No timer to clear

          // If currentActorSeat is null, no one is acting - clear timer
          if (
            state.currentActorSeat === null ||
            state.currentActorSeat === undefined
          ) {
            return null;
          }

          // If currentActorSeat changed to a different seat, clear the old timer
          if (state.currentActorSeat !== prevTimer.activeSeat) {
            return null;
          }

          // Timer is still valid (same seat still acting)
          return prevTimer;
        });
      }

      setGameState(normalizedState);
      setIsSyncing(false);
    };

    const onError = (err: any) => {
      // Handle specific error messages with user-friendly toasts
      if (err.message === "Not enough players") {
        toast({
          variant: "destructive",
          title: "Cannot Start Game",
          description:
            "You need at least 2 players to start a game. Invite more players or wait for others to join.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: err.message,
        });
      }
      if (err.message === "Game not found") router.push("/play");
    };

    const onTurnTimerStarted = (data: {
      deadline: number;
      duration: number;
      activeSeat: number;
    }) => {
      const now = Date.now();
      const timeUntilDeadline = data.deadline - now;

      // Validate deadline is not in the past
      if (timeUntilDeadline < 0) {
        console.error(
          "[PrivateGame] ⏱️ ERROR: Timer deadline is in the past!",
          {
            deadline: data.deadline,
            now,
            difference: timeUntilDeadline,
            deadlineDate: new Date(data.deadline).toISOString(),
            nowDate: new Date(now).toISOString(),
          }
        );
      }

      const timerData = {
        deadline: data.deadline,
        duration: data.duration,
        activeSeat: data.activeSeat,
      };

      setTurnTimer(timerData);
    };

    const onPlayerStatusUpdate = (payload: {
      gameId: string;
      playerId: string;
      status?:
        | "ACTIVE"
        | "WAITING_FOR_NEXT_HAND"
        | "DISCONNECTED"
        | "LEFT"
        | "REMOVED"
        | "ELIMINATED";
      message?: string;
      seat?: number;
      chips?: number;
    }) => {
      if (!currentUserId) return;

      // If this is the current user being seated
      if (payload.playerId === currentUserId) {
        if (
          payload.status === "ACTIVE" ||
          payload.status === "WAITING_FOR_NEXT_HAND"
        ) {
          setWasRejected(false); // Clear rejection state on approval
          toast({
            title: "Seat Approved",
            description:
              payload.message || "You have been seated and are ready to play.",
            variant: "default",
          });
        } else if (payload.message === "Request rejected") {
          setWasRejected(true);
          toast({
            title: "Request Rejected",
            description:
              "Your seat request was rejected. You can request again.",
            variant: "destructive",
          });
        } else if (payload.status === "REMOVED") {
          toast({
            title: "Removed from Game",
            description:
              payload.message || "You have been removed by the host.",
            variant: "destructive",
          });
        }
      }
    };

    const onPlayerMovedToSpectator = (payload: {
      gameId: string;
      playerId: string;
      playerName: string;
      seat: number;
      reason: string;
    }) => {
      if (!currentUserId) return;

      // If this is the current user being moved to spectator
      if (payload.playerId === currentUserId) {
        toast({
          title: "Moved to Spectator",
          description:
            payload.reason || "You have been moved to spectator mode.",
          variant: "default",
        });
      }
    };

    socket.on("connect", onConnect);
    socket.on("gameState", onGameState);
    socket.on("error", onError);
    socket.on("turn_timer_started", onTurnTimerStarted);
    socket.on("PLAYER_STATUS_UPDATE", onPlayerStatusUpdate);
    socket.on("PLAYER_MOVED_TO_SPECTATOR", onPlayerMovedToSpectator);

    // Initial join if already connected
    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("gameState", onGameState);
      socket.off("error", onError);
      socket.off("turn_timer_started", onTurnTimerStarted);
      socket.off("PLAYER_STATUS_UPDATE", onPlayerStatusUpdate);
      socket.off("PLAYER_MOVED_TO_SPECTATOR", onPlayerMovedToSpectator);
    };
  }, [gameId, currentUserId, socket]);

  if (isSyncing || !gameState || !currentUserId) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="h-12 w-12 text-emerald-500 animate-spin" />
        <p className="text-slate-400">Connecting to private lobby...</p>
      </div>
    );
  }

  const handleRevealCard = (cardIndex: number) => {
    if (!gameState || !currentUserId) return;

    // Only allow revealing during showdown
    if (gameState.currentPhase !== "showdown") {
      return;
    }

    const player = gameState.players.find((p) => p.id === currentUserId);

    if (!player) {
      console.error("[PrivateGame] ❌ Cannot reveal card - player not found");
      return;
    }

    // Emit reveal action
    socketHook.emit("action", {
      gameId,
      type: "reveal",
      index: cardIndex,
      seat: player.seat,
    });
  };

  // Prepare action popup separately to render outside stacking context
  const actionPopupContent = (
    <ActionPopup
      gameState={gameState}
      currentUserId={currentUserId}
      onAction={(type, amount, isAllInCall) =>
        socket.emit("action", { type, amount, isAllInCall })
      }
      onRevealCard={handleRevealCard}
    />
  );

  // Private game layout logic
  const privateGameState = gameState as GameState & {
    hostId?: string;
    isPaused?: boolean;
    pendingRequests?: any[];
  };
  const isHost = privateGameState.hostId === currentUserId;
  const isPaused = privateGameState.isPaused || false;
  const pendingRequests = privateGameState.pendingRequests || [];
  const isSeated = gameState.players.some((p) => p.id === currentUserId);
  const isSpectator = privateGameState.isPrivate && !isSeated;
  const isHostSpectator = isHost && isSpectator;
  const hasPendingRequest = pendingRequests.some(
    (r: any) =>
      r.id === currentUserId ||
      r.playerId === currentUserId ||
      r.userId === currentUserId
  );
  // Show request button if no pending request (or if rejected, allow requesting again)
  const showRequestButton = !hasPendingRequest;

  // Host Actions
  const handleAdminAction = (type: string, payload: any = {}) => {
    if (!socketHook.connected) return;
    socketHook.emit("admin_action", { gameId, type, ...payload });
  };

  const togglePause = () => {
    handleAdminAction(isPaused ? "ADMIN_RESUME" : "ADMIN_PAUSE");
  };

  const handleKick = (playerId: string) => {
    handleAdminAction("ADMIN_KICK", { playerId });
  };

  const handleApprove = (request: any) => {
    handleAdminAction("ADMIN_APPROVE", { request });
  };

  const handleReject = (userId: string) => {
    handleAdminAction("ADMIN_REJECT", { userId });
  };

  const handleUpdateStack = () => {
    if (editStackSeat === null) return;
    handleAdminAction("ADMIN_SET_STACK", {
      seat: editStackSeat,
      amount: parseInt(newStackAmount),
    });
    setEditStackSeat(null);
    setNewStackAmount("");
    setIsDialogOpen(false);
  };

  const handleUpdateBlinds = () => {
    const smallBlind = parseInt(newSmallBlind);
    const bigBlind = parseInt(newBigBlind);
    if (
      isNaN(smallBlind) ||
      isNaN(bigBlind) ||
      smallBlind <= 0 ||
      bigBlind <= 0
    ) {
      toast({
        variant: "destructive",
        title: "Invalid Blinds",
        description: "Please enter valid positive numbers.",
      });
      return;
    }
    if (bigBlind < smallBlind) {
      toast({
        variant: "destructive",
        title: "Invalid Blinds",
        description: "Big blind must be greater than or equal to small blind.",
      });
      return;
    }
    handleAdminAction("ADMIN_SET_BLINDS", { smallBlind, bigBlind });
    setNewSmallBlind("");
    setNewBigBlind("");
    toast({
      title: "Blinds Updated",
      description: `Blinds set to $${smallBlind}/$${bigBlind}`,
    });
  };

  const copyInviteLink = () => {
    const url = `${window.location.origin}/play/private/${gameId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied",
      description: "Share this link to invite players.",
    });
  };

  // Guest/Spectator Actions
  const requestSeat = () => {
    setWasRejected(false); // Clear rejection state when requesting again
    socketHook.emit("request_seat", { gameId });
    toast({
      title: "Request Sent",
      description: "Waiting for host approval...",
    });
  };

  const handleHostSit = () => {
    socketHook.emit("host_self_seat", {
      gameId,
      seatIndex: null, // Optional: specify seat, or null for auto-assign
    });
    toast({ title: "Sitting Down", description: "Joining the table..." });
  };

  // Prepare sidebar content
  const sidebarContent = (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg text-white">Private Lobby</h3>
          {isHost && (
            <Badge
              variant="secondary"
              className="text-xs bg-amber-500/10 text-amber-500 border-amber-500/20"
            >
              HOST
            </Badge>
          )}
        </div>
        
        {/* Join Code Display - for all players */}
        {gameState?.joinCode && (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs h-8"
            disabled
          >
            Game Code: {gameState.joinCode}
          </Button>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs h-8"
            onClick={copyInviteLink}
          >
            <Copy className="w-3 h-3 mr-2" /> Copy Invite Link
          </Button>
        </div>
      </div>

      <Separator className="bg-slate-800" />

      {/* HOST CONTROLS */}
      {isHost ? (
        <>
          {/* Host Spectator Rejoin Button */}
          {isHostSpectator && (
            <div className="mb-4">
              <Button
                className="w-full bg-amber-600 hover:bg-amber-700"
                onClick={handleHostSit}
              >
                <Play className="w-4 h-4 mr-2" /> Sit Down
              </Button>
            </div>
          )}

          <Accordion
            type="single"
            collapsible
            defaultValue="requests"
            className="w-full"
          >
            {/* 1. Table Settings */}
            <AccordionItem value="settings" className="border-slate-800">
              <AccordionTrigger className="text-sm">
                Table Settings
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-2">
                <div className="space-y-2">
                  <div className="text-xs text-slate-400 mb-2">
                    Current: $
                    {privateGameState.smallBlind ||
                      privateGameState.config?.smallBlind ||
                      0}{" "}
                    / $
                    {privateGameState.bigBlind ||
                      privateGameState.config?.bigBlind ||
                      0}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Small Blind</Label>
                    <Input
                      type="number"
                      value={newSmallBlind}
                      onChange={(e) => setNewSmallBlind(e.target.value)}
                      placeholder={(
                        privateGameState.smallBlind ||
                        privateGameState.config?.smallBlind ||
                        0
                      ).toString()}
                      className="bg-slate-900 border-slate-800"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Big Blind</Label>
                    <Input
                      type="number"
                      value={newBigBlind}
                      onChange={(e) => setNewBigBlind(e.target.value)}
                      placeholder={(
                        privateGameState.bigBlind ||
                        privateGameState.config?.bigBlind ||
                        0
                      ).toString()}
                      className="bg-slate-900 border-slate-800"
                    />
                  </div>
                  <Button
                    onClick={handleUpdateBlinds}
                    className="w-full"
                    size="sm"
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
                    Update Blinds
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* 2. Pending Requests */}
            <AccordionItem value="requests" className="border-slate-800">
              <AccordionTrigger className="text-sm">
                Seat Requests
                {pendingRequests.length > 0 && (
                  <Badge className="ml-2 bg-emerald-500">
                    {pendingRequests.length}
                  </Badge>
                )}
              </AccordionTrigger>
              <AccordionContent>
                {pendingRequests.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2">
                    No pending requests.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {pendingRequests.map((req: any) => {
                      const requestUserId =
                        req.id || req.playerId || req.userId;
                      return (
                        <div
                          key={requestUserId}
                          className="flex items-center justify-between bg-slate-900/50 p-2 rounded border border-slate-800"
                        >
                          <span className="text-sm font-medium">
                            {req.username || "Unknown"}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 hover:text-emerald-500"
                              onClick={() => handleApprove(req)}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 hover:text-red-500"
                              onClick={() => handleReject(requestUserId)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* 3. Player Management */}
            <AccordionItem value="players" className="border-slate-800">
              <AccordionTrigger className="text-sm">
                Manage Players
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {gameState.players
                    .filter(
                      (p) =>
                        p.status !== "LEFT" && p.status !== "REMOVED" && !p.left
                    ) // Filter out permanently out players (but include host)
                    .map((p) => {
                      const isHostPlayer = p.id === currentUserId;
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-2 rounded bg-slate-900/50 border border-slate-800"
                        >
                          <div className="flex flex-col">
                            <span className="text-xs font-bold">
                              {p.username}
                            </span>
                            <span className="text-[10px] text-emerald-400">
                              ${p.chips}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            {/* Edit Stack Dialog */}
                            <Dialog
                              open={isDialogOpen && editStackSeat === p.seat}
                              onOpenChange={(open) => {
                                setIsDialogOpen(open);
                                if (!open) {
                                  setEditStackSeat(null);
                                  setNewStackAmount("");
                                }
                              }}
                            >
                              <DialogTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-slate-400"
                                  onClick={() => {
                                    setEditStackSeat(p.seat);
                                    setIsDialogOpen(true);
                                  }}
                                >
                                  <Settings className="w-3 h-3" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>
                                    Edit Stack for {p.username}
                                  </DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                  <div className="space-y-2">
                                    <Label>New Chip Amount</Label>
                                    <Input
                                      type="number"
                                      value={newStackAmount}
                                      onChange={(e) =>
                                        setNewStackAmount(e.target.value)
                                      }
                                      placeholder={p.chips.toString()}
                                    />
                                  </div>
                                  <Button
                                    onClick={handleUpdateStack}
                                    className="w-full"
                                  >
                                    Update Stack
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>

                            {/* Only show remove button for non-host players */}
                            {!isHostPlayer && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-slate-400 hover:text-red-500"
                                onClick={() => handleKick(p.id)}
                              >
                                <UserMinus className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* 4. View Spectators */}
            <AccordionItem value="spectators" className="border-slate-800">
              <AccordionTrigger className="text-sm">
                View Spectators
                {(privateGameState as any).spectators?.length > 0 && (
                  <Badge className="ml-2 bg-blue-500">
                    {(privateGameState as any).spectators.length}
                  </Badge>
                )}
              </AccordionTrigger>
              <AccordionContent>
                {!(privateGameState as any).spectators?.length ? (
                  <p className="text-xs text-slate-500 py-2">No spectators.</p>
                ) : (
                  <div className="space-y-2">
                    {(privateGameState as any).spectators.map(
                      (spectator: any) => (
                        <div
                          key={spectator.userId}
                          className="flex items-center justify-between bg-slate-900/50 p-2 rounded border border-slate-800"
                        >
                          <span className="text-sm font-medium">
                            {spectator.username || "Unknown"}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      ) : (
        /* GUEST/SPECTATOR VIEW */
        <div className="space-y-4">
          {isSeated ? (
            /* Game Info - Matching online game styling */
            <div className="space-y-2">
              {gameState.config?.maxPlayers && (
                <div>
                  <p className="text-xs text-muted-foreground">Table Size</p>
                  <p className="text-sm font-semibold">
                    {gameState.config.maxPlayers}-Max
                  </p>
                </div>
              )}
              {(gameState.smallBlind ||
                gameState.config?.smallBlind ||
                gameState.bigBlind ||
                gameState.config?.bigBlind) && (
                <div>
                  <p className="text-xs text-muted-foreground">Blinds</p>
                  <p className="text-sm font-semibold">
                    ${gameState.smallBlind || gameState.config?.smallBlind || 0}
                    /$
                    {gameState.bigBlind || gameState.config?.bigBlind || 0}
                  </p>
                </div>
              )}
            </div>
          ) : isSpectator ? (
            /* SPECTATOR CONTROLS */
            <div className="space-y-3">
              {/* Guest spectator controls */}
              {!isHost && (
                <>
                  {hasPendingRequest ? (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded text-center animate-pulse">
                      <p className="text-amber-400 text-sm font-medium">
                        Waiting for Host Approval...
                      </p>
                      <p className="text-xs text-amber-400/70 mt-1">
                        Your seat request is pending
                      </p>
                    </div>
                  ) : wasRejected ? (
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      onClick={requestSeat}
                    >
                      <UserPlus className="w-4 h-4 mr-2" /> Request Seat Again
                    </Button>
                  ) : (
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      onClick={requestSeat}
                    >
                      <UserPlus className="w-4 h-4 mr-2" /> Request Seat
                    </Button>
                  )}
                </>
              )}

              {/* Spectator mode indicator */}
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded text-center">
                <Eye className="w-4 h-4 mx-auto mb-1 text-blue-400" />
                <p className="text-blue-400 text-xs font-medium">
                  Spectator Mode
                </p>
                <p className="text-xs text-blue-400/70 mt-1">
                  You are watching this game
                </p>
              </div>
            </div>
          ) : hasPendingRequest ? (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded text-center animate-pulse">
              <p className="text-amber-400 text-sm font-medium">Request Sent</p>
              <p className="text-xs text-amber-400/70">Waiting for host...</p>
            </div>
          ) : wasRejected ? (
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              onClick={requestSeat}
            >
              <UserPlus className="w-4 h-4 mr-2" /> Request Seat Again
            </Button>
          ) : (
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              onClick={requestSeat}
            >
              <UserPlus className="w-4 h-4 mr-2" /> Request Seat
            </Button>
          )}
        </div>
      )}
    </div>
  );

  // Prepare footer content with game controls (for host) and Leave Game button
  const footerContent = (
    <div className="flex items-center gap-3 w-full">
      {isHost && (
        <>
          {privateGameState.status === "waiting" ? (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 flex-[0_0_48%]"
              onClick={() => handleAdminAction("ADMIN_START_GAME")}
            >
              <Play className="w-4 h-4 mr-2" /> Start
            </Button>
          ) : (
            <Button
              variant={isPaused ? "default" : "secondary"}
              className="flex-[0_0_48%]"
              onClick={togglePause}
            >
              {isPaused ? (
                <>
                  <Play className="w-4 h-4 mr-2" /> Play
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4 mr-2" /> Pause
                </>
              )}
            </Button>
          )}
        </>
      )}
      <div className={isHost ? "flex-[0_0_48%]" : "ml-auto"}>
        <LeaveGameButton gameId={gameId} className="w-full" />
      </div>
    </div>
  );

  return (
    <PlayLayout
      tableContent={
        <PokerTable
          gameState={{
            ...gameState,
            hostId: privateGameState.hostId,
          }}
          currentUserId={currentUserId}
          isHeadsUp={gameState.config?.maxPlayers === 2}
          turnTimer={turnTimer}
          isSyncing={isSyncing}
        />
      }
      actionPopup={actionPopupContent}
      footer={footerContent}
    >
      {sidebarContent}
    </PlayLayout>
  );
}
