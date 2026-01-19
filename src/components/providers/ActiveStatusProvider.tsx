'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSocket } from '@/lib/api/socket/client'
import { useStatus } from '@/components/providers/StatusProvider'
import {
  TournamentActivePopup,
  TournamentCompletedPopup,
  TournamentCancelledPopup
} from '@/components/features/tournament/TournamentActivePopup'
import { TournamentCompletedEvent, TournamentCancelledEvent } from '@/lib/types/tournament'

// Response type from check_active_status
interface ActiveStatusResponse {
  game: {
    gameId: string
    isTournament: boolean
    tournamentId: string | null
    status: 'active' | 'starting' | 'waiting'
    isSpectating?: boolean
  } | null
  tournament: {
    tournamentId: string
    title: string
    status: 'setup' | 'registration' | 'active' | 'paused'
    isHost: boolean
    isParticipant: boolean
    participantStatus: 'registered' | 'active' | null
    tableId: string | null
  } | null
  queue: {
    queueType: string
    position: number
    joinedAt: number
  } | null
  error?: string
}

// Full context type
interface ActiveStatusContextType {
  // Queue state
  inQueue: boolean
  queueType: string | null
  matchFound: boolean
  leaveQueue: (type: string) => void

  // Tournament state
  inTournament: boolean
  tournamentId: string | null
  tournamentStatus: string | null
  tournamentTitle: string | null
  currentTableId: string | null
  isPlaying: boolean
  isHost: boolean
  leaveTournament: () => void
  goToTournament: () => void
  showActivePopup: () => void

  // Shared
  checkStatus: () => Promise<void>
}

// Queue-only context type for backward compatibility
interface QueueContextType {
  inQueue: boolean
  queueType: string | null
  matchFound: boolean
  leaveQueue: (type: string) => void
}

// Tournament-only context type for backward compatibility
interface TournamentStatusContextType {
  inTournament: boolean
  tournamentId: string | null
  tournamentStatus: string | null
  tournamentTitle: string | null
  currentTableId: string | null
  isPlaying: boolean
  leaveTournament: () => void
  goToTournament: () => void
  showActivePopup: () => void
  checkStatus: () => Promise<{ inTournament: boolean; tournamentId: string | null; status: string | null; title: string | null; currentTableId: string | null; isPlaying: boolean }>
}

const ActiveStatusContext = createContext<ActiveStatusContextType>({
  // Queue defaults
  inQueue: false,
  queueType: null,
  matchFound: false,
  leaveQueue: () => {},

  // Tournament defaults
  inTournament: false,
  tournamentId: null,
  tournamentStatus: null,
  tournamentTitle: null,
  currentTableId: null,
  isPlaying: false,
  isHost: false,
  leaveTournament: () => {},
  goToTournament: () => {},
  showActivePopup: () => {},

  // Shared
  checkStatus: () => Promise.resolve(),
})

export const useActiveStatus = () => useContext(ActiveStatusContext)

// Backward-compatible hook for queue functionality
export const useQueue = (): QueueContextType => {
  const context = useContext(ActiveStatusContext)
  return {
    inQueue: context.inQueue,
    queueType: context.queueType,
    matchFound: context.matchFound,
    leaveQueue: context.leaveQueue,
  }
}

// Backward-compatible hook for tournament status functionality
export const useTournamentStatus = (): TournamentStatusContextType => {
  const context = useContext(ActiveStatusContext)
  return {
    inTournament: context.inTournament,
    tournamentId: context.tournamentId,
    tournamentStatus: context.tournamentStatus,
    tournamentTitle: context.tournamentTitle,
    currentTableId: context.currentTableId,
    isPlaying: context.isPlaying,
    leaveTournament: context.leaveTournament,
    goToTournament: context.goToTournament,
    showActivePopup: context.showActivePopup,
    checkStatus: async () => {
      await context.checkStatus()
      return {
        inTournament: context.inTournament,
        tournamentId: context.tournamentId,
        status: context.tournamentStatus,
        title: context.tournamentTitle,
        currentTableId: context.currentTableId,
        isPlaying: context.isPlaying,
      }
    },
  }
}

