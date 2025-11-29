import { createServerComponentClient } from '@/lib/supabaseClient'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const supabase = await createServerComponentClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if already in queue
    const { data: existing } = await supabase
      .from('queue')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (existing) {
      return NextResponse.json({ message: 'Already in queue' })
    }

    // Join queue
    const { error } = await supabase
      .from('queue')
      .insert({ user_id: user.id })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Check if we can create a game (6 players)
    const { data: queuePlayers } = await supabase
      .from('queue')
      .select('user_id')

    if (queuePlayers && queuePlayers.length >= 6) {
      // Import here to avoid circular dependencies
      const { checkQueueAndCreateGame } = await import('@/lib/poker-game/queueManager')
      await checkQueueAndCreateGame()
      // Game creation will be detected via postgres subscriptions on the client
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

