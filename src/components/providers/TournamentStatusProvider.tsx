'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSocket } from '@/lib/api/socket/client'
import { useStatus } from '@/components/providers/StatusProvider'
import { 
  TournamentActivePopup, 
  TournamentCompletedPopup, 
  TournamentCancelledPopup 
} from '@/components/features/tournament/TournamentActivePopup'
import { TournamentCompletedEvent, TournamentCancelledEvent } from '@/lib/types/tournament'

interface TournamentStatusData {
  inTournament: boolean
  tournamentId: string | null
  status: string | null
  title: string | null
  currentTableId: string | null
  isPlaying: boolean
}

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
  checkStatus: () => Promise<TournamentStatusData>
}

const TournamentStatusContext = createContext<TournamentStatusContextType>({
  inTournament: false,
  tournamentId: null,
  tournamentStatus: null,
  tournamentTitle: null,
  currentTableId: null,
  isPlaying: false,
  leaveTournament: () => {},
  goToTournament: () => {},
  showActivePopup: () => {},
  checkStatus: () => Promise.resolve({
    inTournament: false,
    tournamentId: null,
    status: null,
    title: null,
    currentTableId: null,
    isPlaying: false,
  }),
})

export const useTournamentStatus = () => useContext(TournamentStatusContext)

export function TournamentStatusProvider({ children }: { children: ReactNode }) {
  // Tournament state
  const [inTournament, setInTournament] = useState(false)
  const [tournamentId, setTournamentId] = useState<string | null>(null)
  const [tournamentStatus, setTournamentStatus] = useState<string | null>(null)
  const [tournamentTitle, setTournamentTitle] = useState<string | null>(null)
  const [currentTableId, setCurrentTableId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

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

  // Navigate to the appropriate tournament page
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

    socket.emit('unregister_tournament', { tournamentId }, (response: any) => {
      if (!response?.error) {
        setInTournament(false)
        setTournamentId(null)
        setTournamentStatus(null)
        setTournamentTitle(null)
        setCurrentTableId(null)
        setIsPlaying(false)
        clearStatus('tournament')
      }
    })
  }, [socket, tournamentId, isPlaying, clearStatus])

  // Show the active tournament popup
  const showActivePopup = useCallback(() => {
    if (inTournament) {
      setShowActive(true)
    }
  }, [inTournament])

  // Update status bar based on tournament state
  const updateStatusBar = useCallback((data: TournamentStatusData) => {
    if (!data.inTournament) {
      clearStatus('tournament')
      return
    }

    // Don't show status if already on a tournament page
    if (pathname?.startsWith('/play/tournaments')) {
      clearStatus('tournament')
      return
    }

    if (data.isPlaying && data.currentTableId) {
      setStatus({
        id: 'tournament',
        priority: 70,
        type: 'success',
        title: 'Tournament In Progress',
        message: data.title || 'You are playing in a tournament',
        action: {
          label: 'Go to Table',
          onClick: () => {
            router.push(`/play/tournaments/game/${data.currentTableId}`)
            clearStatus('tournament')
          },
        },
      })
    } else if (data.status === 'active' || data.status === 'paused') {
      setStatus({
        id: 'tournament',
        priority: 65,
        type: 'warning',
        title: 'Tournament Active',
        message: data.title || 'Your tournament is running',
        action: {
          label: 'Rejoin',
          onClick: () => {
            router.push(`/play/tournaments/${data.tournamentId}`)
            clearStatus('tournament')
          },
        },
      })
    } else if (data.status === 'registration') {
      setStatus({
        id: 'tournament',
        priority: 35,
        type: 'info',
        title: 'Tournament Registration',
        message: data.title || 'You are registered for a tournament',
        action: {
          label: 'View',
          onClick: () => {
            router.push(`/play/tournaments/${data.tournamentId}`)
            clearStatus('tournament')
          },
        },
      })
    }
  }, [pathname, setStatus, clearStatus, router])

  // Check tournament status (callable from components)
  const checkStatus = useCallback((): Promise<TournamentStatusData> => {
    return new Promise((resolve) => {
      if (!socket) {
        resolve({
          inTournament: false,
          tournamentId: null,
          status: null,
          title: null,
          currentTableId: null,
          isPlaying: false,
        })
        return
      }

      socket.emit('check_tournament_status', {}, (response: TournamentStatusData) => {
        if (response) {
          setInTournament(response.inTournament)
          setTournamentId(response.tournamentId)
          setTournamentStatus(response.status)
          setTournamentTitle(response.title)
          setCurrentTableId(response.currentTableId)
          setIsPlaying(response.isPlaying)
          updateStatusBar(response)
          resolve(response)
        } else {
          resolve({
            inTournament: false,
            tournamentId: null,
            status: null,
            title: null,
            currentTableId: null,
            isPlaying: false,
          })
        }
      })
    })
  }, [socket, updateStatusBar])

  // Clear tournament state helper
  const clearTournamentState = useCallback(() => {
    setInTournament(false)
    setTournamentId(null)
    setTournamentStatus(null)
    setTournamentTitle(null)
    setCurrentTableId(null)
    setIsPlaying(false)
    clearStatus('tournament')
  }, [clearStatus])

  useEffect(() => {
    if (!socket) return

    // Check tournament status on connect/mount
    const doCheckStatus = () => {
      socket.emit('check_tournament_status', {}, (response: TournamentStatusData) => {
        if (response) {
          setInTournament(response.inTournament)
          setTournamentId(response.tournamentId)
          setTournamentStatus(response.status)
          setTournamentTitle(response.title)
          setCurrentTableId(response.currentTableId)
          setIsPlaying(response.isPlaying)
          updateStatusBar(response)
        }
      })
    }

    if (socket.connected) doCheckStatus()
    socket.on('connect', doCheckStatus)

    // Handle tournament-reconnected event
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

      // Don't auto-redirect if already on tournament pages
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
        updateStatusBar({
          inTournament: true,
          tournamentId: data.tournamentId,
          status: data.status,
          title: data.title,
          currentTableId: data.currentTableId,
          isPlaying: data.isPlaying,
        })
      }
    }

    // Handle game-reconnected event (includes tournamentId for tournament games)
    const handleGameReconnected = (data: {
      gameId: string
      tournamentId?: string | null
      message?: string
    }) => {
      if (data.tournamentId) {
        // This is a tournament game - navigate to tournament game page
        setStatus({
          id: 'game-reconnect',
          priority: 80,
          type: 'success',
          title: 'Reconnecting to Game',
          message: data.message || 'Returning to your tournament table...',
        })

        setTimeout(() => {
          router.push(`/play/tournaments/game/${data.gameId}`)
          clearStatus('game-reconnect')
        }, 1500)
      } else {
        // Regular game - navigate to regular game page
        setStatus({
          id: 'game-reconnect',
          priority: 80,
          type: 'success',
          title: 'Reconnecting to Game',
          message: data.message || 'Returning to your game...',
        })

        setTimeout(() => {
          router.push(`/play/game/${data.gameId}`)
          clearStatus('game-reconnect')
        }, 1500)
      }
    }

    // Handle tournament status updates
    const handleTournamentStatusUpdate = (data: TournamentStatusData) => {
      setInTournament(data.inTournament)
      setTournamentId(data.tournamentId)
      setTournamentStatus(data.status)
      setTournamentTitle(data.title)
      setCurrentTableId(data.currentTableId)
      setIsPlaying(data.isPlaying)

      if (!data.inTournament) {
        clearStatus('tournament')
      } else {
        updateStatusBar(data)
      }
    }

    // Handle tournament completed
    const handleTournamentCompleted = (data: TournamentCompletedEvent) => {
      setCompletedData(data)
      setShowCompleted(true)
      clearTournamentState()
    }

    // Handle tournament cancelled
    const handleTournamentCancelled = (data: TournamentCancelledEvent) => {
      setCancelledReason(data.reason)
      setShowCancelled(true)
      clearTournamentState()
    }

    // Handle tournament event wrapper (if backend sends wrapped events)
    const handleTournamentEvent = (event: { type: string; payload: any }) => {
      switch (event.type) {
        case 'TOURNAMENT_COMPLETED':
          handleTournamentCompleted(event.payload)
          break
        case 'TOURNAMENT_CANCELLED':
          handleTournamentCancelled(event.payload)
          break
      }
    }

    // Handle errors (tournament-specific messages)
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

    socket.on('tournament-reconnected', handleTournamentReconnected)
    socket.on('game-reconnected', handleGameReconnected)
    socket.on('tournament_status', handleTournamentStatusUpdate)
    socket.on('TOURNAMENT_COMPLETED', handleTournamentCompleted)
    socket.on('TOURNAMENT_CANCELLED', handleTournamentCancelled)
    socket.on('tournamentEvent', handleTournamentEvent)
    socket.on('error', handleError)

    return () => {
      socket.off('connect', doCheckStatus)
      socket.off('tournament-reconnected', handleTournamentReconnected)
      socket.off('game-reconnected', handleGameReconnected)
      socket.off('tournament_status', handleTournamentStatusUpdate)
      socket.off('TOURNAMENT_COMPLETED', handleTournamentCompleted)
      socket.off('TOURNAMENT_CANCELLED', handleTournamentCancelled)
      socket.off('tournamentEvent', handleTournamentEvent)
      socket.off('error', handleError)
    }
  }, [socket, router, pathname, setStatus, clearStatus, updateStatusBar, checkStatus, clearTournamentState])

  // Re-check status when navigating to /play pages (but not tournament pages)
  useEffect(() => {
    if (
      socket?.connected &&
      pathname?.startsWith('/play') &&
      !pathname?.startsWith('/play/tournaments')
    ) {
      checkStatus()
    }
  }, [pathname, socket, checkStatus])

  // Clear status when on tournament pages
  useEffect(() => {
    if (pathname?.startsWith('/play/tournaments')) {
      clearStatus('tournament')
    }
  }, [pathname, clearStatus])

  // Popup handlers
  const handleCompletedViewResults = useCallback(() => {
    if (completedData?.tournamentId) {
      router.push(`/play/tournaments/${completedData.tournamentId}`)
    }
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
    <TournamentStatusContext.Provider
      value={{
        inTournament,
        tournamentId,
        tournamentStatus,
        tournamentTitle,
        currentTableId,
        isPlaying,
        leaveTournament,
        goToTournament,
        showActivePopup,
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
    </TournamentStatusContext.Provider>
  )
}
