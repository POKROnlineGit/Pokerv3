'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabaseClient'
import type { User } from '@supabase/supabase-js'

interface Profile {
  id: string
  username: string
  chips: number
  theme: 'light' | 'dark'
  is_superuser: boolean
  debug_mode: boolean
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClientComponentClient()

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          setUser(null)
          setProfile(null)
          setLoading(false)
          return
        }

        setUser(user)

        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, chips, theme, is_superuser, debug_mode')
          .eq('id', user.id)
          .single()

        if (error) throw error

        setProfile(data as Profile)
      } catch (error) {
        console.error('Error fetching profile:', error)
        setProfile(null)
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      fetchProfile()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase])

  return { profile, user, loading }
}


