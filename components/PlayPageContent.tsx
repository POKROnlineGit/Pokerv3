'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Play, Bot, Users, User } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useLocalGameStore } from '@/lib/stores/useLocalGameStore'
import { MotionCard } from '@/components/motion/MotionCard'
import { motion } from 'framer-motion'
import { useToast } from '@/hooks/use-toast'
import { useSocket } from '@/lib/socketClient'
import { useQueue } from '@/components/providers/QueueProvider'

export function PlayPageContent() {
  const router = useRouter()
  const startLocalGame = useLocalGameStore((state) => state.startLocalGame)
  const { toast } = useToast()
  const { inQueue, queueType } = useQueue()
  const [inGame, setInGame] = useState(false)
  const [activeGameId, setActiveGameId] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(true)
  const socket = useSocket()

  // Redirect to queue page if user is already in a queue
  useEffect(() => {
    if (inQueue && queueType) {
      console.log('[PlayPage] User already in queue, redirecting...', { queueType })
      router.push(`/play/queue?type=${queueType}`)
    }
  }, [inQueue, queueType, router])

  // Check if user has an active in-memory session via socket (memory-authoritative)
  // This replaces any database queries - socket is the single source of truth
  useEffect(() => {
    let mounted = true
    let connectHandler: (() => void) | null = null

    const handleSessionStatus = (payload: { active?: boolean; gameId?: string | null }) => {
      if (!mounted) return
      const isActive = !!payload?.active && !!payload?.gameId
      console.log('[PlayPage] session_status received (memory-authoritative)', {
        active: payload?.active,
        gameId: payload?.gameId,
      })
      setInGame(isActive)
      setActiveGameId(isActive ? String(payload!.gameId) : null)
      setIsChecking(false)
    }

    const emitCheckSession = () => {
      if (!mounted) return
      console.log('[PlayPage] Emitting check_active_session (socket-based, no DB query)')
      setIsChecking(true)
      socket.emit('check_active_session')
    }

    // Wait for socket connection before emitting
    if (socket.connected) {
      emitCheckSession()
    } else {
      console.log('[PlayPage] Socket not connected, waiting for connect event')
      connectHandler = () => {
        if (mounted) {
          emitCheckSession()
        }
      }
      socket.once('connect', connectHandler)
    }

    socket.on('session_status', handleSessionStatus)

    // Safety timeout: if server doesn't respond, assume no active session
    const timeoutId = setTimeout(() => {
      if (!mounted) return
      console.warn('[PlayPage] check_active_session timed out; assuming no active session')
      setInGame(false)
      setActiveGameId(null)
      setIsChecking(false)
      socket.off('session_status', handleSessionStatus)
    }, 5000)

    return () => {
      mounted = false
      clearTimeout(timeoutId)
      socket.off('session_status', handleSessionStatus)
      if (connectHandler) {
        socket.off('connect', connectHandler)
      }
    }
  }, [socket])

  const handlePlayLocal = () => {
    const gameId = `local-${crypto.randomUUID()}`
    startLocalGame()
    router.push(`/play/local/${gameId}`)
  }

  const joinQueue = (queueType: 'six_max' | 'heads_up') => {
    if (inGame) {
      toast({
        title: 'Cannot join queue',
        description: activeGameId
          ? 'You are currently in an active game. Rejoin your table or wait for it to finish.'
          : 'You are currently in an active game. Please finish your current game first.',
        variant: 'destructive',
      })
      return
    }
    if (inQueue) {
      toast({
        title: 'Already in queue',
        description: `You are already in the ${queueType === 'heads_up' ? 'Heads-Up' : '6-Max'} queue.`,
        variant: 'default',
      })
      return
    }
    console.log('[PlayPage] Navigating to queue', {
      queueType,
      inGame,
      isChecking,
      inQueue,
    })
    // Navigate to queue page - it will handle joining via sockets
    router.push(`/play/queue?type=${queueType}`)
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Find a Game Section */}
        <motion.section
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="bg-[#9A1F40] text-white px-6 py-4 rounded-t-xl">
            <h2 className="text-2xl font-bold">Find a Game</h2>
            <p className="text-sm text-white/80">Join an online multiplayer table</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-card border-x border-b rounded-b-xl">
            <MotionCard 
              className={inGame || inQueue ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} 
              onClick={() => !inGame && !inQueue && joinQueue('six_max')}
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="bg-primary/10 p-3 rounded-lg">
                    <Users className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">6-Max</h3>
                    <p className="text-sm text-muted-foreground">Up to 6 players</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-muted-foreground mb-4">
                  <div className="flex justify-between">
                    <span>Blinds:</span>
                    <span className="font-medium text-foreground">1/2</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Buy-in:</span>
                    <span className="font-medium text-foreground">200 chips</span>
                  </div>
                </div>
                <Button 
                  className="w-full" 
                  size="lg"
                  disabled={inGame || inQueue || isChecking}
                  onClick={() => joinQueue('six_max')}
                >
                  <Play className="mr-2 h-4 w-4" />
                  {inGame ? 'In Game' : inQueue ? 'Already in Queue' : 'Join Queue'}
                </Button>
              </CardContent>
            </MotionCard>

            <MotionCard 
              className={inGame || inQueue ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} 
              onClick={() => !inGame && !inQueue && joinQueue('heads_up')}
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="bg-primary/10 p-3 rounded-lg">
                    <User className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">Heads-Up</h3>
                    <p className="text-sm text-muted-foreground">2 players</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-muted-foreground mb-4">
                  <div className="flex justify-between">
                    <span>Blinds:</span>
                    <span className="font-medium text-foreground">1/2</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Buy-in:</span>
                    <span className="font-medium text-foreground">200 chips</span>
                  </div>
                </div>
                <Button 
                  className="w-full" 
                  size="lg"
                  disabled={inGame || inQueue || isChecking}
                  onClick={() => joinQueue('heads_up')}
                >
                  <Play className="mr-2 h-4 w-4" />
                  {inGame ? 'In Game' : inQueue ? 'Already in Queue' : 'Join Queue'}
                </Button>
              </CardContent>
            </MotionCard>
          </div>
        </motion.section>

        {/* Host a Game Section */}
        <motion.section
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="bg-[#9A1F40] text-white px-6 py-4 rounded-t-xl">
            <h2 className="text-2xl font-bold">Host a Game</h2>
            <p className="text-sm text-white/80">Play offline against AI bots</p>
          </div>
          <div className="p-6 bg-card border-x border-b rounded-b-xl">
            {inGame && activeGameId && (
              <div className="mb-4 flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  You have an active game. You can rejoin it here:
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    console.log('[PlayPage] Rejoining active game from lobby', {
                      gameId: activeGameId,
                    })
                    router.push(`/play/game/${activeGameId}`)
                  }}
                >
                  Rejoin Game
                </Button>
              </div>
            )}
            <MotionCard className="cursor-pointer" onClick={handlePlayLocal}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="bg-secondary/10 p-3 rounded-lg">
                    <Bot className="h-8 w-8 text-secondary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">Play Local</h3>
                    <p className="text-sm text-muted-foreground">Practice against 5 AI bots</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-muted-foreground mb-4">
                  <div className="flex justify-between">
                    <span>Mode:</span>
                    <span className="font-medium text-foreground">Offline</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Opponents:</span>
                    <span className="font-medium text-foreground">5 AI Bots</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Buy-in:</span>
                    <span className="font-medium text-foreground">Free (Practice)</span>
                  </div>
                </div>
                <Button variant="secondary" className="w-full" size="lg">
                  <Bot className="mr-2 h-4 w-4" />
                  Start Local Game
                </Button>
              </CardContent>
            </MotionCard>
          </div>
        </motion.section>
      </div>
    </div>
  )
}

