'use client'

import { useState } from 'react'
import { useClubApi } from '@/lib/api/http'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, LogOut, Trash2, AlertTriangle } from 'lucide-react'
import { useToast } from '@/lib/hooks'

interface ClubLeaveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clubId: string
  isLeader: boolean
  onLeave?: () => void
  onDisbanded?: () => void
}

export function ClubLeaveDialog({
  open,
  onOpenChange,
  clubId,
  isLeader,
  onLeave,
  onDisbanded,
}: ClubLeaveDialogProps) {
  const { leaveClub, disbandClub } = useClubApi()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleAction = async () => {
    setLoading(true)
    try {
      let result
      if (isLeader) {
        result = await disbandClub(clubId)
      } else {
        result = await leaveClub(clubId)
      }

      if ('error' in result) {
        toast({
          title: 'Error',
          description: result.error,
          variant: 'destructive',
        })
        return
      }

      toast({
        title: isLeader ? 'Club disbanded' : 'Left club',
        description: isLeader
          ? 'Your club has been disbanded'
          : 'You have left the club',
      })

      if (isLeader) {
        onDisbanded?.()
      } else {
        onLeave?.()
      }
      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Error',
        description: isLeader ? 'Failed to disband club' : 'Failed to leave club',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isLeader ? (
              <>
                <Trash2 className="h-5 w-5 text-destructive" />
                Disband Club
              </>
            ) : (
              <>
                <LogOut className="h-5 w-5 text-destructive" />
                Leave Club
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isLeader
              ? 'Are you sure you want to disband this club?'
              : 'Are you sure you want to leave this club?'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="flex items-start gap-3 p-3 bg-destructive/10 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              {isLeader ? (
                <>
                  <p className="font-medium text-destructive">This action cannot be undone.</p>
                  <p className="text-muted-foreground mt-1">
                    All club data, messages, and member associations will be permanently deleted.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">You will leave the club.</p>
                  <p className="text-muted-foreground mt-1">
                    You can rejoin later if the club allows it.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleAction}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : isLeader ? (
              <Trash2 className="h-4 w-4 mr-2" />
            ) : (
              <LogOut className="h-4 w-4 mr-2" />
            )}
            {isLeader ? 'Disband Club' : 'Leave Club'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
