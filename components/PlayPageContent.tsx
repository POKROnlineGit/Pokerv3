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
import { useTheme } from '@/components/providers/ThemeProvider'

export function PlayPageContent() {
  const router = useRouter()
  const startLocalGame = useLocalGameStore((state) => state.startLocalGame)
  const { toast } = useToast()
  const { inQueue, queueType } = useQueue()
  const { currentTheme } = useTheme()
  const [inGame, setInGame] = useState(false)
  const [activeGameId, setActiveGameId] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(true)
  const [isSocketConnected, setIsSocketConnected] = useState(false)
  const socket = useSocket()

  // Get theme colors
  const primaryColor = currentTheme.colors.primary[0] // Main primary color
  const gradientColors = currentTheme.colors.gradient
  const accentColor = currentTheme.colors.accent[0] // Main accent color
  const centerColor = currentTheme.colors.primary[2] || currentTheme.colors.primary[1] // Middle gradient color

  // Redirect to queue page if user is already in a queue
  useEffect(() => {
    if (inQueue && queueType) {
      console.log('[PlayPage] User already in queue, redirecting...', { queueType })
      router.push(`/play/queue?type=${queueType}`)
    }
  }, [inQueue, queueType, router])

  // Track socket connection status
  useEffect(() => {
    setIsSocketConnected(socket.connected)

    const handleConnect = () => {
      setIsSocketConnected(true)
    }

    const handleDisconnect = () => {
      setIsSocketConnected(false)
      // If socket disconnects while checking, keep checking state
      // This prevents buttons from being enabled when server is down
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
    }
  }, [socket])

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
      // Only set isChecking to false if socket is still connected
      if (socket.connected) {
        setIsChecking(false)
      }
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

    // Safety timeout: if server doesn't respond, only assume no active session if socket is connected
    // If socket is not connected, keep isChecking true to prevent buttons from being enabled
    const timeoutId = setTimeout(() => {
      if (!mounted) return
      if (socket.connected) {
        console.warn('[PlayPage] check_active_session timed out; assuming no active session')
        setInGame(false)
        setActiveGameId(null)
        setIsChecking(false)
        socket.off('session_status', handleSessionStatus)
      } else {
        console.warn('[PlayPage] check_active_session timed out but socket not connected; keeping buttons disabled')
        // Keep isChecking true if socket is not connected
        // This prevents buttons from being enabled when server is down
      }
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
    <div className="min-h-screen bg-black relative">
      {/* --- FIXED BACKGROUND LAYER --- */}
      <div
        className="fixed inset-0 z-0 overflow-hidden"
        style={{ willChange: "contents" }}
      >
        {/* Radial Gradient - dark on outsides, theme color in middle */}
        <div 
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at top, ${primaryColor} 0%, ${centerColor} 30%, ${gradientColors[1]} 60%, ${gradientColors[2]} 100%)`,
          }}
        />
        
        {/* Noise Texture */}
        <div
          className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Vignette */}
        <div className="absolute inset-0 bg-radial-gradient from-transparent to-black/80 pointer-events-none" />
      </div>

      {/* --- SCROLLABLE CONTENT LAYER --- */}
      <div className="relative z-10 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
        {/* Find a Game Section */}
        <section>
          <div 
            className="text-white px-6 py-4 rounded-t-xl"
            style={{ 
              background: `linear-gradient(to right, ${accentColor}, ${currentTheme.colors.accent[1] || accentColor})`,
            }}
          >
            <h2 className="text-2xl font-bold">Find a Game</h2>
            <p className="text-sm text-white/80">Join an online multiplayer table</p>
          </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-card rounded-b-xl">
            <MotionCard 
              className={`${inGame || inQueue ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} bg-card rounded-xl overflow-hidden`}
              onClick={() => !inGame && !inQueue && joinQueue('six_max')}
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div 
                    className="p-3 rounded-lg"
                    style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
                  >
                    <Users className="h-8 w-8" style={{ color: accentColor }} />
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
                  disabled={inGame || inQueue || isChecking || !isSocketConnected}
                  onClick={() => joinQueue('six_max')}
                  style={{
                    background: `linear-gradient(to right, ${accentColor}, ${currentTheme.colors.accent[1] || accentColor})`,
                    color: 'white',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `linear-gradient(to right, ${currentTheme.colors.accent[1] || accentColor}, ${currentTheme.colors.accent[2] || currentTheme.colors.accent[1] || accentColor})`
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = `linear-gradient(to right, ${accentColor}, ${currentTheme.colors.accent[1] || accentColor})`
                  }}
                >
                  <Play className="mr-2 h-4 w-4" />
                  {inGame ? 'In Game' : inQueue ? 'Already in Queue' : !isSocketConnected ? 'Connecting...' : 'Join Queue'}
                </Button>
              </CardContent>
            </MotionCard>

            <MotionCard 
              className={`${inGame || inQueue ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} bg-card rounded-xl overflow-hidden`}
              onClick={() => !inGame && !inQueue && joinQueue('heads_up')}
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div 
                    className="p-3 rounded-lg"
                    style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
                  >
                    <User className="h-8 w-8" style={{ color: accentColor }} />
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
                  disabled={inGame || inQueue || isChecking || !isSocketConnected}
                  onClick={() => joinQueue('heads_up')}
                  style={{
                    backgroundColor: accentColor,
                    color: 'white',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = currentTheme.colors.accent[1] || accentColor
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = accentColor
                  }}
                >
                  <Play className="mr-2 h-4 w-4" />
                  {inGame ? 'In Game' : inQueue ? 'Already in Queue' : !isSocketConnected ? 'Connecting...' : 'Join Queue'}
                </Button>
              </CardContent>
            </MotionCard>
          </div>
        </section>

        {/* Host a Game Section */}
        <section>
          <div 
            className="text-white px-6 py-4 rounded-t-xl"
            style={{ 
              background: `linear-gradient(to right, ${accentColor}, ${currentTheme.colors.accent[1] || accentColor})`,
            }}
          >
            <h2 className="text-2xl font-bold">Host a Game</h2>
            <p className="text-sm text-white/80">Play offline against AI bots</p>
          </div>
          <div className="p-6 bg-card rounded-b-xl">
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
                  style={{
                    borderColor: accentColor,
                    color: accentColor,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = accentColor
                    e.currentTarget.style.color = 'white'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = accentColor
                  }}
                >
                  Rejoin Game
                </Button>
              </div>
            )}
            <MotionCard className="cursor-pointer bg-card rounded-xl overflow-hidden" onClick={handlePlayLocal}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div 
                    className="p-3 rounded-lg"
                    style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
                  >
                    <Bot className="h-8 w-8" style={{ color: accentColor }} />
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
                <Button 
                  variant="secondary" 
                  className="w-full" 
                  size="lg"
                  style={{
                    background: `linear-gradient(to right, ${accentColor}, ${currentTheme.colors.accent[1] || accentColor})`,
                    color: 'white',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `linear-gradient(to right, ${currentTheme.colors.accent[1] || accentColor}, ${currentTheme.colors.accent[2] || currentTheme.colors.accent[1] || accentColor})`
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = `linear-gradient(to right, ${accentColor}, ${currentTheme.colors.accent[1] || accentColor})`
                  }}
                >
                  <Bot className="mr-2 h-4 w-4" />
                  Start Local Game
                </Button>
              </CardContent>
            </MotionCard>
          </div>
        </section>
        </div>
      </div>
    </div>
  )
}

