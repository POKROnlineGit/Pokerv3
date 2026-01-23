'use client'

import { useState } from 'react'
import { useClubSocket } from '@/lib/api/socket'
import { NormalizedClubMember } from '@/lib/types/club'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Ban } from 'lucide-react'
import { useToast } from '@/lib/hooks'

interface ClubBanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clubId: string
  member: NormalizedClubMember | null
  onBanned?: () => void
}

export function ClubBanDialog({
  open,
  onOpenChange,
  clubId,
  member,
  onBanned,
}: ClubBanDialogProps) {
  const { banMember, kickMember } = useClubSocket()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [reason, setReason] = useState('')
  const [banFromRejoining, setBanFromRejoining] = useState(true)

  const handleAction = async () => {
    if (!member) return

    setLoading(true)
    try {
      let result
      if (banFromRejoining) {
        result = await banMember(clubId, member.userId, reason.trim() || undefined)
      } else {
        result = await kickMember(clubId, member.userId)
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
        title: banFromRejoining ? 'Member banned' : 'Member kicked',
        description: `${member.username} has been ${banFromRejoining ? 'banned from' : 'removed from'} the club`,
      })

      onBanned?.()
      onOpenChange(false)
      setReason('')
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove member',
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
            <Ban className="h-5 w-5 text-destructive" />
            Remove Member
          </DialogTitle>
          <DialogDescription>
            Remove {member?.username || 'this member'} from the club
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="ban-from-rejoining"
              checked={banFromRejoining}
              onChange={(e) => setBanFromRejoining(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="ban-from-rejoining">
              Ban from rejoining
            </Label>
          </div>

          {banFromRejoining && (
            <div className="space-y-2">
              <Label htmlFor="ban-reason">Reason (optional)</Label>
              <Input
                id="ban-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter ban reason..."
                maxLength={200}
                disabled={loading}
              />
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {banFromRejoining
              ? 'This member will not be able to rejoin the club until unbanned.'
              : 'This member will be able to rejoin the club.'}
          </p>
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
            ) : (
              <Ban className="h-4 w-4 mr-2" />
            )}
            {banFromRejoining ? 'Ban Member' : 'Kick Member'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
