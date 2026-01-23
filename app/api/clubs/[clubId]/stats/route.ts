import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/api/supabase/client'

interface RouteParams {
  params: Promise<{ clubId: string }>
}

// GET /api/clubs/[clubId]/stats - Get member stats
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { clubId } = await params
  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if user is a member
  const { data: membership } = await supabase
    .from('club_members')
    .select('id')
    .eq('club_id', clubId)
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json(
      { error: 'You are not a member of this club' },
      { status: 403 }
    )
  }

  // Get all club members with their profiles
  const { data: members, error: membersError } = await supabase
    .from('club_members')
    .select(`
      user_id,
      role,
      joined_at,
      profiles:user_id (username)
    `)
    .eq('club_id', clubId)
    .order('joined_at', { ascending: true })

  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 })
  }

  // Format stats for each member
  // Note: VPIP/PFR stats would typically come from a separate stats table
  // For now, we return basic member info. The frontend can fetch additional stats via RPC.
  const stats = members?.map((member) => {
    // profiles is returned as an object when using foreign key join syntax
    const profiles = member.profiles as unknown as { username: string } | null
    return {
      userId: member.user_id,
      username: profiles?.username || 'Unknown',
      role: member.role,
      joinedAt: member.joined_at,
      handsPlayed: 0,
      vpipPercent: 0,
      pfrPercent: 0,
      lifetimeChipChange: null,
    }
  }) || []

  return NextResponse.json({ stats })
}
