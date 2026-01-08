'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSocket } from '@/lib/socketClient'
import { useStatus } from '@/components/providers/StatusProvider'

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
  const pathname = usePathname()
  const { setStatus, clearStatus } = useStatus()

  const leaveQueue = useCallback((type: string) => {
    // Optimistic update: Clear state immediately
    setInQueue(false)
    setQueueType(null)
    setMatchFound(false)
    clearStatus('queue')
    // Emit event to server
    socket?.emit('leave_queue', { queueType: type })
  }, [socket, clearStatus])

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
      if (data.inQueue && data.queueType) {
        setStatus({
          id: 'queue',
          priority: 40,
          type: 'info',
          title: 'Looking for game...',
          message: `Waiting for ${
            data.queueType?.toLowerCase().includes('heads_up')
              ? 'Heads Up'
              : data.queueType?.toLowerCase().includes('10_max') || data.queueType?.toLowerCase().includes('ten_max')
              ? '10-Max'
              : '6-Max'
          }...`,
          action: {
            label: 'Leave',
            onClick: () => leaveQueue(data.queueType!),
          },
        })
      } else {
        clearStatus('queue')
      }
    })

    // 3. Listen for live updates (join success)
    socket.on('queue_update', (data: { queueType: string, status: string }) => {
      if (data.status === 'joined') {
        setInQueue(true)
        setQueueType(data.queueType)
        setStatus({
          id: 'queue',
          priority: 40,
          type: 'info',
          title: 'Looking for game...',
          message: `Waiting for ${
            data.queueType?.toLowerCase().includes('heads_up')
              ? 'Heads Up'
              : data.queueType?.toLowerCase().includes('10_max') || data.queueType?.toLowerCase().includes('ten_max')
              ? '10-Max'
              : '6-Max'
          }...`,
          action: {
            label: 'Leave',
            onClick: () => leaveQueue(data.queueType),
          },
        })
      }
    })

    // 4. Listen for leave events
    // Note: QueuePage emits 'leave_queue', but we should also listen for confirmation if desired
    // For now, we assume if the user initiates leave via UI, we locally clear state, 
    // but usually we rely on the server status check to be authoritative.

    // 5. THE 'SUCKED BACK IN' LOGIC
    socket.on('match_found', (data: { gameId: string }) => {
      setMatchFound(true)
      setStatus({
        id: 'queue',
        priority: 60,
        type: 'success',
        title: 'Game Found!',
        message: 'Joining table...',
      })
      // Add a small delay so they see 'Game Found!' on the popup before navigating
      setTimeout(() => {
        setInQueue(false)
        setQueueType(null)
        setMatchFound(false)
        clearStatus('queue')
        router.push(`/play/game/${data.gameId}`)
      }, 1500)
    })

    return () => {
      socket.off('connect', checkStatus)
      socket.off('queue_status')
      socket.off('queue_update')
      socket.off('match_found')
    }
  }, [socket, router, setStatus, clearStatus, leaveQueue])

  // Check queue status when navigating to /play or /play/online page
  useEffect(() => {
    if ((pathname === '/play' || pathname === '/play/online') && socket?.connected) {
      socket.emit('check_queue_status')
    }
  }, [pathname, socket])

  return (
    <QueueContext.Provider value={{ inQueue, queueType, matchFound, leaveQueue }}>
      {children}
    </QueueContext.Provider>
  )
}