// Helper to format queue type for display
function formatQueueType(queueType: string | null): string {
  if (!queueType) return 'game'
  const lower = queueType.toLowerCase()
  if (lower.includes('heads_up')) return 'Heads Up'
  if (lower.includes('10_max') || lower.includes('ten_max')) return '10-Max'
  return '6-Max'
}

export function ActiveStatusProvider({ children }: { children: ReactNode }) {
  // Queue state
  const [inQueue, setInQueue] = useState(false)
  const [queueType, setQueueType] = useState<string | null>(null)
  const [matchFound, setMatchFound] = useState(false)

  // Tournament state
  const [inTournament, setInTournament] = useState(false)
  const [tournamentId, setTournamentId] = useState<string | null>(null)
  const [tournamentStatus, setTournamentStatus] = useState<string | null>(null)
  const [tournamentTitle, setTournamentTitle] = useState<string | null>(null)
  const [currentTableId, setCurrentTableId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const lastTournamentIdRef = useRef<string | null>(null)

  // Popup states
  const [showActive, setShowActive] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)
  const [completedData, setCompletedData] = useState<TournamentCompletedEvent | null>(null)
  const [cancelledReason, setCancelledReason] = useState<string | null>(null)

  const socket = useSocket()
  const router = useRouter()
  const pathname = usePathname()
  const { setStatus, clearStatus } = useStatus()

  // Keep a last-known tournament id around for cases where completion payload is missing/aliased.
  useEffect(() => {
    if (tournamentId) lastTournamentIdRef.current = tournamentId
  }, [tournamentId])

  // Get current user ID
  useEffect(() => {
    const getUserId = async () => {
      const { createClientComponentClient } = await import('@/lib/api/supabase/client')
      const supabase = createClientComponentClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
      }
    }
    getUserId()
  }, [])

  // Leave queue
  const leaveQueue = useCallback((type: string) => {
    setInQueue(false)
    setQueueType(null)
    setMatchFound(false)
    clearStatus('queue')
    socket?.emit('leave_queue', { queueType: type })
  }, [socket, clearStatus])

  // Navigate to tournament
  const goToTournament = useCallback(() => {
    if (!tournamentId) return

    if (isPlaying && currentTableId) {
      router.push(`/play/tournaments/game/${currentTableId}`)
    } else {
      router.push(`/play/tournaments/${tournamentId}`)
    }
    clearStatus('tournament')
    setShowActive(false)
  }, [tournamentId, isPlaying, currentTableId, router, clearStatus])

  // Leave/unregister from tournament
  const leaveTournament = useCallback(() => {
    if (!tournamentId || !socket || isPlaying) return

    socket.emit('unregister_tournament', { tournamentId }, (response: { error?: string }) => {
      if (!response?.error) {
        setInTournament(false)
        setTournamentId(null)
        setTournamentStatus(null)
        setTournamentTitle(null)
        setCurrentTableId(null)
        setIsPlaying(false)
        setIsHost(false)
        clearStatus('tournament')
      }
    })
  }, [socket, tournamentId, isPlaying, clearStatus])

  // Show active tournament popup
  const showActivePopup = useCallback(() => {
    if (inTournament) {
      setShowActive(true)
    }
  }, [inTournament])

  // Clear tournament state helper
  const clearTournamentState = useCallback(() => {
    setInTournament(false)
    setTournamentId(null)
    setTournamentStatus(null)
    setTournamentTitle(null)
    setCurrentTableId(null)
    setIsPlaying(false)
    setIsHost(false)
    clearStatus('tournament')
  }, [clearStatus])

  // Helper to update tournament status bar
  const updateTournamentStatusBar = useCallback((tournament: ActiveStatusResponse['tournament']) => {
    if (!tournament) {
      clearStatus('tournament')
      return
    }

    // Don't show status if on tournament pages
    if (pathname?.startsWith('/play/tournaments')) {
      clearStatus('tournament')
      return
    }

    const { tournamentId, title, status, isHost, tableId, participantStatus } = tournament
    const isPlaying = participantStatus === 'active' && !!tableId

    if (isPlaying && tableId) {
      setStatus({
        id: 'tournament',
        priority: 70,
        type: 'success',
        title: isHost ? 'Hosting Tournament' : 'In Tournament',
        message: 'Tournament in progress',
        action: {
          label: 'Go to Table',
          onClick: () => {
            router.push(`/play/tournaments/game/${tableId}`)
            clearStatus('tournament')
          },
        },
      })
    } else if (status === 'active' || status === 'paused') {
      setStatus({
        id: 'tournament',
        priority: 65,
        type: 'warning',
        title: isHost ? 'Hosting Tournament' : 'In Tournament',
        message: `Tournament ${status === 'paused' ? 'paused' : 'running'}`,
        action: {
          label: 'Return',
          onClick: () => {
            router.push(`/play/tournaments/${tournamentId}`)
            clearStatus('tournament')
          },
        },
      })
    } else if (status === 'registration') {
      setStatus({
        id: 'tournament',
        priority: isHost ? 40 : 35,
        type: 'info',
        title: isHost ? 'Hosting Tournament' : 'In Tournament',
        message: isHost ? 'Registration open' : 'Waiting for start...',
        action: {
          label: isHost ? 'Return' : 'View',
          onClick: () => {
            router.push(`/play/tournaments/${tournamentId}`)
            clearStatus('tournament')
          },
        },
      })
    } else if (status === 'setup') {
      // Only show setup status for hosts
      if (isHost) {
        setStatus({
          id: 'tournament',
          priority: 40,
          type: 'info',
          title: 'Hosting Tournament',
          message: 'Setting up tournament...',
          action: {
            label: 'Return',
            onClick: () => {
              router.push(`/play/tournaments/${tournamentId}`)
              clearStatus('tournament')
            },
          },
        })
      }
    }
  }, [pathname, setStatus, clearStatus, router])

  // Helper to update queue status bar
  const updateQueueStatusBar = useCallback((queue: ActiveStatusResponse['queue']) => {
    if (!queue) {
      clearStatus('queue')
      return
    }

    setStatus({
      id: 'queue',
      priority: 40,
      type: 'info',
      title: 'Looking for game...',
      message: `Waiting for ${formatQueueType(queue.queueType)}...`,
      action: {
        label: 'Leave',
        onClick: () => leaveQueue(queue.queueType),
      },
    })
  }, [setStatus, clearStatus, leaveQueue])

  // Main status check function - uses check_active_status
  const checkStatus = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      if (!socket) {
        resolve()
        return
      }

      socket.emit('check_active_status', (response: ActiveStatusResponse) => {
        if (!response || response.error) {
          resolve()
          return
        }

        // Update queue state
        if (response.queue) {
          setInQueue(true)
          setQueueType(response.queue.queueType)
        } else {
          setInQueue(false)
          setQueueType(null)
        }

        // Update tournament state
        if (response.tournament) {
          setInTournament(true)
          setTournamentId(response.tournament.tournamentId)
          setTournamentStatus(response.tournament.status)
          setTournamentTitle(response.tournament.title)
          setCurrentTableId(response.tournament.tableId)
          setIsPlaying(response.tournament.participantStatus === 'active' && !!response.tournament.tableId)
          setIsHost(response.tournament.isHost)
        } else {
          setInTournament(false)
          setTournamentId(null)
          setTournamentStatus(null)
          setTournamentTitle(null)
          setCurrentTableId(null)
          setIsPlaying(false)
          setIsHost(false)
        }

        // Update status bars
        updateQueueStatusBar(response.queue)
        updateTournamentStatusBar(response.tournament)

        resolve()
      })
    })
  }, [socket, updateQueueStatusBar, updateTournamentStatusBar])

  // Main socket effect
  useEffect(() => {
    if (!socket) return

    // Check status on connect/mount using check_active_status
    const doCheckStatus = () => {
      socket.emit('check_active_status', (response: ActiveStatusResponse) => {
        if (!response || response.error) {
          return
        }

        // Handle active game (including spectating)
        if (response.game) {
          const { gameId, isTournament, tournamentId: gameTournamentId, isSpectating } = response.game

          // Don't redirect if already on the correct page
          if (!pathname?.includes(gameId)) {
            if (isSpectating && gameTournamentId) {
              // Spectating a tournament table - redirect to spectate page
              setStatus({
                id: 'game-reconnect',
                priority: 80,
                type: 'success',
                title: 'Reconnecting to Spectate',
                message: 'Returning to spectate...',
              })
              setTimeout(() => {
                router.push(`/play/tournaments/${gameTournamentId}/spectate/${gameId}`)
                clearStatus('game-reconnect')
              }, 1500)
              return
            } else if (isTournament && gameTournamentId) {
              // Active tournament game - redirect to tournament game page
              setStatus({
                id: 'game-reconnect',
                priority: 80,
                type: 'success',
                title: 'Reconnecting',
                message: 'Returning to game...',
              })
              setTimeout(() => {
                router.push(`/play/tournaments/game/${gameId}`)
                clearStatus('game-reconnect')
              }, 1500)
              return
            }
          }
        }

        // Update queue state
        if (response.queue) {
          setInQueue(true)
          setQueueType(response.queue.queueType)
        } else {
          setInQueue(false)
          setQueueType(null)
        }

        // Update tournament state
        if (response.tournament) {
          setInTournament(true)
          setTournamentId(response.tournament.tournamentId)
          setTournamentStatus(response.tournament.status)
          setTournamentTitle(response.tournament.title)
          setCurrentTableId(response.tournament.tableId)
          setIsPlaying(response.tournament.participantStatus === 'active' && !!response.tournament.tableId)
          setIsHost(response.tournament.isHost)
        } else {
          setInTournament(false)
          setTournamentId(null)
          setTournamentStatus(null)
          setTournamentTitle(null)
          setCurrentTableId(null)
          setIsPlaying(false)
          setIsHost(false)
        }

        // Update status bars
        updateQueueStatusBar(response.queue)
        updateTournamentStatusBar(response.tournament)
      })
    }

    if (socket.connected) doCheckStatus()
    socket.on('connect', doCheckStatus)

    // Queue events - ALWAYS set status, let StatusOverlay handle display logic
    const handleQueueStatus = (data: { inQueue: boolean; queueType: string | null }) => {
      setInQueue(data.inQueue)
      setQueueType(data.queueType)
      if (data.inQueue && data.queueType) {
        setStatus({
          id: 'queue',
          priority: 40,
          type: 'info',
          title: 'Looking for game...',
          message: `Waiting for ${formatQueueType(data.queueType)}...`,
          action: {
            label: 'Leave',
            onClick: () => leaveQueue(data.queueType!),
          },
        })
      } else {
        clearStatus('queue')
      }
    }

    const handleQueueUpdate = (data: { queueType: string; status: string }) => {
      if (data.status === 'joined') {
        setInQueue(true)
        setQueueType(data.queueType)
        setStatus({
          id: 'queue',
          priority: 40,
          type: 'info',
          title: 'Looking for game...',
          message: `Waiting for ${formatQueueType(data.queueType)}...`,
          action: {
            label: 'Leave',
            onClick: () => leaveQueue(data.queueType),
          },
        })
      }
    }

    const handleMatchFound = (data: { gameId: string }) => {
      setMatchFound(true)
      setStatus({
        id: 'queue',
        priority: 60,
        type: 'success',
        title: 'Game Found!',
        message: 'Joining table...',
      })
      setTimeout(() => {
        setInQueue(false)
        setQueueType(null)
        setMatchFound(false)
        clearStatus('queue')
        router.push(`/play/game/${data.gameId}`)
      }, 1500)
    }

    // Tournament events
    const handleTournamentReconnected = (data: {
      tournamentId: string
      status: string
      title: string
      currentTableId: string | null
      isPlaying: boolean
      message?: string
    }) => {
      setInTournament(true)
      setTournamentId(data.tournamentId)
      setTournamentStatus(data.status)
      setTournamentTitle(data.title)
      setCurrentTableId(data.currentTableId)
      setIsPlaying(data.isPlaying)

      if (pathname?.startsWith('/play/tournaments')) {
        return
      }

      if (data.isPlaying && data.currentTableId) {
        setStatus({
          id: 'tournament',
          priority: 80,
          type: 'success',
          title: 'Reconnecting to Tournament',
          message: data.message || 'Returning to your table...',
        })

        setTimeout(() => {
          router.push(`/play/tournaments/game/${data.currentTableId}`)
          clearStatus('tournament')
        }, 1500)
      } else {
        checkStatus()
      }
    }

    const handleGameReconnected = (data: {
      gameId: string
      tournamentId?: string | null
      message?: string
      isSpectating?: boolean
    }) => {
      setStatus({
        id: 'game-reconnect',
        priority: 80,
        type: 'success',
        title: data.isSpectating ? 'Reconnecting to Spectate' : 'Reconnecting',
        message: data.message || (data.isSpectating ? 'Returning to spectate...' : 'Returning to game...'),
      })

      setTimeout(() => {
        if (data.isSpectating && data.tournamentId) {
          // Navigate to spectate page
          router.push(`/play/tournaments/${data.tournamentId}/spectate/${data.gameId}`)
        } else if (data.tournamentId) {
          router.push(`/play/tournaments/game/${data.gameId}`)
        } else {
          router.push(`/play/game/${data.gameId}`)
        }
        clearStatus('game-reconnect')
      }, 1500)
    }

    const handleTournamentStatusUpdate = (data: {
      inTournament: boolean
      tournamentId: string | null
      status: string | null
      title: string | null
      currentTableId: string | null
      isPlaying: boolean
    }) => {
      setInTournament(data.inTournament)
      setTournamentId(data.tournamentId)
      setTournamentStatus(data.status)
      setTournamentTitle(data.title)
      setCurrentTableId(data.currentTableId)
      setIsPlaying(data.isPlaying)

      if (!data.inTournament) {
        clearStatus('tournament')
      } else {
        checkStatus()
      }
    }

    const handleTournamentCompleted = (data: TournamentCompletedEvent | any) => {
      const resolvedTournamentId =
        data?.tournamentId ??
        data?.tournament_id ??
        lastTournamentIdRef.current

      const normalized: TournamentCompletedEvent = {
        tournamentId: resolvedTournamentId || '',
        winnerId: data?.winnerId ?? data?.winner_id ?? '',
        winnerUsername: data?.winnerUsername ?? data?.winner_username ?? null,
        results: Array.isArray(data?.results) ? data.results : [],
        timestamp: data?.timestamp ?? new Date().toISOString(),
      }

      if (normalized.tournamentId) lastTournamentIdRef.current = normalized.tournamentId

      setCompletedData(normalized)
      setShowCompleted(true)
      clearTournamentState()
    }

    const handleTournamentCancelled = (data: TournamentCancelledEvent) => {
      setCancelledReason(data.reason)
      setShowCancelled(true)
      clearTournamentState()
    }

    const handleTournamentEvent = (event: { type: string; payload: TournamentCompletedEvent | TournamentCancelledEvent }) => {
      switch (event.type) {
        case 'TOURNAMENT_COMPLETED':
          handleTournamentCompleted(event.payload as TournamentCompletedEvent)
          break
        case 'TOURNAMENT_CANCELLED':
          handleTournamentCancelled(event.payload as TournamentCancelledEvent)
          break
      }
    }

    const handleError = (error: { message?: string }) => {
      if (error.message?.toLowerCase().includes('tournament')) {
        setStatus({
          id: 'tournament-error',
          priority: 50,
          type: 'warning',
          title: 'Tournament Conflict',
          message: error.message,
          action: {
            label: 'Check Status',
            onClick: () => {
              checkStatus()
              clearStatus('tournament-error')
            },
          },
        })
      }
    }

    // Register all listeners
    socket.on('queue_status', handleQueueStatus)
    socket.on('queue_update', handleQueueUpdate)
    socket.on('match_found', handleMatchFound)
    socket.on('tournament-reconnected', handleTournamentReconnected)
    socket.on('game-reconnected', handleGameReconnected)
    socket.on('tournament_status', handleTournamentStatusUpdate)
    socket.on('TOURNAMENT_COMPLETED', handleTournamentCompleted)
    socket.on('TOURNAMENT_CANCELLED', handleTournamentCancelled)
    socket.on('tournamentEvent', handleTournamentEvent)
    socket.on('error', handleError)

    return () => {
      socket.off('connect', doCheckStatus)
      socket.off('queue_status', handleQueueStatus)
      socket.off('queue_update', handleQueueUpdate)
      socket.off('match_found', handleMatchFound)
      socket.off('tournament-reconnected', handleTournamentReconnected)
      socket.off('game-reconnected', handleGameReconnected)
      socket.off('tournament_status', handleTournamentStatusUpdate)
      socket.off('TOURNAMENT_COMPLETED', handleTournamentCompleted)
      socket.off('TOURNAMENT_CANCELLED', handleTournamentCancelled)
      socket.off('tournamentEvent', handleTournamentEvent)
      socket.off('error', handleError)
    }
  }, [socket, router, pathname, setStatus, clearStatus, leaveQueue, checkStatus, clearTournamentState, updateQueueStatusBar, updateTournamentStatusBar])

  // Re-check status when navigating to /play pages (but not tournament/queue pages)
  useEffect(() => {
    if (socket?.connected && pathname?.startsWith('/play')) {
      // Don't re-check if already on relevant pages
      if (!pathname?.startsWith('/play/tournaments') &&
          pathname !== '/play/online' &&
          !pathname?.startsWith('/play/queue')) {
        checkStatus()
      }
    }
  }, [pathname, socket, checkStatus])

  // Clear tournament status when on tournament pages (matches original behavior)
  useEffect(() => {
    if (pathname?.startsWith('/play/tournaments')) {
      clearStatus('tournament')
    }
  }, [pathname, clearStatus])

  // NOTE: Queue status is NOT cleared when on queue pages - StatusOverlay handles hiding it.
  // This allows the status to show immediately when navigating away from queue pages.

  // Popup handlers
  const handleCompletedViewResults = useCallback(() => {
    const id = completedData?.tournamentId || lastTournamentIdRef.current
    if (id) router.push(`/play/tournaments/${id}/results`)
    else router.push('/play/tournaments')
    setShowCompleted(false)
    setCompletedData(null)
  }, [completedData, router])

  const handleCompletedBackToLobby = useCallback(() => {
    router.push('/play/tournaments')
    setShowCompleted(false)
    setCompletedData(null)
  }, [router])

  const handleCancelledBackToLobby = useCallback(() => {
    router.push('/play/tournaments')
    setShowCancelled(false)
    setCancelledReason(null)
  }, [router])

  return (
    <ActiveStatusContext.Provider
      value={{
        // Queue
        inQueue,
        queueType,
        matchFound,
        leaveQueue,
        // Tournament
        inTournament,
        tournamentId,
        tournamentStatus,
        tournamentTitle,
        currentTableId,
        isPlaying,
        isHost,
        leaveTournament,
        goToTournament,
        showActivePopup,
        // Shared
        checkStatus,
      }}
    >
      {children}

      {/* Active Tournament Popup */}
      <TournamentActivePopup
        open={showActive}
        title={tournamentTitle}
        isPlaying={isPlaying}
        tableId={currentTableId}
        tournamentId={tournamentId}
        onGoToTournament={goToTournament}
        onDismiss={() => setShowActive(false)}
      />

      {/* Tournament Completed Popup */}
      <TournamentCompletedPopup
        open={showCompleted}
        tournamentId={completedData?.tournamentId || ''}
        winnerId={completedData?.winnerId || ''}
        winnerUsername={completedData?.winnerUsername || null}
        isCurrentUserWinner={completedData?.winnerId === currentUserId}
        onViewResults={handleCompletedViewResults}
        onBackToLobby={handleCompletedBackToLobby}
      />

      {/* Tournament Cancelled Popup */}
      <TournamentCancelledPopup
        open={showCancelled}
        reason={cancelledReason}
        onBackToLobby={handleCancelledBackToLobby}
      />
    </ActiveStatusContext.Provider>
  )
}
