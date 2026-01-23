import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/api/supabase/client'

interface RouteParams {
  params: Promise<{ clubId: string; userId: string }>
}

// POST /api/clubs/[clubId]/members/[userId]/unban - Unban a member
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { clubId, userId: targetUserId } = await params
  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify the user is the club leader
  const { data: club, error: clubError } = await supabase
    .from('clubs')
    .select('leader_id')
    .eq('id', clubId)
    .single()

  if (clubError || !club) {
    return NextResponse.json({ error: 'Club not found' }, { status: 404 })
  }

  if (club.leader_id !== user.id) {
    return NextResponse.json(
      { error: 'Only the club leader can unban members' },
      { status: 403 }
    )
  }

  // Check if user is actually banned
  const { data: ban } = await supabase
    .from('club_bans')
    .select('id')
    .eq('club_id', clubId)
    .eq('user_id', targetUserId)
    .single()

  if (!ban) {
    return NextResponse.json(
      { error: 'User is not banned from this club' },
      { status: 400 }
    )
  }

  // Remove the ban
  const { error: unbanError } = await supabase
    .from('club_bans')
    .delete()
    .eq('club_id', clubId)
    .eq('user_id', targetUserId)

  if (unbanError) {
    return NextResponse.json({ error: unbanError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
