'use client'

import { SettingsForm } from '@/components/SettingsForm'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function SettingsPage() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('username, theme, color_theme, is_superuser, debug_mode')
        .eq('id', user.id)
        .single()

      setProfile(data)
      setLoading(false)
    }
    loadProfile()
  }, [supabase, router])

  if (loading) {
    return (
      <div className="min-h-screen relative">
        <div className="container mx-auto px-4 py-8 max-w-2xl flex items-center justify-center min-h-screen">
          <div className="text-white">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative">
      {/* --- SCROLLABLE CONTENT LAYER --- */}
      <div className="relative z-10">
        <div className="container mx-auto p-6 max-w-4xl">
          <h1 className="text-3xl font-bold mb-6">Settings</h1>
          <SettingsForm
            initialUsername={profile?.username || ''}
            initialTheme={profile?.theme || 'light'}
            initialColorTheme={profile?.color_theme || 'emerald_felt'}
            isSuperUser={profile?.is_superuser || false}
            initialDebugMode={profile?.debug_mode || false}
          />
        </div>
      </div>
    </div>
  )
}

