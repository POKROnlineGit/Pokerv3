'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { X, Loader2 } from 'lucide-react'
import { useSocket } from '@/lib/socketClient'
import { useQueue } from '@/components/providers/QueueProvider'
import { useTheme } from '@/components/providers/ThemeProvider'

export default function QueuePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentTheme } = useTheme()
  const type = (searchParams.get('type') as 'six_max' | 'heads_up') || 'six_max'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [queueStatus, setQueueStatus] = useState<{ count: number; needed: number; target: number } | null>(null)
  const supabase = createClientComponentClient()
  const socket = useSocket()
  const { leaveQueue } = useQueue()

  // Get theme colors
  const primaryColor = currentTheme.colors.primary[0]
  const gradientColors = currentTheme.colors.gradient
  const centerColor = currentTheme.colors.primary[2] || currentTheme.colors.primary[1]
  const accentColor = currentTheme.colors.accent[0]

  useEffect(() => {
    let mounted = true

    const handleConnect = () => {
      if (!mounted) return
      console.log('[QueuePage] Socket connected for queue', { queueType: type })
      setIsConnected(true)
      setLoading(false)
    }

    const handleDisconnect = () => {
      if (!mounted) return
      console.warn('[QueuePage] Socket disconnected while in queue', {
        queueType: type,
      })
      setIsConnected(false)
    }

    const handleMatchFound = (payload: { gameId: string }) => {
      if (!mounted) return
      if (payload?.gameId) {
        console.log('[QueuePage] match_found received, navigating to game', {
          queueType: type,
          gameId: payload.gameId,
        })
        router.push(`/play/game/${payload.gameId}`)
      }
    }

    const handleQueueUpdate = (payload: any) => {
      if (!mounted) return
      console.log('[QueuePage] Queue update received:', payload)
      setLoading(false)
    }

    const handleQueueInfo = (data: { queueType: string; count: number; needed: number; target: number }) => {
      if (!mounted) return
      console.log('[QueuePage] Received queue info:', data)
      if (data.queueType === type) {
        setQueueStatus(data)
      }
    }

    // Initial connected state (in case socket was already connected)
    setIsConnected(socket.connected)

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('match_found', handleMatchFound)
    socket.on('queue_update', handleQueueUpdate)
    socket.on('queue_info', handleQueueInfo)

    // Emit join_queue once connected (or immediately if already connected)
    const emitJoinQueue = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.warn('[QueuePage] No user found when attempting to join queue')
          router.push('/')
          return
        }

        console.log('[QueuePage] Emitting join_queue', {
          queueType: type,
          userId: user.id,
        })
        socket.emit('join_queue', { queueType: type })
      } catch (err: any) {
        console.error('[Queue] Error joining queue via socket:', err)
        if (mounted) {
          setError(err.message || 'Failed to join queue')
          setLoading(false)
        }
      }
    }

    if (socket.connected) {
      console.log('[QueuePage] Socket already connected, joining queue immediately')
      emitJoinQueue()
    } else {
      console.log('[QueuePage] Waiting for socket connect before joining queue')
      socket.once('connect', emitJoinQueue)
    }

    return () => {
      mounted = false
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('match_found', handleMatchFound)
      socket.off('queue_update', handleQueueUpdate)
      socket.off('queue_info', handleQueueInfo)
      socket.off('connect', emitJoinQueue)
    }
  }, [socket, supabase, router, type])

  const handleLeaveQueue = async () => {
    try {
      console.log('[QueuePage] Leaving queue via global action', { queueType: type })
      leaveQueue(type) // Clears global state + emits socket event
    } catch (err: any) {
      console.error('[Queue] Error leaving queue:', err)
    } finally {
      router.push('/play')
    }
  }

  const playersNeeded = type === 'heads_up' ? 2 : 6
  const playersWaiting = type === 'heads_up' ? 1 : 5

  if (loading) {
    return (
      <div className="min-h-screen relative">
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
        <div className="relative z-10">
          <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[60vh]">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative">
      {/* --- SCROLLABLE CONTENT LAYER --- */}
      <div className="relative z-10">
        <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          <Card className="bg-card">
          <CardHeader>
            <CardTitle>Searching for Players...</CardTitle>
            <CardDescription>
              {queueStatus
                ? `Players in queue: ${queueStatus.count} / ${queueStatus.target}`
                : type === 'heads_up'
                ? 'Waiting for 1 opponent...'
                : `Waiting for ${playersWaiting} more players...`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-8">
              <div className="text-3xl font-semibold mb-2" style={{ color: accentColor }}>
                {queueStatus
                  ? `Waiting for ${queueStatus.needed} more player${queueStatus.needed !== 1 ? 's' : ''}...`
                  : type === 'heads_up'
                  ? 'Searching for an opponent...'
                  : 'Searching for players...'}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {queueStatus
                  ? `Players in queue: ${queueStatus.count} / ${queueStatus.target}`
                  : "You'll be moved to the table automatically when a match is found."}
              </p>
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Matchmaking status</span>
              <span style={{ color: isConnected ? accentColor : '#ef4444' }}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={handleLeaveQueue}
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
              <X className="mr-2 h-4 w-4" />
              Leave Queue
            </Button>
          </CardContent>
          </Card>
        </div>
      </div>
      </div>
    </div>
  )
}
