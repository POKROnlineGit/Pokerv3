'use client'

import { NormalizedClub } from '@/lib/types/club'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Users, Lock, Globe } from 'lucide-react'

interface ClubCardProps {
  club: NormalizedClub
  onJoin: (clubId: string) => void
  joining?: boolean
}

export function ClubCard({ club, onJoin, joining }: ClubCardProps) {
  const memberCount = club.memberCount ?? 0
  const isFull = memberCount >= club.maxMembers

  return (
    <Card className="bg-card backdrop-blur-sm border hover:border-primary/50 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {club.isPublic ? (
              <Globe className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Lock className="h-4 w-4 text-muted-foreground" />
            )}
            {club.name}
          </CardTitle>
          <Badge variant={isFull ? 'secondary' : 'outline'}>
            <Users className="h-3 w-3 mr-1" />
            {memberCount}/{club.maxMembers}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {club.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {club.description}
          </p>
        )}
        <Button
          className="w-full"
          onClick={() => onJoin(club.id)}
          disabled={isFull || joining}
          style={{
            backgroundColor: isFull ? undefined : 'var(--theme-accent-0)',
            color: isFull ? undefined : 'white',
          }}
          variant={isFull ? 'secondary' : 'default'}
        >
          {isFull ? 'Club Full' : joining ? 'Joining...' : 'Join Club'}
        </Button>
      </CardContent>
    </Card>
  )
}
