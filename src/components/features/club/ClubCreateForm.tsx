'use client'

import { useState } from 'react'
import { useClubApi } from '@/lib/api/http'
import { Club } from '@/lib/types/club'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Loader2, Plus } from 'lucide-react'
import { useToast } from '@/lib/hooks'

interface ClubCreateFormProps {
  onClubCreated: (club: Club, role: string) => void
}

export function ClubCreateForm({ onClubCreated }: ClubCreateFormProps) {
  const { createClub, getClubState } = useClubApi()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmedName = name.trim()
    if (trimmedName.length < 3) {
      toast({
        title: 'Invalid name',
        description: 'Club name must be at least 3 characters',
        variant: 'destructive',
      })
      return
    }

    if (trimmedName.length > 50) {
      toast({
        title: 'Invalid name',
        description: 'Club name must be at most 50 characters',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)

    try {
      const result = await createClub({
        name: trimmedName,
        description: description.trim() || undefined,
        isPublic,
      })

      if ('error' in result) {
        toast({
          title: 'Failed to create club',
          description: result.error,
          variant: 'destructive',
        })
        return
      }

      // Fetch the full club state
      const stateResult = await getClubState(result.clubId)
      if ('error' in stateResult) {
        toast({
          title: 'Club created',
          description: 'But failed to fetch club details',
          variant: 'destructive',
        })
        return
      }

      toast({
        title: 'Club created!',
        description: `${trimmedName} has been created successfully`,
      })

      onClubCreated(stateResult.club, 'leader')
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="bg-card backdrop-blur-sm border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          Create Club
        </CardTitle>
        <CardDescription>
          Start your own club and invite friends to join
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="club-name">Club Name</Label>
            <Input
              id="club-name"
              placeholder="Enter club name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              3-50 characters
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="club-description">Description (optional)</Label>
            <Input
              id="club-description"
              placeholder="What's your club about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              disabled={loading}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="club-public">Public Club</Label>
              <p className="text-xs text-muted-foreground">
                {isPublic
                  ? 'Anyone can find and join'
                  : 'Only joinable via invite link'}
              </p>
            </div>
            <Switch
              id="club-public"
              checked={isPublic}
              onCheckedChange={setIsPublic}
              disabled={loading}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading || name.trim().length < 3}
            style={{
              backgroundColor: 'var(--theme-accent-0)',
              color: 'white',
            }}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Create Club
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
