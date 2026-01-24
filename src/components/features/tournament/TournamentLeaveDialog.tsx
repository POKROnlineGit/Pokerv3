'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, LogOut, AlertTriangle } from 'lucide-react'

interface TournamentLeaveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isLoading: boolean
}

export function TournamentLeaveDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: TournamentLeaveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5 text-destructive" />
            Leave Tournament
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to leave this tournament?
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="flex items-start gap-3 p-3 bg-destructive/10 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">You will be removed from this tournament.</p>
              <p className="text-muted-foreground mt-1">
                You may not be able to rejoin once the tournament has started.
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
              <LogOut className="h-4 w-4 mr-2" />
            )}
            Leave Tournament
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
