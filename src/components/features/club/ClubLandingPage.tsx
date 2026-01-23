'use client'

import { useEffect, useState } from 'react'
import { useClubSocket } from '@/lib/api/socket'
import { Club, NormalizedClub, normalizeClub } from '@/lib/types/club'
import { ClubCard } from './ClubCard'
import { ClubCreateForm } from './ClubCreateForm'
import { Loader2, Users, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks'
import { useIsMobile } from '@/lib/hooks'
import { cn } from '@/lib/utils'

interface ClubLandingPageProps {
  onClubCreated: (club: Club, role: string) => void
  onClubJoined: (club: Club) => void
}

export function ClubLandingPage({ onClubCreated, onClubJoined }: ClubLandingPageProps) {
  const isMobile = useIsMobile()
  const { getPublicClubs, joinClub } = useClubSocket()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [clubs, setClubs] = useState<NormalizedClub[]>([])
  const [joiningClubId, setJoiningClubId] = useState<string | null>(null)

  const fetchClubs = async () => {
    setLoading(true)
    try {
      const result = await getPublicClubs(1, 50)
      if ('error' in result) {
        toast({
          title: 'Error',
          description: result.error,
          variant: 'destructive',
        })
        return
      }
      setClubs(result.clubs.map(normalizeClub))
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch clubs',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchClubs()
  }, [])

  const handleJoin = async (clubId: string) => {
    setJoiningClubId(clubId)
    try {
      const result = await joinClub(clubId)
      if ('error' in result) {
        toast({
          title: 'Failed to join',
          description: result.error,
          variant: 'destructive',
        })
        return
      }
      toast({
        title: 'Joined club!',
        description: `You've joined ${result.club.name}`,
      })
      onClubJoined(result.club)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to join club',
        variant: 'destructive',
      })
    } finally {
      setJoiningClubId(null)
    }
  }

  return (
    <div className="min-h-screen relative">
      <div className="relative z-10">
        <div className={cn("container mx-auto py-6 max-w-7xl h-full", isMobile ? "px-4" : "px-14")}>
          <div className="flex items-center justify-between mb-6">
            <h1 className={cn("text-3xl font-bold", isMobile && "text-center flex-1")}>Clubs</h1>
            {!isMobile && (
              <Button
                variant="outline"
                size="sm"
                onClick={fetchClubs}
                disabled={loading}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                Refresh
              </Button>
            )}
          </div>

          <div className={cn("flex gap-6", isMobile ? "flex-col" : "h-[calc(100vh-8rem)]")}>
            {/* Main content - Club list */}
            <div className={cn("flex-1", !isMobile && "overflow-y-auto pr-2")}>
              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : clubs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No public clubs yet</h3>
                  <p className="text-muted-foreground">
                    Be the first to create a club!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {clubs.map((club) => (
                    <ClubCard
                      key={club.id}
                      club={club}
                      onJoin={handleJoin}
                      joining={joiningClubId === club.id}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Sidebar - Create form */}
            <div className={cn(isMobile ? "w-full" : "w-80 flex-shrink-0")}>
              <ClubCreateForm onClubCreated={onClubCreated} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
