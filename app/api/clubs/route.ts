import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/api/supabase/client'

// GET /api/clubs - List public clubs
export async function GET(request: NextRequest) {
  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
  const offset = (page - 1) * limit

  // Get public clubs with member count
  const { data: clubs, error, count } = await supabase
    .from('clubs')
    .select(`
      *,
      club_members(count)
    `, { count: 'exact' })
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Transform the data to include member_count
  const clubsWithCount = clubs?.map(club => ({
    ...club,
    member_count: club.club_members?.[0]?.count || 0,
    club_members: undefined,
  })) || []

  return NextResponse.json({
    clubs: clubsWithCount,
    total: count || 0,
    page,
    limit,
  })
}

// POST /api/clubs - Create a new club
export async function POST(request: NextRequest) {
  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { name, description, isPublic } = body

  // Validate name
  const trimmedName = name?.trim()
  if (!trimmedName || trimmedName.length < 3 || trimmedName.length > 50) {
    return NextResponse.json(
      { error: 'Club name must be between 3 and 50 characters' },
      { status: 400 }
    )
  }

  // Check if user is already in a club
  const { data: existingMembership } = await supabase
    .from('club_members')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (existingMembership) {
    return NextResponse.json(
      { error: 'You are already in a club. Leave your current club first.' },
      { status: 400 }
    )
  }

  // Check if user already leads a club
  const { data: existingClub } = await supabase
    .from('clubs')
    .select('id')
    .eq('leader_id', user.id)
    .single()

  if (existingClub) {
    return NextResponse.json(
      { error: 'You already lead a club' },
      { status: 400 }
    )
  }

  // Generate invite code
  const { data: inviteCodeData } = await supabase.rpc('generate_invite_code')
  const inviteCode = inviteCodeData || generateInviteCode()

  // Create the club
  const { data: club, error: clubError } = await supabase
    .from('clubs')
    .insert({
      name: trimmedName,
      description: description?.trim() || null,
      leader_id: user.id,
      is_public: isPublic !== false,
      invite_code: inviteCode,
    })
    .select()
    .single()

  if (clubError) {
    return NextResponse.json({ error: clubError.message }, { status: 500 })
  }

  // Add creator as leader member
  const { error: memberError } = await supabase
    .from('club_members')
    .insert({
      club_id: club.id,
      user_id: user.id,
      role: 'leader',
    })

  if (memberError) {
    // Rollback club creation
    await supabase.from('clubs').delete().eq('id', club.id)
    return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  return NextResponse.json({
    clubId: club.id,
    inviteCode: club.invite_code,
  })
}

// Helper function to generate invite code (fallback)
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}
