import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/api/supabase/client'

interface RouteParams {
  params: Promise<{ clubId: string }>
}

// GET /api/clubs/[clubId] - Get club details
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { clubId } = await params
  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get club
  const { data: club, error: clubError } = await supabase
    .from('clubs')
    .select('*')
    .eq('id', clubId)
    .single()

  if (clubError || !club) {
    return NextResponse.json({ error: 'Club not found' }, { status: 404 })
  }

  // Check if user is a member
  const { data: membership } = await supabase
    .from('club_members')
    .select('role')
    .eq('club_id', clubId)
    .eq('user_id', user.id)
    .single()

  const isMember = !!membership
  const isLeader = membership?.role === 'leader'

  // If private club and not a member, deny access
  if (!club.is_public && !isMember) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Get members with profiles
  const { data: members } = await supabase
    .from('club_members')
    .select(`
      *,
      profiles:user_id (username)
    `)
    .eq('club_id', clubId)
    .order('joined_at', { ascending: true })

  return NextResponse.json({
    club,
    members: members || [],
    isLeader,
    isMember,
  })
}

// DELETE /api/clubs/[clubId] - Disband club (leader only)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { clubId } = await params
  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify user is the leader
  const { data: club, error: clubError } = await supabase
    .from('clubs')
    .select('leader_id')
    .eq('id', clubId)
    .single()

  if (clubError || !club) {
    return NextResponse.json({ error: 'Club not found' }, { status: 404 })
  }

  if (club.leader_id !== user.id) {
    return NextResponse.json({ error: 'Only the club leader can disband' }, { status: 403 })
  }

  // Delete the club (cascade will handle members, messages, etc.)
  const { error: deleteError } = await supabase
    .from('clubs')
    .delete()
    .eq('id', clubId)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
