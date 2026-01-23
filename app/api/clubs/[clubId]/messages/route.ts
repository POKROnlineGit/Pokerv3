import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/api/supabase/client'

interface RouteParams {
  params: Promise<{ clubId: string }>
}

// POST /api/clubs/[clubId]/messages - Send a message
export async function POST(request: NextRequest, { params }: RouteParams) {
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

  const body = await request.json()
  const { content, messageType = 'text', metadata = {} } = body

  // Validate content
  const trimmedContent = content?.trim()
  if (!trimmedContent || trimmedContent.length > 2000) {
    return NextResponse.json(
      { error: 'Message must be between 1 and 2000 characters' },
      { status: 400 }
    )
  }

  // Insert the message
  const { data: message, error } = await supabase
    .from('club_messages')
    .insert({
      club_id: clubId,
      user_id: user.id,
      content: trimmedContent,
      message_type: messageType,
      metadata,
    })
    .select(`
      *,
      profiles:user_id (username)
    `)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, message })
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
