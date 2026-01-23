'use client'

import { SettingsForm } from '@/components/common/SettingsForm'
import { createClientComponentClient } from '@/lib/api/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsMobile } from '@/lib/hooks'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
  const isMobile = useIsMobile()
  const supabase = createClientComponentClient()
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/signin')
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('username, theme, color_theme, deck_preference, is_superuser, debug_mode')
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
          <div className={cn("container mx-auto py-6 max-w-7xl flex items-center justify-center min-h-screen", isMobile ? "px-4" : "px-14")}>
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
        <div className={cn("container mx-auto py-6 max-w-7xl", isMobile ? "px-4" : "px-14")}>
          <h1 className={cn("text-3xl font-bold mb-6", isMobile && "text-center")}>Settings</h1>
          
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
                initialCardStyle={profile?.deck_preference || 'standard'}
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
                initialCardStyle={profile?.deck_preference || 'standard'}
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
                  initialCardStyle={profile?.deck_preference || 'standard'}
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

