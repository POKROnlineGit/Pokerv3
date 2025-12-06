'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { getSocket, disconnectSocket } from '@/lib/socketClient'
import { Loader2, X } from 'lucide-react'

export default function QueuePage() {
  const [queueCount, setQueueCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClientComponentClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queueType = (searchParams.get('type') as 'six_max' | 'heads_up') || 'six_max'
  const playersNeeded = queueType === 'heads_up' ? 2 : 6

  useEffect(() => {
    let queueChannel: any = null
    let queueCheckInterval: NodeJS.Timeout | null = null

    const joinQueue = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/')
          return
        }

        // Check if already in queue (use maybeSingle to avoid errors if not found)
        const { data: existing, error: checkError } = await supabase
          .from('queue')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()

        // If not in queue, join via API with queue_type
        if (!existing) {
          const response = await fetch('/api/queue/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queue_type: queueType }),
          })
          
          if (!response.ok) {
            // Try to parse JSON, but handle non-JSON responses
            let errorMessage = 'Failed to join queue'
            try {
              const contentType = response.headers.get('content-type')
              if (contentType && contentType.includes('application/json')) {
                const error = await response.json()
                errorMessage = error.error || errorMessage
              } else {
                const text = await response.text()
                errorMessage = text || errorMessage
              }
            } catch (parseError) {
              errorMessage = `HTTP ${response.status}: ${response.statusText}`
            }
            throw new Error(errorMessage)
          }
          
          // Parse response only if successful
          try {
            const result = await response.json()
            console.log('[Queue] Join response:', result)
          } catch (parseError) {
            // Response might be empty, that's okay
            console.log('[Queue] Join successful (no response body)')
          }
        } else {
          console.log('[Queue] Already in queue')
        }

        // Get current queue count for this queue type
        const updateQueueCount = async () => {
          const { data, error, count } = await supabase
            .from('queue')
            .select('id', { count: 'exact' })
            .eq('queue_type', queueType)

          if (!error) {
            setQueueCount(count || data?.length || 0)
            setLoading(false)
          }
        }

        await updateQueueCount()

        // Subscribe to queue changes via Postgres (filtered by queue_type)
        queueChannel = supabase.channel(`poker-queue-${queueType}`)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'queue',
            filter: `queue_type=eq.${queueType}`
          }, () => {
            updateQueueCount()
          })
          .subscribe()

        // Connect to Socket.io and listen for game_started event (optional)
        const socket = await getSocket()
        
        if (socket) {
          // Socket connected successfully
          socket.on('game_started', ({ gameId }: { gameId: string }) => {
            console.log('[Queue] Game started:', gameId)
            router.push(`/play/game/${gameId}`)
          })

          socket.emit('joinQueue', { queueType })
        } else {
          // Socket server not available - this is fine, we'll use polling fallback
          console.log('[Queue] Socket.io server not available - using polling fallback')
        }

        // Always set up polling fallback (works with or without socket)
        queueCheckInterval = setInterval(async () => {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) return

          // Check if user is in a game
          const { data: gamePlayer } = await supabase
            .from('game_players')
            .select('game_id')
            .eq('user_id', user.id)
            .single()

          if (gamePlayer) {
            router.push(`/play/game/${gamePlayer.game_id}`)
          }
        }, 2000)

      } catch (err: any) {
        setError(err.message)
        setLoading(false)
      }
    }

    joinQueue()

    return () => {
      if (queueChannel) {
        queueChannel.unsubscribe()
      }
      if (queueCheckInterval) {
        clearInterval(queueCheckInterval)
      }
      // Leave queue on socket when component unmounts (if connected)
      getSocket().then(socket => {
        if (socket) {
          socket.off('game_started')
          socket.emit('leaveQueue', { queueType })
        }
      }).catch(() => {
        // Socket not connected, ignore
      })
    }
  }, [supabase, router, queueType, playersNeeded])

  const handleLeaveQueue = async () => {
    try {
      const response = await fetch('/api/queue/leave', {
        method: 'POST',
      })
      
      if (!response.ok) {
        // Try to parse JSON, but handle non-JSON responses
        let errorMessage = 'Failed to leave queue'
        try {
          const contentType = response.headers.get('content-type')
          if (contentType && contentType.includes('application/json')) {
            const error = await response.json()
            errorMessage = error.error || errorMessage
          } else {
            const text = await response.text()
            errorMessage = text || errorMessage
          }
        } catch (parseError) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      router.push('/play')
    } catch (err: any) {
      setError(err.message)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-md mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Searching for Players...</CardTitle>
            <CardDescription>
              {queueType === 'heads_up' 
                ? 'Waiting for 1 more player to start a heads-up game'
                : `Waiting for ${playersNeeded - queueCount} more players to start a 6-max game`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-8">
              <div className="text-4xl font-bold text-primary mb-2">
                {queueCount}/{playersNeeded}
              </div>
              <p className="text-muted-foreground">
                {queueType === 'heads_up' ? 'Players in heads-up queue' : 'Players in 6-max queue'}
              </p>
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {error}
              </div>
            )}

            <Button
              variant="outline"
              className="w-full"
              onClick={handleLeaveQueue}
            >
              <X className="mr-2 h-4 w-4" />
              Leave Queue
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

