'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useSocket } from '@/lib/socketClient'
import { QueueStatusPopup } from '@/components/game/QueueStatusPopup'

interface QueueContextType {
  inQueue: boolean
  queueType: string | null
  matchFound: boolean
  leaveQueue: (type: string) => void
}

const QueueContext = createContext<QueueContextType>({
  inQueue: false,
  queueType: null,
  matchFound: false,
  leaveQueue: () => {},
})

export const useQueue = () => useContext(QueueContext)

export function QueueProvider({ children }: { children: ReactNode }) {
  const [inQueue, setInQueue] = useState(false)
  const [queueType, setQueueType] = useState<string | null>(null)
  const [matchFound, setMatchFound] = useState(false)
  const socket = useSocket()
  const router = useRouter()

  const leaveQueue = (type: string) => {
    // Optimistic update: Clear state immediately
    setInQueue(false)
    setQueueType(null)
    setMatchFound(false)
    // Emit event to server
    socket?.emit('leave_queue', { queueType: type })
  }

  useEffect(() => {
    if (!socket) return

    // 1. Ask server for status on connect/mount
    const checkStatus = () => {
      socket.emit('check_queue_status')
    }

    if (socket.connected) checkStatus()
    socket.on('connect', checkStatus)

    // 2. Listen for status response
    socket.on('queue_status', (data: { inQueue: boolean, queueType: string | null }) => {
      setInQueue(data.inQueue)
      setQueueType(data.queueType)
    })

    // 3. Listen for live updates (join success)
    socket.on('queue_update', (data: { queueType: string, status: string }) => {
      if (data.status === 'joined') {
        setInQueue(true)
        setQueueType(data.queueType)
      }
    })

    // 4. Listen for leave events
    // Note: QueuePage emits 'leave_queue', but we should also listen for confirmation if desired
    // For now, we assume if the user initiates leave via UI, we locally clear state, 
    // but usually we rely on the server status check to be authoritative.

    // 5. THE 'SUCKED BACK IN' LOGIC
    socket.on('match_found', (data: { gameId: string }) => {
      setMatchFound(true)
      // Optional: Add a small delay so they see 'Game Found!' on the popup before navigating
      setTimeout(() => {
        setInQueue(false)
        setQueueType(null)
        setMatchFound(false)
        router.push(`/play/game/${data.gameId}`)
      }, 1500)
    })

    return () => {
      socket.off('connect', checkStatus)
      socket.off('queue_status')
      socket.off('queue_update')
      socket.off('match_found')
    }
  }, [socket, router])

  return (
    <QueueContext.Provider value={{ inQueue, queueType, matchFound, leaveQueue }}>
      {children}
      {/* Render the Global Popup here so it appears on every page */}
      <QueueStatusPopup inQueue={inQueue} matchFound={matchFound} queueType={queueType} />
    </QueueContext.Provider>
  )
}

