'use client'

import { useEffect, useRef, useState } from 'react'
import { useClubApi, useClubRealtime } from '@/lib/api/http'
import { ClubMessage, NormalizedClubMessage, normalizeClubMessage } from '@/lib/types/club'
import { ClubChatMessage } from './ClubChatMessage'
import { ClubChatInput } from './ClubChatInput'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/lib/hooks'

interface ClubChatProps {
  clubId: string
  userId: string
}

export function ClubChat({ clubId, userId }: ClubChatProps) {
  const { getMessages, sendMessage } = useClubApi()
  const { toast } = useToast()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<NormalizedClubMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // Real-time message updates via Supabase Realtime
  useClubRealtime(clubId, {
    onMessage: (data) => {
      const normalized = normalizeClubMessage(data)
      setMessages((prev) => [...prev, normalized])
    },
  })

  // Load initial messages
  useEffect(() => {
    const loadMessages = async () => {
      setLoading(true)
      try {
        const result = await getMessages(clubId, undefined, 50)
        if ('error' in result) {
          toast({
            title: 'Error',
            description: result.error,
            variant: 'destructive',
          })
          return
        }
        // Messages come in descending order, reverse for display
        const normalizedMessages = result.messages
          .map(normalizeClubMessage)
          .reverse()
        setMessages(normalizedMessages)
        setHasMore(result.hasMore)
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to load messages',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    }

    loadMessages()
  }, [clubId])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load more messages (infinite scroll)
  const loadMoreMessages = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return

    setLoadingMore(true)
    try {
      const oldestMessage = messages[0]
      const result = await getMessages(clubId, oldestMessage.createdAt, 50)
      if ('error' in result) {
        return
      }
      const olderMessages = result.messages
        .map(normalizeClubMessage)
        .reverse()
      setMessages((prev) => [...olderMessages, ...prev])
      setHasMore(result.hasMore)
    } finally {
      setLoadingMore(false)
    }
  }

  // Handle scroll for infinite loading
  const handleScroll = () => {
    const container = messagesContainerRef.current
    if (!container) return

    if (container.scrollTop === 0 && hasMore && !loadingMore) {
      loadMoreMessages()
    }
  }

  const handleSend = async (content: string) => {
    const result = await sendMessage(clubId, content)
    if ('error' in result) {
      toast({
        title: 'Error',
        description: result.error,
        variant: 'destructive',
      })
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-1 bg-muted/30 rounded-lg m-3 border"
      >
        {loadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg) => (
            <ClubChatMessage
              key={msg.id}
              message={msg}
              isOwnMessage={msg.userId === userId}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <ClubChatInput onSend={handleSend} />
    </div>
  )
}
