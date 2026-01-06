'use client'

import { useTheme } from '@/components/providers/ThemeProvider'

export function ThemeBackground() {
  const { currentTheme } = useTheme()

  // Get background color from theme
  const backgroundColor = currentTheme.colors.background

  return (
    <div
      className="fixed inset-0 -z-50 overflow-hidden pointer-events-none"
      style={{ 
        willChange: "contents",
        backgroundColor: backgroundColor,
        zIndex: -50,
      }}
    />
  )
}

