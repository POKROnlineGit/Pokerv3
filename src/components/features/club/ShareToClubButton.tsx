'use client'

import { useState, useEffect } from 'react'
import { useClubSocket } from '@/lib/api/socket'
import { NormalizedClub, normalizeClub } from '@/lib/types/club'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Users, Loader2, Share2, Check } from 'lucide-react'
import { useToast } from '@/lib/hooks'

interface ShareToClubButtonProps {
  gameId?: string
  tournamentId?: string
  title?: string
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
}

export function ShareToClubButton({
  gameId,
  tournamentId,
  title,
  variant = 'outline',
  size = 'sm',
  className,
}: ShareToClubButtonProps) {
  const { getUserClub, shareGame, shareTournament } = useClubSocket()
  const { toast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [userClub, setUserClub] = useState<NormalizedClub | null>(null)
  const [shared, setShared] = useState(false)

  useEffect(() => {
    if (dialogOpen && !userClub) {
      setLoading(true)
      getUserClub()
        .then((result) => {
          if ('error' in result) {
            // No club or error
            setUserClub(null)
          } else if (result.club) {
            setUserClub(normalizeClub(result.club))
          }
        })
        .finally(() => setLoading(false))
    }
  }, [dialogOpen, getUserClub, userClub])

  const handleShare = async () => {
    if (!userClub) return

    setSharing(true)
    try {
      let result
      if (gameId) {
        result = await shareGame(userClub.id, gameId, title)
      } else if (tournamentId) {
        result = await shareTournament(userClub.id, tournamentId, title)
      } else {
        setSharing(false)
        return
      }

      if ('error' in result) {
        toast({
          title: 'Error',
          description: result.error,
          variant: 'destructive',
        })
      } else {
        setShared(true)
        toast({
          title: 'Shared to club!',
          description: `${gameId ? 'Game' : 'Tournament'} shared to ${userClub.name}`,
        })
        setTimeout(() => {
          setDialogOpen(false)
          setShared(false)
        }, 1500)
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to share',
        variant: 'destructive',
      })
    } finally {
      setSharing(false)
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setDialogOpen(true)}
      >
        <Share2 className="h-4 w-4 mr-2" />
        Share to Club
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Share to Club
            </DialogTitle>
            <DialogDescription>
              Share this {gameId ? 'game' : 'tournament'} with your club members
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : shared ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
                  <Check className="h-6 w-6 text-green-500" />
                </div>
                <p className="text-lg font-medium">Shared!</p>
                <p className="text-muted-foreground text-sm">
                  Your club members can now see this
                </p>
              </div>
            ) : !userClub ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-lg font-medium">No Club</p>
                <p className="text-muted-foreground text-sm">
                  Join or create a club to share {gameId ? 'games' : 'tournaments'}
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setDialogOpen(false)
                    window.location.href = '/social/clubs'
                  }}
                >
                  Go to Clubs
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{userClub.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {userClub.memberCount ?? 'Unknown'} members
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">
                  A link to this {gameId ? 'game' : 'tournament'} will be posted in your club chat.
                </p>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleShare}
                    disabled={sharing}
                    style={{
                      backgroundColor: 'var(--theme-accent-0)',
                      color: 'white',
                    }}
                  >
                    {sharing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sharing...
                      </>
                    ) : (
                      <>
                        <Share2 className="h-4 w-4 mr-2" />
                        Share
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
