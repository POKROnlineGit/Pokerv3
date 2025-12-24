'use client'

import { useGameRedirect } from '@/lib/hooks/useGameRedirect'

/**
 * Client component wrapper for game redirect hook
 * Must be a client component to use hooks
 */
export function GameRedirectProvider() {
  useGameRedirect()
  return null // This component doesn't render anything
}







