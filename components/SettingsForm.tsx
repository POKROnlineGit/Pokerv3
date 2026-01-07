'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/providers/ThemeProvider'
import { getTheme } from '@/lib/themes'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SettingsFormProps {
  initialUsername: string
  initialTheme: 'light' | 'dark'
  initialColorTheme?: string
  isSuperUser?: boolean
  initialDebugMode?: boolean
  tab?: 'profile' | 'theme' | 'debug'
}

export function SettingsForm({ initialUsername, initialTheme, initialColorTheme, isSuperUser = false, initialDebugMode = false, tab = 'profile' }: SettingsFormProps) {
  const [username, setUsername] = useState(initialUsername)
  const [theme, setTheme] = useState(initialTheme)
  const [colorTheme, setColorThemeLocal] = useState(initialColorTheme || 'emerald_felt')
  const [debugMode, setDebugMode] = useState(initialDebugMode)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const { availableThemes, setTheme: setColorTheme, currentTheme } = useTheme()
  const supabase = createClientComponentClient()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Update profile - only update fields relevant to the current tab
      const updateData: { username?: string; theme?: string; color_theme?: string; debug_mode?: boolean } = {}
      
      if (tab === 'profile') {
        // Check if username is already taken
        const { data: existing } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', username)
          .neq('id', user.id)
          .single()

        if (existing) {
          throw new Error('Username already taken')
        }
        updateData.username = username
      } else if (tab === 'theme') {
        updateData.theme = theme
        updateData.color_theme = colorTheme
      } else if (tab === 'debug' && isSuperUser) {
        updateData.debug_mode = debugMode
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id)

      if (updateError) throw updateError

      // Apply theme changes only if we're on the theme tab
      if (tab === 'theme') {
        // Apply light/dark theme
        const root = document.documentElement
        if (theme === 'dark') {
          root.classList.add('dark')
        } else {
          root.classList.remove('dark')
        }
        localStorage.setItem('theme', theme)

        // Apply color theme via ThemeProvider (this will update the global state)
        await setColorTheme(colorTheme)
      }

      setSuccess(true)
      setTimeout(() => {
        router.refresh()
      }, 1000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getCardTitle = () => {
    switch (tab) {
      case 'profile':
        return 'Profile Settings'
      case 'theme':
        return 'Theme Settings'
      case 'debug':
        return 'Debug Settings'
      default:
        return 'Settings'
    }
  }

  const getCardDescription = () => {
    switch (tab) {
      case 'profile':
        return 'Update your username'
      case 'theme':
        return 'Customize your theme preferences'
      case 'debug':
        return 'Development and debugging options'
      default:
        return 'Manage your settings'
    }
  }

  return (
    <Card className="bg-card backdrop-blur-sm border">
      <CardHeader>
        <CardTitle>{getCardTitle()}</CardTitle>
        <CardDescription>
          {getCardDescription()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {tab === 'profile' && (
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={20}
                className="bg-card"
              />
              <p className="text-sm text-muted-foreground">
                Your username must be unique and between 3-20 characters
              </p>
            </div>
          )}

          {tab === 'theme' && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="theme">Dark Mode</Label>
                  <Switch
                    id="theme"
                    checked={theme === 'dark'}
                    onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                    style={{
                      backgroundColor: theme === 'dark' ? currentTheme.colors.accent[0] : undefined,
                    } as React.CSSProperties}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Toggle between light and dark theme
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="color-theme">Color Theme</Label>
                <Select
                  value={colorTheme}
                  onValueChange={(value) => {
                    setColorThemeLocal(value)
                  }}
                >
                  <SelectTrigger id="color-theme" className="w-full bg-card">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {(() => {
                          const selectedTheme = getTheme(colorTheme)
                          return (
                            <>
                              <div
                                className="h-4 w-4 rounded border border-border"
                                style={{ backgroundColor: selectedTheme.colors.primary[0] }}
                              />
                              <div
                                className="h-4 w-4 rounded border border-border"
                                style={{ backgroundColor: selectedTheme.colors.gradient[0] }}
                              />
                              <div
                                className="h-4 w-4 rounded border border-border"
                                style={{ backgroundColor: selectedTheme.colors.accent[0] }}
                              />
                            </>
                          )
                        })()}
                      </div>
                      <SelectValue>
                        {getTheme(colorTheme).name}
                      </SelectValue>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {availableThemes.map((themeOption) => (
                      <SelectItem key={themeOption.id} value={themeOption.id}>
                        <div className="flex items-center gap-3 w-full">
                          <div className="flex gap-1 flex-shrink-0">
                            <div
                              className="h-4 w-4 rounded border border-border"
                              style={{ backgroundColor: themeOption.colors.primary[0] }}
                            />
                            <div
                              className="h-4 w-4 rounded border border-border"
                              style={{ backgroundColor: themeOption.colors.gradient[0] }}
                            />
                            <div
                              className="h-4 w-4 rounded border border-border"
                              style={{ backgroundColor: themeOption.colors.accent[0] }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{themeOption.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {themeOption.description}
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Choose your preferred color scheme
                </p>
              </div>
            </>
          )}

          {tab === 'debug' && isSuperUser && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="debug-mode">Debug Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable debug overlays, console logs, and development tools
                  </p>
                </div>
                <Switch
                  id="debug-mode"
                  checked={debugMode}
                  onCheckedChange={setDebugMode}
                  style={{
                    backgroundColor: debugMode ? currentTheme.colors.accent[0] : undefined,
                  } as React.CSSProperties}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
              {error}
            </div>
          )}

          {success && (
            <div 
              className="text-sm p-3 rounded-md text-white"
              style={{
                backgroundColor: `${currentTheme.colors.accent[0]}20`,
                color: currentTheme.colors.accent[0],
              }}
            >
              Settings saved successfully!
            </div>
          )}

          <Button 
            type="submit" 
            disabled={loading}
            className="h-9 text-sm"
            style={{
              backgroundColor: currentTheme.colors.accent[0],
              color: 'white',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = currentTheme.colors.accent[1] || currentTheme.colors.accent[0]
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = currentTheme.colors.accent[0]
              }
            }}
          >
            {loading ? 'Saving...' : 'Save Settings'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

