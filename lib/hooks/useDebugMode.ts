'use client'

import { useProfile } from './useProfile'

export function useDebugMode() {
  const { profile, user } = useProfile()
  return {
    isEnabled: Boolean(user && profile?.is_superuser && profile?.debug_mode),
    isSuperUser: Boolean(user && profile?.is_superuser),
    profile,
    user,
  }
}








