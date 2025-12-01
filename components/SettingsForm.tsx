'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

interface SettingsFormProps {
  initialUsername: string
  initialTheme: 'light' | 'dark'
  isSuperUser?: boolean
  initialDebugMode?: boolean
}

export function SettingsForm({ initialUsername, initialTheme, isSuperUser = false, initialDebugMode = false }: SettingsFormProps) {
  const [username, setUsername] = useState(initialUsername)
  const [theme, setTheme] = useState(initialTheme)
  const [debugMode, setDebugMode] = useState(initialDebugMode)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
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

      // Update profile
      const updateData: { username: string; theme: string; debug_mode?: boolean } = { username, theme }
      if (isSuperUser) {
        updateData.debug_mode = debugMode
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id)

      if (updateError) throw updateError

      // Apply theme
      const root = document.documentElement
      if (theme === 'dark') {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
      localStorage.setItem('theme', theme)

      setSuccess(true)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Settings</CardTitle>
        <CardDescription>
          Update your username and theme preferences
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={20}
            />
            <p className="text-sm text-muted-foreground">
              Your username must be unique and between 3-20 characters
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="theme">Dark Mode</Label>
              <Switch
                id="theme"
                checked={theme === 'dark'}
                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Toggle between light and dark theme
            </p>
          </div>

          {isSuperUser && (
            <div className="space-y-2 pt-4 border-t">
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
            <div className="bg-primary/10 text-primary text-sm p-3 rounded-md">
              Settings saved successfully!
            </div>
          )}

          <Button type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save Settings'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

