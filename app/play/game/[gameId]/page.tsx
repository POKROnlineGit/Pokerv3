'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PokerTable } from '@/components/PokerTable'
import { ActionPopup } from '@/components/ActionPopup'
import { GameState, ActionType } from '@/lib/poker-game/ui/legacyTypes'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { gameContextToUI } from '@/lib/poker-game/ui/adapters'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLocalGameStore } from '@/lib/stores/useLocalGameStore'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const BOT_NAMES: Record<string, string> = {
  'bot-1': 'AggroBot',
  'bot-2': 'TightBot',
  'bot-3': 'CallingStation',
  'bot-4': 'RandomBot',
  'bot-5': 'SolidBot',
}

export default function GamePage() {
  const params = useParams()
  const router = useRouter()
  const gameId = params.gameId as string
  const isLocalGame = gameId.startsWith('local-')
  
  const supabase = createClientComponentClient()
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)

  // Local game store
  const {
    gameContext: localGameContext,
    startLocalGame,
    playerAction: localPlayerAction,
    leaveLocalGame,
    newGame: startNewLocalGame,
  } = useLocalGameStore()

  // Initialize local game if needed
  useEffect(() => {
    if (isLocalGame && !localGameContext) {
      startLocalGame()
    }
  }, [isLocalGame, localGameContext, startLocalGame])

  // Subscribe to local game state changes
  useEffect(() => {
    if (!isLocalGame) return

    setCurrentUserId('human-player')
    
    // Initial state
    if (localGameContext) {
      setGameState(gameContextToUI(localGameContext))
    }

    // Subscribe to store updates
    const unsubscribe = useLocalGameStore.subscribe(
      (state) => {
        // Update local state whenever store gameContext changes
        if (state.gameContext) {
          setGameState(gameContextToUI(state.gameContext))
        }
      }
    )

    return unsubscribe
  }, [isLocalGame, localGameContext])

  // Load multiplayer game
  useEffect(() => {
    if (isLocalGame) return

    const loadGame = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }
      setCurrentUserId(user.id)

      // Load game state
      const { data: game } = await supabase
        .from('games')
        .select('current_hand')
        .eq('id', gameId)
        .single()

      if (game?.current_hand) {
        setGameState(game.current_hand as GameState)
      }

      // Subscribe to game updates
      const channel = supabase.channel(`game:${gameId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`
        }, async (payload) => {
          const updatedGame = payload.new as any
          if (updatedGame.current_hand) {
            setGameState(updatedGame.current_hand as GameState)
          }
        })
        .subscribe()

      return () => {
        channel.unsubscribe()
      }
    }

    loadGame()
  }, [gameId, supabase, router, isLocalGame])

  const handleAction = async (action: ActionType, amount?: number) => {
    if (!gameState || !currentUserId) return

    if (isLocalGame) {
      // Local game action
      localPlayerAction(action, amount)
    } else {
      // Multiplayer game action
      try {
        const response = await fetch('/api/game/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId,
            action,
            amount,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          alert(error.error || 'Action failed')
          return
        }

        const updatedState = await response.json()
        setGameState(updatedState)
      } catch (err: any) {
        alert(err.message || 'Failed to submit action')
      }
    }
  }

  const handleLeaveGame = () => {
    if (isLocalGame) {
      leaveLocalGame()
    }
    router.push('/play')
  }

  const handleNewGame = () => {
    if (isLocalGame) {
      startNewLocalGame()
    }
  }

  if (!gameState || !currentUserId) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[60vh]">
        <div>Loading game...</div>
      </div>
    )
  }

  return (
    <div className="relative h-screen overflow-hidden">
      {/* Local game banner - positioned absolutely at top */}
      {isLocalGame && (
        <div className="absolute top-4 left-4 right-4 z-50 bg-primary-500/10 border border-primary-500/20 rounded-xl p-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-primary-500">Local Game • 200 chips • Unlimited rebuys</h3>
            <p className="text-sm text-muted-foreground">Playing against 5 bots - perfect for testing!</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleNewGame}>
              New Game
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowLeaveDialog(true)}>
              Leave Game
            </Button>
          </div>
        </div>
      )}

      {/* Multiplayer leave button - positioned absolutely at top */}
      {!isLocalGame && (
        <div className="absolute top-4 left-4 z-50">
          <Button variant="outline" onClick={() => setShowLeaveDialog(true)}>
            Leave Game
          </Button>
        </div>
      )}

      {/* Table container - centered vertically and horizontally */}
      <div className="h-full flex items-center justify-center">
        <PokerTable
          gameState={gameState}
          currentUserId={currentUserId}
          playerNames={isLocalGame ? BOT_NAMES : undefined}
          isLocalGame={isLocalGame}
        />
      </div>

      {/* Action Popup - shows automatically when player can act */}
      <ActionPopup
        gameState={gameState}
        currentUserId={currentUserId}
        onAction={handleAction}
        isLocalGame={isLocalGame}
      />

      {/* Leave game confirmation dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave Game?</DialogTitle>
            <DialogDescription>
              {isLocalGame
                ? 'Are you sure you want to leave this local game? Your progress will be lost.'
                : 'Are you sure you want to leave this game?'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleLeaveGame}>
              Leave Game
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
