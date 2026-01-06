'use client'

import { SettingsForm } from '@/components/SettingsForm'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function SettingsPage() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/signin')
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
        <div className="relative z-10">
          <div className="container mx-auto p-6 max-w-4xl flex items-center justify-center min-h-screen">
            <div className="text-white">Loading...</div>
          </div>
        </div>
      </div>
    )
  }

  const isSuperUser = profile?.is_superuser || false

  return (
    <div className="min-h-screen relative">
      {/* --- SCROLLABLE CONTENT LAYER --- */}
      <div className="relative z-10">
        <div className="container mx-auto p-6 max-w-4xl">
          <h1 className="text-3xl font-bold mb-6">Settings</h1>
          
          {/* Tabs */}
          <Tabs defaultValue="profile" className="w-full">
            <TabsList>
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="theme">Theme</TabsTrigger>
              {isSuperUser && <TabsTrigger value="debug">Debug</TabsTrigger>}
            </TabsList>

            <TabsContent value="profile" className="mt-4">
              <SettingsForm
                initialUsername={profile?.username || ''}
                initialTheme={profile?.theme || 'light'}
                initialColorTheme={profile?.color_theme || 'emerald_felt'}
                isSuperUser={isSuperUser}
                initialDebugMode={profile?.debug_mode || false}
                tab="profile"
              />
            </TabsContent>

            <TabsContent value="theme" className="mt-4">
              <SettingsForm
                initialUsername={profile?.username || ''}
                initialTheme={profile?.theme || 'light'}
                initialColorTheme={profile?.color_theme || 'emerald_felt'}
                isSuperUser={isSuperUser}
                initialDebugMode={profile?.debug_mode || false}
                tab="theme"
              />
            </TabsContent>

            {isSuperUser && (
              <TabsContent value="debug" className="mt-4">
                <SettingsForm
                  initialUsername={profile?.username || ''}
                  initialTheme={profile?.theme || 'light'}
                  initialColorTheme={profile?.color_theme || 'emerald_felt'}
                  isSuperUser={isSuperUser}
                  initialDebugMode={profile?.debug_mode || false}
                  tab="debug"
                />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </div>
  )
}

