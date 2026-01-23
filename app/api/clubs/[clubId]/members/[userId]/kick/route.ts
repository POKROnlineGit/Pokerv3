import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/api/supabase/client'

interface RouteParams {
  params: Promise<{ clubId: string; userId: string }>
}

// POST /api/clubs/[clubId]/members/[userId]/kick - Kick a member (without banning)
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
      { error: 'Only the club leader can kick members' },
      { status: 403 }
    )
  }

  // Cannot kick yourself
  if (targetUserId === user.id) {
    return NextResponse.json(
      { error: 'You cannot kick yourself' },
      { status: 400 }
    )
  }

  // Check if target is a member
  const { data: membership } = await supabase
    .from('club_members')
    .select('id')
    .eq('club_id', clubId)
    .eq('user_id', targetUserId)
    .single()

  if (!membership) {
    return NextResponse.json(
      { error: 'User is not a member of this club' },
      { status: 400 }
    )
  }

  // Remove from members (without adding to ban list)
  const { error: removeError } = await supabase
    .from('club_members')
    .delete()
    .eq('club_id', clubId)
    .eq('user_id', targetUserId)

  if (removeError) {
    return NextResponse.json({ error: removeError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
