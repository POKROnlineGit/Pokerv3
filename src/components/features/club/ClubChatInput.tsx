'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Send, Loader2, Plus } from 'lucide-react'

interface ClubChatInputProps {
  onSend: (content: string) => Promise<void>
  onCreateGame?: () => void
  disabled?: boolean
}

export function ClubChatInput({ onSend, onCreateGame, disabled }: ClubChatInputProps) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedMessage = message.trim()
    if (!trimmedMessage || sending || disabled) return

    setSending(true)
    try {
      await onSend(trimmedMessage)
      setMessage('')
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="p-3">
      <Card className="rounded-lg shadow-sm backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="flex gap-2 p-3">
          <Input
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            maxLength={500}
            disabled={sending || disabled}
            className="flex-1"
          />
          {onCreateGame && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onCreateGame}
              disabled={disabled}
              title="Create & Share Game"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="submit"
            size="icon"
            disabled={!message.trim() || sending || disabled}
            style={{
              backgroundColor: 'var(--theme-accent-0)',
              color: 'white',
            }}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </Card>
    </div>
  )
}
