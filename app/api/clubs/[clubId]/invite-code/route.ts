import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/api/supabase/client'

interface RouteParams {
  params: Promise<{ clubId: string }>
}

// Helper function to generate invite code
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// POST /api/clubs/[clubId]/invite-code - Regenerate invite code
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { clubId } = await params
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
      { error: 'Only the club leader can regenerate the invite code' },
      { status: 403 }
    )
  }

  // Try to use the RPC function first, fall back to local generation
  const { data: rpcInviteCode } = await supabase.rpc('generate_invite_code')
  const newInviteCode = rpcInviteCode || generateInviteCode()

  // Update the club with the new invite code
  const { error: updateError } = await supabase
    .from('clubs')
    .update({
      invite_code: newInviteCode,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clubId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ inviteCode: newInviteCode })
}
