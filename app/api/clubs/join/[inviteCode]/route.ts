import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/api/supabase/client'

interface RouteParams {
  params: Promise<{ inviteCode: string }>
}

// POST /api/clubs/join/[inviteCode] - Join a club by invite code
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { inviteCode } = await params
  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if user is already in a club
  const { data: existingMembership } = await supabase
    .from('club_members')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (existingMembership) {
    return NextResponse.json(
      { error: 'You are already in a club' },
      { status: 400 }
    )
  }

  // Find club by invite code
  const { data: club, error: clubError } = await supabase
    .from('clubs')
    .select('*')
    .eq('invite_code', inviteCode.toUpperCase())
    .single()

  if (clubError || !club) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 })
  }

  // Check if user is banned
  const { data: ban } = await supabase
    .from('club_bans')
    .select('id')
    .eq('club_id', club.id)
    .eq('user_id', user.id)
    .single()

  if (ban) {
    return NextResponse.json(
      { error: 'You are banned from this club' },
      { status: 403 }
    )
  }

  // Check member count
  const { count: memberCount } = await supabase
    .from('club_members')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', club.id)

  if ((memberCount || 0) >= club.max_members) {
    return NextResponse.json(
      { error: 'This club is full' },
      { status: 400 }
    )
  }

  // Join the club
  const { error: joinError } = await supabase
    .from('club_members')
    .insert({
      club_id: club.id,
      user_id: user.id,
      role: 'member',
    })

  if (joinError) {
    return NextResponse.json({ error: joinError.message }, { status: 500 })
  }

  return NextResponse.json({ club })
}
