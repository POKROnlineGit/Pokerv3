'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PokerTable } from '@/components/PokerTable'
import { ActionPopup } from '@/components/ActionPopup'
import { GameState, ActionType } from '@/lib/poker-game/ui/legacyTypes'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { getSocket, disconnectSocket } from '@/lib/socketClient'
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
  const [isHeadsUp, setIsHeadsUp] = useState(false)

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

  // Load multiplayer game with Socket.io
  useEffect(() => {
    if (isLocalGame) return

    let socket: any = null
    let mounted = true

    const loadGame = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/')
          return
        }
        setCurrentUserId(user.id)

        // Initial load from Supabase (recovery)
        const { data: game } = await supabase
          .from('games')
          .select('current_hand, game_type')
          .eq('id', gameId)
          .single()

        if (game && mounted) {
          if (game.current_hand) {
            setGameState(game.current_hand as GameState)
          }
          // Detect heads-up mode
          setIsHeadsUp(game.game_type === 'heads_up')
        }

        // Connect to Socket.io and join game room (optional)
        socket = await getSocket()
        
        if (socket) {
          // Join the game room
          socket.emit('joinGame', { gameId })

          // Listen for game state updates from server
          socket.on('gameState', (newState: GameState) => {
            if (mounted) {
              setGameState(newState)
            }
          })

          // Listen for action confirmations
          socket.on('actionProcessed', (data: { success: boolean; error?: string }) => {
            if (!data.success && data.error) {
              console.error('[Game] Action error:', data.error)
              alert(data.error)
            }
          })

          // Listen for errors
          socket.on('error', (error: { message: string }) => {
            console.error('[Game] Socket error:', error.message)
            alert(error.message)
          })
        } else {
          console.log('[Game] Socket.io server not available - using Supabase Realtime only')
        }

        // Fallback: Also subscribe to Supabase Realtime for redundancy
        const channel = supabase.channel(`game:${gameId}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'games',
            filter: `id=eq.${gameId}`
          }, async (payload) => {
            const updatedGame = payload.new as any
            if (updatedGame && mounted) {
              if (updatedGame.current_hand) {
                setGameState(updatedGame.current_hand as GameState)
              }
              if (updatedGame.game_type) {
                setIsHeadsUp(updatedGame.game_type === 'heads_up')
              }
            }
          })
          .subscribe()

        return () => {
          mounted = false
          if (socket) {
            socket.emit('leaveGame', { gameId })
            socket.off('gameState')
            socket.off('actionProcessed')
            socket.off('error')
          }
          channel.unsubscribe()
        }
      } catch (error) {
        console.error('[Game] Failed to load game:', error)
        // Fallback to Supabase-only mode
        const channel = supabase.channel(`game:${gameId}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'games',
            filter: `id=eq.${gameId}`
          }, async (payload) => {
            const updatedGame = payload.new as any
            if (updatedGame && mounted) {
              if (updatedGame.current_hand) {
                setGameState(updatedGame.current_hand as GameState)
              }
              if (updatedGame.game_type) {
                setIsHeadsUp(updatedGame.game_type === 'heads_up')
              }
            }
          })
          .subscribe()

        return () => {
          mounted = false
          channel.unsubscribe()
        }
      }
    }

    const cleanup = loadGame()

    return () => {
      mounted = false
      cleanup.then(cleanupFn => {
        if (cleanupFn) cleanupFn()
      }).catch(() => {
        // Ignore cleanup errors
      })
    }
  }, [gameId, supabase, router, isLocalGame])

  const handleAction = async (action: ActionType, amount?: number) => {
    if (!gameState || !currentUserId) return

    if (isLocalGame) {
      // Local game action
      localPlayerAction(action, amount)
    } else {
      // Multiplayer game action via Socket.io (with API fallback)
      try {
        const socket = await getSocket()
        
        if (socket) {
          // Emit action to server via Socket.io
          socket.emit('action', {
            gameId,
            action,
            amount,
            seat: gameState.players.find(p => p.id === currentUserId)?.seat,
          })
          // State will be updated via 'gameState' event from server
        } else {
          // Fallback to API route if Socket.io is not available
          const response = await fetch(`/api/game/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gameId,
              action,
              amount,
              seat: gameState.players.find(p => p.id === currentUserId)?.seat,
            }),
          })
          
          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || 'Failed to submit action')
          }
          // State will be updated via Supabase Realtime subscription
        }
      } catch (err: any) {
        console.error('[Game] Failed to send action:', err)
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
          isHeadsUp={isHeadsUp}
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
