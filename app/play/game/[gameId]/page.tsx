'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PokerTable } from '@/components/PokerTable'
import { ActionModal } from '@/components/ActionModal'
import { GameState, ActionType, ActionValidation, validateAction, getCurrentBet } from '@/lib/poker-game/legacyTypes'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { gameContextToLegacyState } from '@/lib/poker-game/adapters'
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
  const [showActionModal, setShowActionModal] = useState(false)
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)
  const [actionValidation, setActionValidation] = useState<ActionValidation & { action?: ActionType }>({ valid: false })

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
      setGameState(gameContextToLegacyState(localGameContext))
    }

    // Subscribe to store updates
    const unsubscribe = useLocalGameStore.subscribe(
      (state) => {
        // Update local state whenever store gameContext changes
        if (state.gameContext) {
          setGameState(gameContextToLegacyState(state.gameContext))
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

  // Handle action modal for human player
  useEffect(() => {
    if (!gameState || !currentUserId) {
      setShowActionModal(false)
      return
    }

    // Check if it's the human player's turn
    if (gameState.currentActorSeat === 0 || gameState.currentActorSeat === -1) {
      setShowActionModal(false)
      return
    }

    const currentPlayer = gameState.players.find(p => p.seat === gameState.currentActorSeat)
    
    // Debug logging in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Action Modal Check]', {
        currentActorSeat: gameState.currentActorSeat,
        currentPlayer: currentPlayer?.name,
        currentPlayerId: currentPlayer?.id,
        humanId: currentUserId,
        isHumanTurn: currentPlayer?.id === currentUserId,
        folded: currentPlayer?.folded,
        allIn: currentPlayer?.allIn,
        chips: currentPlayer?.chips,
      })
    }
    
    // Only show modal if it's the human player's turn and they can act
    if (currentPlayer?.id === currentUserId && !currentPlayer.folded && !currentPlayer.allIn && currentPlayer.chips > 0) {
      const currentBet = getCurrentBet(gameState)
      const chipsToCall = currentBet - currentPlayer.betThisRound
      const canCheck = chipsToCall === 0

      // Determine available actions
      let availableAction: 'bet' | 'raise' | undefined = undefined
      if (canCheck && currentPlayer.chips >= gameState.minRaise) {
        // Can bet
        const betValidation = validateAction(gameState, currentUserId, 'bet')
        if (betValidation.valid) {
          availableAction = 'bet'
          setActionValidation({ ...betValidation, action: 'bet' })
        }
      } else if (!canCheck && currentPlayer.chips > chipsToCall) {
        // Can raise
        const raiseValidation = validateAction(gameState, currentUserId, 'raise')
        if (raiseValidation.valid) {
          availableAction = 'raise'
          setActionValidation({ ...raiseValidation, action: 'raise' })
        }
      }

      if (!availableAction) {
        // Just check/call/fold available
        setActionValidation({ valid: true })
      }

      setShowActionModal(true)
    } else {
      // Not human's turn - close modal
      setShowActionModal(false)
    }
  }, [gameState, currentUserId])

  const handleAction = async (action: ActionType, amount?: number) => {
    if (!gameState || !currentUserId) return

    if (isLocalGame) {
      // Local game action
      localPlayerAction(action, amount)
      setShowActionModal(false)
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
        setShowActionModal(false)
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

  const currentPlayer = gameState.players.find(p => p.id === currentUserId)
  const currentBet = getCurrentBet(gameState)
  const chipsToCall = currentBet - (currentPlayer?.betThisRound || 0)
  const canCheck = chipsToCall === 0

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Local game banner */}
      {isLocalGame && (
        <div className="mb-4 bg-primary-500/10 border border-primary-500/20 rounded-xl p-4 flex items-center justify-between">
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

      {/* Multiplayer leave button */}
      {!isLocalGame && (
        <div className="mb-4">
          <Button variant="outline" onClick={() => setShowLeaveDialog(true)}>
            Leave Game
          </Button>
        </div>
      )}

      <PokerTable
        gameState={gameState}
        currentUserId={currentUserId}
        playerNames={isLocalGame ? BOT_NAMES : undefined}
        isLocalGame={isLocalGame}
      />

      <ActionModal
        open={showActionModal}
        onClose={() => setShowActionModal(false)}
        onAction={handleAction}
        validation={actionValidation}
        currentBet={currentBet}
        playerChips={currentPlayer?.chips || 0}
        chipsToCall={chipsToCall}
        canCheck={canCheck}
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
