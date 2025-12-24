'use client'

import { SettingsForm } from '@/components/SettingsForm'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'

export default function SettingsPage() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const { currentTheme } = useTheme()
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Get theme colors
  const primaryColor = currentTheme.colors.primary[0]
  const gradientColors = currentTheme.colors.gradient
  const centerColor = currentTheme.colors.primary[2] || currentTheme.colors.primary[1]

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
      <div className="min-h-screen bg-black relative">
        <div className="container mx-auto px-4 py-8 max-w-2xl flex items-center justify-center min-h-screen">
          <div className="text-white">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black relative">
      {/* --- FIXED BACKGROUND LAYER --- */}
      <div
        className="fixed inset-0 z-0 overflow-hidden"
        style={{ willChange: "contents" }}
      >
        {/* Radial Gradient - dark on outsides, theme color in middle */}
        <div 
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at top, ${primaryColor} 0%, ${centerColor} 30%, ${gradientColors[1]} 60%, ${gradientColors[2]} 100%)`,
          }}
        />
        
        {/* Noise Texture */}
        <div
          className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Vignette */}
        <div className="absolute inset-0 bg-radial-gradient from-transparent to-black/80 pointer-events-none" />
      </div>

      {/* --- SCROLLABLE CONTENT LAYER --- */}
      <div className="relative z-10">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <h1 className="text-4xl font-bold mb-8">Settings</h1>
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

