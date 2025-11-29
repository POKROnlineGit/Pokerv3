import { SettingsForm } from '@/components/SettingsForm'
import { createServerComponentClient } from '@/lib/supabaseClient'
import { redirect } from 'next/navigation'

export default async function SettingsPage() {
  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, theme')
    .eq('id', user.id)
    .single()

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-4xl font-bold mb-8">Settings</h1>
      <SettingsForm
        initialUsername={profile?.username || ''}
        initialTheme={profile?.theme || 'light'}
      />
    </div>
  )
}

