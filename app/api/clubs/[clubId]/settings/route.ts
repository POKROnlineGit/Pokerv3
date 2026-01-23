import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/api/supabase/client'

interface RouteParams {
  params: Promise<{ clubId: string }>
}

// PATCH /api/clubs/[clubId]/settings - Update club settings
export async function PATCH(request: NextRequest, { params }: RouteParams) {
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
      { error: 'Only the club leader can update settings' },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { name, description, isPublic } = body

  // Build update object
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if (name !== undefined) {
    const trimmedName = name?.trim()
    if (!trimmedName || trimmedName.length < 3 || trimmedName.length > 50) {
      return NextResponse.json(
        { error: 'Club name must be between 3 and 50 characters' },
        { status: 400 }
      )
    }
    updates.name = trimmedName
  }

  if (description !== undefined) {
    updates.description = description?.trim() || null
  }

  if (isPublic !== undefined) {
    updates.is_public = isPublic
  }

  // Update the club
  const { data: updatedClub, error: updateError } = await supabase
    .from('clubs')
    .update(updates)
    .eq('id', clubId)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, club: updatedClub })
}
