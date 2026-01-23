import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/api/supabase/client'

// GET /api/clubs/me - Get current user's club
export async function GET(request: NextRequest) {
  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if user is a member of any club
  const { data: membership, error: membershipError } = await supabase
    .from('club_members')
    .select(`
      role,
      clubs (*)
    `)
    .eq('user_id', user.id)
    .single()

  if (membershipError) {
    // No membership found
    if (membershipError.code === 'PGRST116') {
      return NextResponse.json({ club: null })
    }
    return NextResponse.json({ error: membershipError.message }, { status: 500 })
  }

  if (!membership || !membership.clubs) {
    return NextResponse.json({ club: null })
  }

  return NextResponse.json({
    club: membership.clubs,
    role: membership.role,
  })
}
