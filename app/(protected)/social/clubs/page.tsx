'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClubSocket, useClubEvents } from '@/lib/api/socket'
import { createClientComponentClient } from '@/lib/api/supabase/client'
import { Club, NormalizedClub, normalizeClub } from '@/lib/types/club'
import { ClubLandingPage } from '@/components/features/club/ClubLandingPage'
import { ClubPage } from '@/components/features/club/ClubPage'

export default function ClubsPage() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const { getUserClub } = useClubSocket()
  const [loading, setLoading] = useState(false)
  const [userClub, setUserClub] = useState<NormalizedClub | null>(null)
  const [userRole, setUserRole] = useState<string>('member')
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const fetchUserClub = async () => {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }
        setUserId(user.id)

        // Check if user is in a club
        // Add timeout to prevent infinite hang if socket callback never fires
        const timeoutPromise = new Promise<{ error: string }>((resolve) =>
          setTimeout(() => resolve({ error: 'Request timed out' }), 10000)
        )

        const result = await Promise.race([getUserClub(), timeoutPromise])
        if ('error' in result) {
          console.error('Error fetching user club:', result.error)
          setLoading(false)
          return
        }

        if (result.club) {
          setUserClub(normalizeClub(result.club))
          setUserRole(result.role)
        }
      } catch (error) {
        console.error('Error fetching user club:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchUserClub()
  }, [supabase, getUserClub])

  // Listen for club disbanded event
  const { disbanded } = useClubEvents(userClub?.id, {
    onClubDisbanded: () => {
      setUserClub(null)
      setUserRole('member')
    },
  })

  useEffect(() => {
    if (disbanded) {
      setUserClub(null)
    }
  }, [disbanded])

  const handleClubCreated = (club: Club, role: string) => {
    setUserClub(normalizeClub(club))
    setUserRole(role)
  }

  const handleClubJoined = (club: Club) => {
    setUserClub(normalizeClub(club))
    setUserRole('member')
  }

  const handleClubLeft = () => {
    setUserClub(null)
    setUserRole('member')
  }

  // If user is in a club, show the club page
  if (userClub && userId) {
    return (
      <ClubPage
        club={userClub}
        isLeader={userRole === 'leader'}
        userId={userId}
        onLeave={handleClubLeft}
      />
    )
  }

  // Otherwise, show the landing page with public clubs list
  return (
    <ClubLandingPage
      onClubCreated={handleClubCreated}
      onClubJoined={handleClubJoined}
    />
  )
}
