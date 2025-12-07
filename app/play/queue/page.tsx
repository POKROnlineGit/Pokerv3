'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { X, Loader2 } from 'lucide-react'

export default function QueuePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const type = (searchParams.get('type') as 'six_max' | 'heads_up') || 'six_max'
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClientComponentClient()

  useEffect(() => {
    let mounted = true
    let queueChannel: any = null

    const joinQueue = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/')
          return
        }

        // Join queue via Supabase (UPSERT handles duplicates)
        const { error: joinError } = await supabase
          .from('queue')
          .upsert(
            { user_id: user.id, queue_type: type },
            { onConflict: 'user_id' }
          )

        if (joinError) {
          console.error('[Queue] Error joining queue:', joinError)
          if (mounted) {
            setError('Failed to join queue')
            setLoading(false)
          }
          return
        }

        // Get initial queue count
        const updateQueueCount = async () => {
          if (!mounted) return
          const { data, error: countError, count } = await supabase
            .from('queue')
            .select('id', { count: 'exact' })
            .eq('queue_type', type)

          if (!countError && mounted) {
            setCount(count || data?.length || 0)
            setLoading(false)
          }
        }

        await updateQueueCount()

        // Subscribe to queue changes via Realtime
        queueChannel = supabase
          .channel(`queue-${type}-${Date.now()}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'queue',
              filter: `queue_type=eq.${type}`,
            },
            () => {
              updateQueueCount()
            }
          )
          .subscribe()

        // Game creation is handled by global useGameRedirect hook
        // No need to subscribe here - the hook will redirect from any page

      } catch (err: any) {
        console.error('[Queue] Error:', err)
        if (mounted) {
          setError(err.message || 'Failed to join queue')
          setLoading(false)
        }
      }
    }

    joinQueue()

    // Cleanup
    return () => {
      mounted = false
      if (queueChannel) {
        queueChannel.unsubscribe()
      }
    }
  }, [type, router, supabase])

  const handleLeaveQueue = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from('queue')
          .delete()
          .eq('user_id', user.id)
      }
      router.push('/play')
    } catch (err: any) {
      console.error('[Queue] Error leaving queue:', err)
      router.push('/play')
    }
  }

  const playersNeeded = type === 'heads_up' ? 2 : 6
  const playersWaiting = type === 'heads_up' ? 1 : 5

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
              {type === 'heads_up' 
                ? 'Waiting for 1 opponent...'
                : `Waiting for ${playersWaiting} more players...`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-8">
              <div className="text-6xl font-bold text-primary mb-2">
                {count}/{playersNeeded}
              </div>
              <p className="text-muted-foreground mt-4">
                {type === 'heads_up' ? 'Players in heads-up queue' : 'Players in 6-max queue'}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Game starts automatically when full
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
