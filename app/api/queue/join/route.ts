import { createClient } from '@/lib/supabaseServer'

export async function POST(req: Request) {
  const body = await req.json()
  const { queue_type = 'six_max' } = body

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return new Response('Unauthorized', { status: 401 })

  // UPSERT = insert if not exists, update if already there
  const { error } = await supabase
    .from('queue')
    .upsert(
      { user_id: user.id, queue_type },
      { onConflict: 'user_id' } // ← this prevents the duplicate key error
    )

  if (error) {
    console.error('Error joining queue:', error)
    return new Response('Error', { status: 500 })
  }

  return new Response('OK')
}
