'use client'

import { useTheme } from '@/components/providers/ThemeProvider'

export function ThemeBackground() {
  const { currentTheme } = useTheme()

  // Get theme colors
  const primaryColor = currentTheme.colors.primary[0]
  const gradientColors = currentTheme.colors.gradient
  const centerColor = currentTheme.colors.primary[2] || currentTheme.colors.primary[1]

  return (
    <div
      className="fixed inset-0 z-0 overflow-hidden pointer-events-none"
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
      <div className="absolute inset-0 bg-radial-gradient from-transparent to-black/80" />
    </div>
  )
}

