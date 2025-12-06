import { createServerComponentClient } from '@/lib/supabaseClient'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createServerComponentClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body for queue_type
    const body = await request.json().catch(() => ({}))
    const queueType: 'six_max' | 'heads_up' = body.queue_type || 'six_max'

    // Validate queue_type
    if (queueType !== 'six_max' && queueType !== 'heads_up') {
      return NextResponse.json({ error: 'Invalid queue_type' }, { status: 400 })
    }

    // Check user has sufficient chips (200 buy-in)
    const { data: profile } = await supabase
      .from('profiles')
      .select('chips')
      .eq('id', user.id)
      .single()

    if (!profile || profile.chips < 200) {
      return NextResponse.json({ error: 'Insufficient chips. Need 200 chips to join.' }, { status: 400 })
    }

    // Check if already in queue (any type)
    const { data: existing } = await supabase
      .from('queue')
      .select('id, queue_type')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      // If already in queue with different type, update it
      if (existing.queue_type !== queueType) {
        const { error: updateError } = await supabase
          .from('queue')
          .update({ queue_type: queueType })
          .eq('user_id', user.id)

        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 500 })
        }
        return NextResponse.json({ message: 'Queue type updated', success: true })
      }
      return NextResponse.json({ message: 'Already in queue', success: true })
    }

    // Join queue with queue_type
    const { error } = await supabase
      .from('queue')
      .insert({ user_id: user.id, queue_type: queueType })
      .select()

    // Handle unique constraint violation (user already in queue)
    if (error) {
      // Check if it's a unique constraint violation
      if (error.code === '23505' || error.message.includes('unique constraint') || error.message.includes('duplicate key')) {
        // User is already in queue, that's fine
        return NextResponse.json({ message: 'Already in queue', success: true })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Game creation is handled by the server via Socket.io/Realtime
    // The server will check queue and create games when enough players join

    return NextResponse.json({ success: true, queue_type: queueType })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
