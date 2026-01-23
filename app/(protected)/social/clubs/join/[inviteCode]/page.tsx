'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useClubSocket } from '@/lib/api/socket'
import { createClientComponentClient } from '@/lib/api/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Users, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { useToast } from '@/lib/hooks'

export default function JoinClubPage() {
  const router = useRouter()
  const params = useParams()
  const inviteCode = params.inviteCode as string
  const supabase = createClientComponentClient()
  const { joinClubByCode, getUserClub } = useClubSocket()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [alreadyInClub, setAlreadyInClub] = useState(false)

  useEffect(() => {
    const checkUserClub = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/signin')
          return
        }

        // Check if user is already in a club
        const result = await getUserClub()
        if ('error' in result) {
          setLoading(false)
          return
        }

        if (result.club) {
          setAlreadyInClub(true)
        }
      } catch (err) {
        console.error('Error checking user club:', err)
      } finally {
        setLoading(false)
      }
    }

    checkUserClub()
  }, [supabase, getUserClub, router])

  const handleJoin = async () => {
    setJoining(true)
    setError(null)

    try {
      const result = await joinClubByCode(inviteCode)

      if ('error' in result) {
        setError(result.error)
        toast({
          title: 'Failed to join club',
          description: result.error,
          variant: 'destructive',
        })
      } else {
        setSuccess(true)
        toast({
          title: 'Joined club!',
          description: `You've successfully joined ${result.club.name}`,
        })
        // Redirect to clubs page after a brief delay
        setTimeout(() => {
          router.push('/social/clubs')
        }, 1500)
      }
    } catch (err) {
      setError('An unexpected error occurred')
      toast({
        title: 'Error',
        description: 'An unexpected error occurred while joining the club',
        variant: 'destructive',
      })
    } finally {
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Join Club</CardTitle>
          <CardDescription>
            You've been invited to join a club
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {success ? (
            <div className="text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-lg font-medium">Successfully joined!</p>
              <p className="text-muted-foreground">Redirecting to your club...</p>
            </div>
          ) : alreadyInClub ? (
            <div className="text-center space-y-4">
              <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto" />
              <p className="text-lg font-medium">Already in a club</p>
              <p className="text-muted-foreground">
                You can only be a member of one club at a time. Leave your current club to join a new one.
              </p>
              <Button
                onClick={() => router.push('/social/clubs')}
                style={{
                  backgroundColor: 'var(--theme-accent-0)',
                  color: 'white',
                }}
              >
                Go to My Club
              </Button>
            </div>
          ) : error ? (
            <div className="text-center space-y-4">
              <XCircle className="h-12 w-12 text-red-500 mx-auto" />
              <p className="text-lg font-medium">Unable to join</p>
              <p className="text-muted-foreground">{error}</p>
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  onClick={() => router.push('/social/clubs')}
                >
                  Browse Clubs
                </Button>
                <Button
                  onClick={() => {
                    setError(null)
                    handleJoin()
                  }}
                  style={{
                    backgroundColor: 'var(--theme-accent-0)',
                    color: 'white',
                  }}
                >
                  Try Again
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                Click the button below to join this club.
              </p>
              <p className="text-sm text-muted-foreground">
                Invite code: <code className="bg-muted px-2 py-1 rounded">{inviteCode}</code>
              </p>
              <Button
                onClick={handleJoin}
                disabled={joining}
                className="w-full"
                style={{
                  backgroundColor: 'var(--theme-accent-0)',
                  color: 'white',
                }}
              >
                {joining ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    <Users className="h-4 w-4 mr-2" />
                    Join Club
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
