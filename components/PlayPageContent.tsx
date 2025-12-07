'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Play, Bot, Users, User } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useLocalGameStore } from '@/lib/stores/useLocalGameStore'
import { MotionCard } from '@/components/motion/MotionCard'
import { motion } from 'framer-motion'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { useToast } from '@/hooks/use-toast'

export function PlayPageContent() {
  const router = useRouter()
  const startLocalGame = useLocalGameStore((state) => state.startLocalGame)
  const { toast } = useToast()
  const supabase = createClientComponentClient()
  const [inGame, setInGame] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  // Check if user is in an active game
  useEffect(() => {
    const checkInGame = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
          setIsChecking(false)
          return
        }

        // Query active or starting games where user is a player
        const { data: games } = await supabase
          .from('games')
          .select('id, player_ids, players')
          .in('status', ['active', 'starting'])

        if (games && games.length > 0) {
          // Check if user is in any of these games
          const userInGame = games.some((g) => {
            // First check player_ids array (indexed, most efficient)
            if (g.player_ids && Array.isArray(g.player_ids)) {
              if (g.player_ids.some((id: any) => String(id) === String(user.id))) {
                return true
              }
            }
            // Fallback: check players JSONB directly
            if (g.players && Array.isArray(g.players)) {
              return g.players.some((p: any) => {
                const playerId = p?.id || p?.userId || p?.user_id
                return playerId && String(playerId) === String(user.id)
              })
            }
            return false
          })

          setInGame(userInGame)
        } else {
          setInGame(false)
        }
      } catch (error) {
        console.error('[PlayPage] Error checking game status:', error)
        setInGame(false)
      } finally {
        setIsChecking(false)
      }
    }

    checkInGame()

    // Subscribe to game changes to update inGame state
    const channel = supabase
      .channel('play-page-game-check')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'games',
          filter: 'status=in.(active,starting)',
        },
        () => {
          // Recheck when games change
          checkInGame()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  const handlePlayLocal = () => {
    const gameId = `local-${crypto.randomUUID()}`
    startLocalGame()
    router.push(`/play/local/${gameId}`)
  }

  const joinQueue = (queueType: 'six_max' | 'heads_up') => {
    if (inGame) {
      toast({
        title: 'Cannot join queue',
        description: 'You are currently in an active game. Please finish your current game first.',
        variant: 'destructive',
      })
      return
    }
    // Navigate to queue page - it will handle joining via Supabase Realtime
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
              className={inGame ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} 
              onClick={() => !inGame && joinQueue('six_max')}
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
                  disabled={inGame || isChecking}
                  onClick={() => joinQueue('six_max')}
                >
                  <Play className="mr-2 h-4 w-4" />
                  {inGame ? 'In Game' : 'Join Queue'}
                </Button>
              </CardContent>
            </MotionCard>

            <MotionCard 
              className={inGame ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} 
              onClick={() => !inGame && joinQueue('heads_up')}
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
                  disabled={inGame || isChecking}
                  onClick={() => joinQueue('six_max')}
                >
                  <Play className="mr-2 h-4 w-4" />
                  {inGame ? 'In Game' : 'Join Queue'}
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

