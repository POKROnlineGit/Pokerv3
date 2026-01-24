'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSocket } from '@/lib/api/socket/client'
import { useClubApi } from '@/lib/api/http/clubs'
import { useToast } from '@/lib/hooks'
import { useProfile } from '@/lib/hooks/useProfile'
import { Loader2, Gamepad2 } from 'lucide-react'

interface CreateGamePopupProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clubId: string
  onGameCreated: (gameId: string) => void
}

export function CreateGamePopup({ open, onOpenChange, clubId, onGameCreated }: CreateGamePopupProps) {
  const socket = useSocket()
  const { shareGame } = useClubApi()
  const { toast } = useToast()
  const { profile } = useProfile()

  const [isCreating, setIsCreating] = useState(false)
  const [startingStack, setStartingStack] = useState('200')
  const [smallBlind, setSmallBlind] = useState('1')
  const [bigBlind, setBigBlind] = useState('2')

  const handleCreate = async () => {
    setIsCreating(true)

    try {
      if (!socket.connected) socket.connect()

      // 1. Create private game via socket
      const gameId = await new Promise<string>((resolve, reject) => {
        socket.emit('create_private_game', {
          variantSlug: 'ten_max',
          config: {
            buyIn: parseInt(startingStack),
            startingStack: parseInt(startingStack),
            blinds: { small: parseInt(smallBlind), big: parseInt(bigBlind) }
          }
        }, (response: { gameId?: string; error?: string }) => {
          if (response?.gameId) {
            resolve(response.gameId)
          } else {
            reject(new Error(response?.error || 'Failed to create game'))
          }
        })
      })

      // 2. Share to club chat
      const shareResult = await shareGame(clubId, gameId, {
        title: `${profile?.username || 'Player'}'s Private Game`,
        blinds: `${smallBlind}/${bigBlind}`,
        maxPlayers: 10,
        hostUsername: profile?.username,
        variant: 'Texas Hold\'em',
      })

      if ('error' in shareResult) {
        toast({
          title: 'Game created but failed to share',
          description: shareResult.error,
          variant: 'destructive',
        })
      }

      // 3. Redirect host to game
      onGameCreated(gameId)

    } catch (error) {
      toast({
        title: 'Failed to create game',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5" />
            Create Private Game
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Starting Stack */}
          <div className="space-y-2">
            <Label>Starting Stack</Label>
            <Input
              type="number"
              value={startingStack}
              onChange={(e) => setStartingStack(e.target.value)}
            />
          </div>

          {/* Blinds */}
          <div className="space-y-2">
            <Label>Blinds (SB / BB)</Label>
            <div className="flex gap-2 items-center">
              <Input
                type="number"
                value={smallBlind}
                onChange={(e) => setSmallBlind(e.target.value)}
                className="flex-1"
              />
              <span>/</span>
              <Input
                type="number"
                value={bigBlind}
                onChange={(e) => setBigBlind(e.target.value)}
                className="flex-1"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create & Share'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
