'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClubSocket, useClubEvents } from '@/lib/api/socket'
import {
  NormalizedClub,
  NormalizedClubMember,
  normalizeClub,
  normalizeClubMember,
} from '@/lib/types/club'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ClubChat } from './ClubChat'
import { ClubStats } from './ClubStats'
import { ClubSidebar } from './ClubSidebar'
import { Loader2, MessageSquare, BarChart3 } from 'lucide-react'
import { useToast } from '@/lib/hooks'
import { useIsMobile } from '@/lib/hooks'
import { cn } from '@/lib/utils'

interface ClubPageProps {
  club: NormalizedClub
  isLeader: boolean
  userId: string
  onLeave: () => void
}

export function ClubPage({ club: initialClub, isLeader: initialIsLeader, userId, onLeave }: ClubPageProps) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { getClubState } = useClubSocket()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [club, setClub] = useState<NormalizedClub>(initialClub)
  const [members, setMembers] = useState<NormalizedClubMember[]>([])
  const [isLeader, setIsLeader] = useState(initialIsLeader)
  const [showSidebar, setShowSidebar] = useState(!isMobile)

  // Real-time updates
  const { disbanded, memberCount } = useClubEvents(club.id, {
    onClubDisbanded: () => {
      toast({
        title: 'Club disbanded',
        description: 'This club has been disbanded',
        variant: 'destructive',
      })
      onLeave()
    },
    onMemberJoined: (data) => {
      // Refetch members
      fetchClubState()
    },
    onMemberLeft: (data) => {
      // Check if it's the current user
      if (data.userId === userId) {
        onLeave()
        return
      }
      // Remove from local state
      setMembers((prev) => prev.filter((m) => m.userId !== data.userId))
    },
    onMemberBanned: (data) => {
      // Check if it's the current user
      if (data.userId === userId) {
        toast({
          title: 'You have been removed',
          description: data.reason || 'You have been removed from the club',
          variant: 'destructive',
        })
        onLeave()
        return
      }
      // Remove from local state
      setMembers((prev) => prev.filter((m) => m.userId !== data.userId))
    },
    onSettingsUpdated: (data) => {
      setClub(normalizeClub(data.club))
    },
  })

  const fetchClubState = async () => {
    try {
      const result = await getClubState(club.id)
      if ('error' in result) {
        toast({
          title: 'Error',
          description: result.error,
          variant: 'destructive',
        })
        return
      }
      setClub(normalizeClub(result.club))
      setMembers(result.members.map(normalizeClubMember))
      setIsLeader(result.isLeader)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load club data',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchClubState()
  }, [club.id])

  useEffect(() => {
    if (disbanded) {
      onLeave()
    }
  }, [disbanded])

  const handleClubUpdated = (updatedClub: NormalizedClub) => {
    setClub(updatedClub)
  }

  const handleMemberRemoved = (removedUserId: string) => {
    setMembers((prev) => prev.filter((m) => m.userId !== removedUserId))
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen relative">
      <div className="relative z-10 h-screen">
        <div className={cn("flex h-full", isMobile ? "flex-col" : "")}>
          {/* Main content */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Header */}
            <div className={cn("flex items-center justify-between border-b", isMobile ? "p-3" : "px-6 py-4")}>
              <h1 className="text-xl font-bold truncate">{club.name}</h1>
              {isMobile && (
                <button
                  onClick={() => setShowSidebar(!showSidebar)}
                  className="p-2 hover:bg-muted rounded-lg"
                >
                  <BarChart3 className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Tabs */}
            <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0">
              <div className="border-b px-4">
                <TabsList className="h-12">
                  <TabsTrigger value="chat" className="gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Chat
                  </TabsTrigger>
                  <TabsTrigger value="stats" className="gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Stats
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="chat" className="flex-1 m-0 overflow-hidden">
                <ClubChat clubId={club.id} userId={userId} />
              </TabsContent>

              <TabsContent value="stats" className="flex-1 m-0 overflow-auto">
                <ClubStats clubId={club.id} />
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          {(showSidebar || !isMobile) && (
            <div className={cn(
              isMobile
                ? "fixed inset-0 z-50 bg-background"
                : "w-72 flex-shrink-0"
            )}>
              {isMobile && (
                <div className="flex items-center justify-between p-3 border-b">
                  <h2 className="font-semibold">Club Info</h2>
                  <button
                    onClick={() => setShowSidebar(false)}
                    className="p-2 hover:bg-muted rounded-lg"
                  >
                    <span className="sr-only">Close</span>
                    ✕
                  </button>
                </div>
              )}
              <ClubSidebar
                club={club}
                members={members}
                isLeader={isLeader}
                userId={userId}
                onLeave={onLeave}
                onMemberKicked={handleMemberRemoved}
                onMemberBanned={handleMemberRemoved}
                onClubUpdated={handleClubUpdated}
                onClubDisbanded={onLeave}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
