import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/api/supabase/client'

interface RouteParams {
  params: Promise<{ clubId: string }>
}

// GET /api/clubs/[clubId]/messages - Get paginated messages
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

  const { searchParams } = new URL(request.url)
  const before = searchParams.get('before')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

  // Build query
  let query = supabase
    .from('club_messages')
    .select(`
      *,
      profiles:user_id (username)
    `)
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })
    .limit(limit + 1) // Get one extra to check if there are more

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data: messages, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const hasMore = (messages?.length || 0) > limit
  const returnMessages = hasMore ? messages?.slice(0, limit) : messages

  return NextResponse.json({
    messages: returnMessages || [],
    hasMore,
  })
}
