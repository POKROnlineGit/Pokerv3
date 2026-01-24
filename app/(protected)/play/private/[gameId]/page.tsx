"use client";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { PlayLayout } from "@/components/layout/PlayLayout";
import { PokerTable } from "@/components/features/game/PokerTable";
import { ActionPopup } from "@/components/features/game/ActionPopup";
import { LeaveGameButton } from "@/components/features/game/LeaveGameButton";
import { usePrivateGameSocket } from "@/lib/api/socket/private";
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
import { useTheme } from "@/components/providers/PreferencesProvider";
import { ShareToClubButton } from "@/components/features/club";

export default function PrivateGamePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { currentTheme } = useTheme();
  const gameId = params.gameId as string;

  // Dialog state for stack editing
  const [editStackSeat, setEditStackSeat] = useState<number | null>(null);
  const [newStackAmount, setNewStackAmount] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newSmallBlind, setNewSmallBlind] = useState("");
  const [newBigBlind, setNewBigBlind] = useState("");

  // Use the new socket hook
  const {
    gameState,
    isSyncing,
    turnTimer,
    currentUserId,
    isHeadsUp,
    isHost,
    isSpectator,
    isSeated,
    isHostSpectator,
    hasPendingRequest,
    pendingRequests,
    wasRejected,
    sendAction,
    revealCard,
    requestSeat,
    hostSitDown,
    approveRequest,
    rejectRequest,
    kickPlayer,
    updateStack,
    updateBlinds,
    togglePause,
    startGame,
  } = usePrivateGameSocket(gameId);

  // Handle stack update
  const handleUpdateStack = useCallback(() => {
    if (editStackSeat === null) return;
    updateStack(editStackSeat, parseInt(newStackAmount));
    setEditStackSeat(null);
    setNewStackAmount("");
    setIsDialogOpen(false);
  }, [editStackSeat, newStackAmount, updateStack]);

  // Handle blinds update
  const handleUpdateBlinds = useCallback(() => {
    const smallBlind = parseInt(newSmallBlind);
    const bigBlind = parseInt(newBigBlind);
    updateBlinds(smallBlind, bigBlind);
    setNewSmallBlind("");
    setNewBigBlind("");
  }, [newSmallBlind, newBigBlind, updateBlinds]);

  // Copy invite link
  const copyInviteLink = useCallback(() => {
    const url = `${window.location.origin}/play/private/${gameId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link Copied",
      description: "Share this link to invite players.",
    });
  }, [gameId, toast]);

  // Handle reveal card
  const handleRevealCard = useCallback(
    (cardIndex: number) => {
      revealCard(cardIndex);
    },
    [revealCard]
  );

  // Loading state
  if (isSyncing || !gameState || !currentUserId) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="h-12 w-12 text-emerald-500 animate-spin" />
        <p className="text-slate-400">Connecting to private lobby...</p>
      </div>
    );
  }

  const isPaused = gameState.isPaused || false;

  // Prepare action popup
  const actionPopupContent = (
    <ActionPopup
      gameState={gameState}
      currentUserId={currentUserId}
      onAction={(type, amount, isAllInCall) =>
        sendAction(type, amount, isAllInCall)
      }
      onRevealCard={handleRevealCard}
    />
  );

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

        {/* Join Code Display */}
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

        {/* Share to Club */}
        {isHost && (
          <ShareToClubButton
            gameId={gameId}
            title={`Private Game (${gameState.smallBlind || 0}/${gameState.bigBlind || 0})`}
            variant="outline"
            size="sm"
            className="w-full text-xs h-8"
          />
        )}
      </div>

      <Separator className="bg-slate-800" />

      {/* HOST CONTROLS */}
      {isHost ? (
        <>
          {/* Host Spectator Rejoin Button */}
          {isHostSpectator && (
            <div className="mb-4">
              <Button
                className="w-full"
                style={{ backgroundColor: 'var(--theme-accent-0)', color: 'white' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--theme-accent-1)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--theme-accent-0)'}
                onClick={() => hostSitDown()}
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
                    {gameState.smallBlind || gameState.config?.smallBlind || 0} / $
                    {gameState.bigBlind || gameState.config?.bigBlind || 0}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Small Blind</Label>
                    <Input
                      type="number"
                      value={newSmallBlind}
                      onChange={(e) => setNewSmallBlind(e.target.value)}
                      placeholder={(
                        gameState.smallBlind ||
                        gameState.config?.smallBlind ||
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
                        gameState.bigBlind ||
                        gameState.config?.bigBlind ||
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
                      background: 'linear-gradient(to right, var(--theme-primary-0), var(--theme-primary-1))',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(to right, var(--theme-primary-1), var(--theme-primary-0))';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(to right, var(--theme-primary-0), var(--theme-primary-1))';
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
                    {pendingRequests.map((req) => {
                      const requestUserId = req.odanUserId;
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
                              onClick={() => approveRequest(req)}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 hover:text-red-500"
                              onClick={() => rejectRequest(requestUserId)}
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
                    )
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
                                onClick={() => kickPlayer(p.id)}
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
                {gameState.spectators && gameState.spectators.length > 0 && (
                  <Badge className="ml-2 bg-blue-500">
                    {gameState.spectators.length}
                  </Badge>
                )}
              </AccordionTrigger>
              <AccordionContent>
                {!gameState.spectators?.length ? (
                  <p className="text-xs text-slate-500 py-2">No spectators.</p>
                ) : (
                  <div className="space-y-2">
                    {gameState.spectators.map((spectator) => (
                      <div
                        key={spectator.odanUserId}
                        className="flex items-center justify-between bg-slate-900/50 p-2 rounded border border-slate-800"
                      >
                        <span className="text-sm font-medium">
                          {spectator.username || "Unknown"}
                        </span>
                      </div>
                    ))}
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
                    /${gameState.bigBlind || gameState.config?.bigBlind || 0}
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
                      className="w-full"
                      style={{ backgroundColor: 'var(--theme-accent-0)', color: 'white' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--theme-accent-1)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--theme-accent-0)'}
                      onClick={requestSeat}
                    >
                      <UserPlus className="w-4 h-4 mr-2" /> Request Seat Again
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      style={{ backgroundColor: 'var(--theme-accent-0)', color: 'white' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--theme-accent-1)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--theme-accent-0)'}
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
              className="w-full"
              style={{ backgroundColor: 'var(--theme-accent-0)', color: 'white' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--theme-accent-1)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--theme-accent-0)'}
              onClick={requestSeat}
            >
              <UserPlus className="w-4 h-4 mr-2" /> Request Seat Again
            </Button>
          ) : (
            <Button
              className="w-full"
              style={{ backgroundColor: 'var(--theme-accent-0)', color: 'white' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--theme-accent-1)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--theme-accent-0)'}
              onClick={requestSeat}
            >
              <UserPlus className="w-4 h-4 mr-2" /> Request Seat
            </Button>
          )}
        </div>
      )}
    </div>
  );

  // Prepare footer content
  const footerContent = (
    <div className="flex items-center gap-3 w-full">
      {isHost && (
        <>
          {gameState.status === "waiting" ? (
            <Button
              className="flex-[0_0_48%]"
              style={{
                background: 'linear-gradient(to right, var(--theme-primary-0), var(--theme-primary-1))',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(to right, var(--theme-primary-1), var(--theme-primary-0))';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(to right, var(--theme-primary-0), var(--theme-primary-1))';
              }}
              onClick={startGame}
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
            hostId: gameState.hostId,
          }}
          currentUserId={currentUserId}
          isHeadsUp={isHeadsUp}
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
