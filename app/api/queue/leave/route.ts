import { createClient } from '@/lib/supabaseServer'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return new Response('Unauthorized', { status: 401 })

  // Don't use .single() — just delete and ignore if nothing was there
  const { error } = await supabase
    .from('queue')
    .delete()
    .eq('user_id', user.id)

  if (error) {
    console.error('Error leaving queue:', error)
    return new Response('Error', { status: 500 })
  }

  return new Response('OK')
}
