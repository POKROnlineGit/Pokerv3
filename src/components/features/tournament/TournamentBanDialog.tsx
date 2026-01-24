'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Ban, AlertTriangle } from 'lucide-react'

interface TournamentBanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isLoading: boolean
  playerName?: string
}

export function TournamentBanDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
  playerName,
}: TournamentBanDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" />
            Ban Player
          </DialogTitle>
          <DialogDescription>
            Ban {playerName || 'this player'} from the tournament
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="flex items-start gap-3 p-3 bg-destructive/10 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-destructive">This player will be removed.</p>
              <p className="text-muted-foreground mt-1">
                They will not be able to rejoin this tournament.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Ban className="h-4 w-4 mr-2" />
            )}
            Ban Player
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
