import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/api/supabase/client'

interface RouteParams {
  params: Promise<{ clubId: string }>
}

// POST /api/clubs/[clubId]/leave - Leave a club
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { clubId } = await params
  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get the club to check if user is leader
  const { data: club, error: clubError } = await supabase
    .from('clubs')
    .select('leader_id')
    .eq('id', clubId)
    .single()

  if (clubError || !club) {
    return NextResponse.json({ error: 'Club not found' }, { status: 404 })
  }

  // Leaders cannot leave, they must disband
  if (club.leader_id === user.id) {
    return NextResponse.json(
      { error: 'Leaders cannot leave. You must disband the club instead.' },
      { status: 400 }
    )
  }

  // Check if user is a member
  const { data: membership, error: memberError } = await supabase
    .from('club_members')
    .select('id')
    .eq('club_id', clubId)
    .eq('user_id', user.id)
    .single()

  if (memberError || !membership) {
    return NextResponse.json(
      { error: 'You are not a member of this club' },
      { status: 400 }
    )
  }

  // Leave the club
  const { error: leaveError } = await supabase
    .from('club_members')
    .delete()
    .eq('club_id', clubId)
    .eq('user_id', user.id)

  if (leaveError) {
    return NextResponse.json({ error: leaveError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
