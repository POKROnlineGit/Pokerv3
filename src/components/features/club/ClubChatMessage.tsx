'use client'

import { NormalizedClubMessage } from '@/lib/types/club'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { Gamepad2, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClubChatMessageProps {
  message: NormalizedClubMessage
  isOwnMessage: boolean
}

export function ClubChatMessage({ message, isOwnMessage }: ClubChatMessageProps) {
  const router = useRouter()

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
    }
  }

  // System messages
  if (message.messageType === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    )
  }

  // Game link messages
  if (message.messageType === 'game_link' && message.metadata.gameId) {
    return (
      <div className={cn(
        "flex flex-col max-w-[80%] mb-2",
        isOwnMessage ? "ml-auto items-end" : "mr-auto items-start"
      )}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium">{message.username}</span>
          <span className="text-xs text-muted-foreground">{formatTime(message.createdAt)}</span>
        </div>
        <div className={cn(
          "p-3 rounded-lg border",
          isOwnMessage ? "bg-primary/10 border-primary/20" : "bg-card border"
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Gamepad2 className="h-4 w-4 text-primary" />
            <span className="font-medium">Game Shared</span>
          </div>
          <p className="text-sm text-muted-foreground mb-2">
            {message.metadata.title || 'Private Game'}
            {message.metadata.blinds && ` (${message.metadata.blinds})`}
          </p>
          <Button
            size="sm"
            onClick={() => router.push(`/play/private/${message.metadata.gameId}`)}
            style={{
              backgroundColor: 'var(--theme-accent-0)',
              color: 'white',
            }}
          >
            Join Game
          </Button>
        </div>
      </div>
    )
  }

  // Tournament link messages
  if (message.messageType === 'tournament_link' && message.metadata.tournamentId) {
    return (
      <div className={cn(
        "flex flex-col max-w-[80%] mb-2",
        isOwnMessage ? "ml-auto items-end" : "mr-auto items-start"
      )}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium">{message.username}</span>
          <span className="text-xs text-muted-foreground">{formatTime(message.createdAt)}</span>
        </div>
        <div className={cn(
          "p-3 rounded-lg border",
          isOwnMessage ? "bg-primary/10 border-primary/20" : "bg-card border"
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="h-4 w-4 text-yellow-500" />
            <span className="font-medium">Tournament Shared</span>
          </div>
          <p className="text-sm text-muted-foreground mb-2">
            {message.metadata.title || 'Tournament'}
            {message.metadata.playerCount && ` (${message.metadata.playerCount} players)`}
          </p>
          <Button
            size="sm"
            onClick={() => router.push(`/play/tournaments/${message.metadata.tournamentId}`)}
            style={{
              backgroundColor: 'var(--theme-accent-0)',
              color: 'white',
            }}
          >
            View Tournament
          </Button>
        </div>
      </div>
    )
  }

  // Regular text messages
  return (
    <div className={cn(
      "flex flex-col max-w-[80%] mb-2",
      isOwnMessage ? "ml-auto items-end" : "mr-auto items-start"
    )}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium">{message.username}</span>
        <span className="text-xs text-muted-foreground">{formatTime(message.createdAt)}</span>
      </div>
      <div className={cn(
        "px-3 py-2 rounded-lg",
        isOwnMessage
          ? "bg-primary text-primary-foreground"
          : "bg-muted"
      )}>
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    </div>
  )
}
