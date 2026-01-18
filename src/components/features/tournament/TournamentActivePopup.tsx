"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trophy, Play, ArrowRight, X, AlertTriangle, PartyPopper } from "lucide-react";

interface TournamentActivePopupProps {
  open: boolean;
  title: string | null;
  isPlaying: boolean;
  tableId: string | null;
  tournamentId: string | null;
  onGoToTournament: () => void;
  onDismiss: () => void;
}

export function TournamentActivePopup({
  open,
  title,
  isPlaying,
  tableId,
  tournamentId,
  onGoToTournament,
  onDismiss,
}: TournamentActivePopupProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-400" />
            <DialogTitle>Tournament In Progress</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            {isPlaying
              ? `You're currently playing in "${title || "a tournament"}"`
              : `You're registered for "${title || "a tournament"}"`}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-slate-400">
            {isPlaying
              ? "You must finish your tournament game before joining other games or queues."
              : "Unregister from the tournament to join other games or queues."}
          </p>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-between">
          {!isPlaying && (
            <Button variant="outline" onClick={onDismiss}>
              Stay Here
            </Button>
          )}
          <Button onClick={onGoToTournament} className="flex-1 sm:flex-none">
            {isPlaying ? (
              <>
                <Play className="mr-2 h-4 w-4" />
                Return to Game
              </>
            ) : (
              <>
                <ArrowRight className="mr-2 h-4 w-4" />
                Go to Tournament
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TournamentCompletedPopupProps {
  open: boolean;
  tournamentId: string;
  winnerId: string;
  winnerUsername: string | null;
  isCurrentUserWinner: boolean;
  onViewResults: () => void;
  onBackToLobby: () => void;
}

export function TournamentCompletedPopup({
  open,
  tournamentId,
  winnerId,
  winnerUsername,
  isCurrentUserWinner,
  onViewResults,
  onBackToLobby,
}: TournamentCompletedPopupProps) {
  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 justify-center">
            {isCurrentUserWinner ? (
              <PartyPopper className="h-8 w-8 text-amber-400" />
            ) : (
              <Trophy className="h-8 w-8 text-amber-400" />
            )}
          </div>
          <DialogTitle className="text-center text-2xl">
            {isCurrentUserWinner ? "🏆 Congratulations!" : "Tournament Complete"}
          </DialogTitle>
          <DialogDescription className="text-center pt-2 text-base">
            {isCurrentUserWinner
              ? "You won the tournament!"
              : `${winnerUsername || "A player"} has won the tournament!`}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-center pt-4">
          <Button onClick={onViewResults} variant="default">
            View Results
          </Button>
          <Button onClick={onBackToLobby} variant="outline">
            Back to Lobby
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TournamentCancelledPopupProps {
  open: boolean;
  reason: string | null;
  onBackToLobby: () => void;
}

export function TournamentCancelledPopup({
  open,
  reason,
  onBackToLobby,
}: TournamentCancelledPopupProps) {
  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 justify-center">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
          </div>
          <DialogTitle className="text-center text-xl">
            Tournament Cancelled
          </DialogTitle>
          <DialogDescription className="text-center pt-2">
            {reason || "The tournament has been cancelled."}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex justify-center pt-4">
          <Button onClick={onBackToLobby}>
            Back to Lobby
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
