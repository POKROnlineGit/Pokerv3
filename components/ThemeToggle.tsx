'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { createClientComponentClient } from '@/lib/supabaseClient'

export function useThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark') // Default to dark
  const [mounted, setMounted] = useState(false)
  const supabase = createClientComponentClient()

  useEffect(() => {
    setMounted(true)
    
    const loadTheme = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        // Load from Supabase profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('theme')
          .eq('id', user.id)
          .single()
        
        if (profile?.theme === 'light' || profile?.theme === 'dark') {
          setTheme(profile.theme)
          applyTheme(profile.theme)
        } else {
          // No preference set, default to dark
          setTheme('dark')
          applyTheme('dark')
        }
      } else {
        // Not signed in, default to dark
        setTheme('dark')
        applyTheme('dark')
      }
    }
    
    loadTheme()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadTheme()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  const applyTheme = (newTheme: 'light' | 'dark') => {
    const root = document.documentElement
    if (newTheme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('theme', newTheme)
  }

  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    applyTheme(newTheme)

    // Only save to Supabase if user is logged in (to avoid errors)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      try {
        await supabase
          .from('profiles')
          .update({ theme: newTheme })
          .eq('id', user.id)
      } catch (error) {
        console.error('Error saving theme preference:', error)
      }
    }
  }

  return { theme, toggleTheme, mounted }
}

// Keep the old component for backwards compatibility if needed
export function ThemeToggle() {
  const { theme, toggleTheme, mounted } = useThemeToggle()
  
  if (!mounted) {
    return null
  }

  return (
    <>
      {theme === 'light' ? (
        <Moon className="h-5 w-5 flex-shrink-0" />
      ) : (
        <Sun className="h-5 w-5 flex-shrink-0" />
      )}
    </>
  )
}

