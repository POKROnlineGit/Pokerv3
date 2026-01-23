'use client'

import { useState } from 'react'
import { useClubApi } from '@/lib/api/http'
import { NormalizedClub, normalizeClub } from '@/lib/types/club'
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
import { Switch } from '@/components/ui/switch'
import { Loader2, RefreshCw, Copy } from 'lucide-react'
import { useToast } from '@/lib/hooks'

interface ClubSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  club: NormalizedClub
  onClubUpdated?: (club: NormalizedClub) => void
}

export function ClubSettingsDialog({
  open,
  onOpenChange,
  club,
  onClubUpdated,
}: ClubSettingsDialogProps) {
  const { updateClubSettings, regenerateInviteCode } = useClubApi()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [name, setName] = useState(club.name)
  const [description, setDescription] = useState(club.description || '')
  const [isPublic, setIsPublic] = useState(club.isPublic)
  const [inviteCode, setInviteCode] = useState(club.inviteCode)

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (trimmedName.length < 3) {
      toast({
        title: 'Invalid name',
        description: 'Club name must be at least 3 characters',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    try {
      const result = await updateClubSettings(club.id, {
        name: trimmedName,
        description: description.trim() || undefined,
        isPublic,
      })

      if ('error' in result) {
        toast({
          title: 'Error',
          description: result.error,
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Settings saved',
        description: 'Club settings have been updated',
      })

      onClubUpdated?.({
        ...club,
        name: trimmedName,
        description: description.trim() || null,
        isPublic,
        inviteCode,
      })

      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save settings',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerateCode = async () => {
    setRegenerating(true)
    try {
      const result = await regenerateInviteCode(club.id)

      if ('error' in result) {
        toast({
          title: 'Error',
          description: result.error,
          variant: 'destructive',
        })
        return
      }

      setInviteCode(result.inviteCode)
      toast({
        title: 'Code regenerated',
        description: 'Old invite links will no longer work',
      })

      onClubUpdated?.({
        ...club,
        inviteCode: result.inviteCode,
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to regenerate code',
        variant: 'destructive',
      })
    } finally {
      setRegenerating(false)
    }
  }

  const copyInviteLink = () => {
    const link = `${window.location.origin}/social/clubs/join/${inviteCode}`
    navigator.clipboard.writeText(link)
    toast({
      title: 'Copied!',
      description: 'Invite link copied to clipboard',
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Club Settings</DialogTitle>
          <DialogDescription>
            Manage your club's settings and invite link
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="settings-name">Club Name</Label>
            <Input
              id="settings-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-description">Description</Label>
            <Input
              id="settings-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              disabled={loading}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="settings-public">Public Club</Label>
              <p className="text-xs text-muted-foreground">
                {isPublic
                  ? 'Anyone can find and join'
                  : 'Only joinable via invite link'}
              </p>
            </div>
            <Switch
              id="settings-public"
              checked={isPublic}
              onCheckedChange={setIsPublic}
              disabled={loading}
            />
          </div>

          <div className="space-y-2 pt-4 border-t">
            <Label>Invite Link</Label>
            <div className="flex gap-2">
              <Input
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/social/clubs/join/${inviteCode}`}
                readOnly
                className="text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={copyInviteLink}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerateCode}
              disabled={regenerating}
              className="w-full"
            >
              {regenerating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Regenerate Code
            </Button>
            <p className="text-xs text-muted-foreground">
              Regenerating will invalidate all existing invite links
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || name.trim().length < 3}
            style={{
              backgroundColor: 'var(--theme-accent-0)',
              color: 'white',
            }}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
