'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Play, Bot } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocalGameStore } from '@/lib/stores/useLocalGameStore'

export default function PlayPage() {
  const router = useRouter()
  const startLocalGame = useLocalGameStore((state) => state.startLocalGame)

  const handlePlayLocal = () => {
    const gameId = `local-${crypto.randomUUID()}`
    startLocalGame()
    router.push(`/play/game/${gameId}`)
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Find a Game</CardTitle>
            <CardDescription>
              Join a 6-max No-Limit Texas Hold&apos;em table
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Game Details</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Stakes: 1/2 play-money chips</li>
                <li>• Table Size: 6 players maximum</li>
                <li>• Format: No-Limit Texas Hold&apos;em</li>
              </ul>
            </div>
            <Link href="/play/queue">
              <Button size="lg" className="w-full text-lg py-6">
                <Play className="mr-2 h-5 w-5" />
                Find Game
              </Button>
            </Link>
            <Button
              size="lg"
              variant="secondary"
              className="w-full text-lg py-6"
              onClick={handlePlayLocal}
            >
              <Bot className="mr-2 h-5 w-5" />
              Play Local (vs Bots)
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

