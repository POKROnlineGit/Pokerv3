'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { Loader2, X } from 'lucide-react'

export default function QueuePage() {
  const [queueCount, setQueueCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClientComponentClient()
  const router = useRouter()

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

        // Check if already in queue
        const { data: existing } = await supabase
          .from('queue')
          .select('id')
          .eq('user_id', user.id)
          .single()

        if (!existing) {
          // Join queue via API
          const response = await fetch('/api/queue/join', {
            method: 'POST',
          })
          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || 'Failed to join queue')
          }
        }

        // Get current queue count
        const updateQueueCount = async () => {
          const { data, error } = await supabase
            .from('queue')
            .select('id', { count: 'exact' })

          if (!error && data) {
            setQueueCount(data.length)
            setLoading(false)
          }
        }

        await updateQueueCount()

        // Subscribe to queue changes via Postgres
        queueChannel = supabase.channel('poker-queue')
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'queue'
          }, () => {
            updateQueueCount()
          })
          .subscribe()

        // Check for game creation periodically
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
    }
  }, [supabase, router])

  const handleLeaveQueue = async () => {
    try {
      const response = await fetch('/api/queue/leave', {
        method: 'POST',
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to leave queue')
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
              Waiting for 6 players to start a game
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-8">
              <div className="text-4xl font-bold text-primary mb-2">
                {queueCount}/6
              </div>
              <p className="text-muted-foreground">Players in queue</p>
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

