import { createServerComponentClient } from '@/lib/api/supabase/client'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { User, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface FriendProfilePageProps {
  params: Promise<{ friendId: string }>
}

export default async function FriendProfilePage({ params }: FriendProfilePageProps) {
  const { friendId } = await params
  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  // Verify friendship exists first (before fetching profile)
  // Check both directions of the friendship
  const { data: friendship1 } = await supabase
    .from('friends')
    .select('*')
    .eq('user_id', user.id)
    .eq('friend_id', friendId)
    .maybeSingle()

  const { data: friendship2 } = await supabase
    .from('friends')
    .select('*')
    .eq('user_id', friendId)
    .eq('friend_id', user.id)
    .maybeSingle()

  if (!friendship1 && !friendship2) {
    // Not actually friends, redirect
    redirect('/friends?error=not_friend')
  }

  // Fetch friend profile - RLS will enforce that only friends can view
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('username, created_at, chips')
    .eq('id', friendId)
    .single()

  if (error || !profile) {
    // User not found or RLS blocked access (shouldn't happen if friendship check passed)
    redirect('/friends?error=not_found')
  }

  const joinDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Unknown'

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-2xl">
      <div className="mb-6">
        <Link href="/friends">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Friends
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 justify-center md:justify-start">
            <User className="h-5 w-5" />
            Profile for {profile.username}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Joined</p>
            <p className="text-lg font-medium">{joinDate}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Current Stack</p>
            <p className="text-lg font-medium">{profile.chips?.toLocaleString() || '0'} chips</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

