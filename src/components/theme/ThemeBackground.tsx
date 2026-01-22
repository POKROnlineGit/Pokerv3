'use client'

export function ThemeBackground() {
  return (
    <div
      className="fixed inset-0 -z-50 overflow-hidden pointer-events-none"
      style={{
        backgroundColor: 'var(--theme-background)',
        zIndex: -50,
      }}
    />
  )
}
