'use client'

import { useState } from 'react'
import { NormalizedClub, NormalizedClubMember } from '@/lib/types/club'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Crown, Copy, Ban, Users, Lock, Globe } from 'lucide-react'
import { useToast } from '@/lib/hooks'
import { ClubBanDialog } from './ClubBanDialog'
import { UserProfileFooter } from '@/components/layout/UserProfileFooter'

interface ClubSidebarProps {
  club: NormalizedClub
  members: NormalizedClubMember[]
  isLeader: boolean
  userId: string
  onMemberKicked?: (userId: string) => void
  onMemberBanned?: (userId: string) => void
}

export function ClubSidebar({
  club,
  members,
  isLeader,
  userId,
  onMemberKicked,
  onMemberBanned,
}: ClubSidebarProps) {
  const { toast } = useToast()
  const [banDialogOpen, setBanDialogOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<NormalizedClubMember | null>(null)

  const copyInviteLink = () => {
    const link = `${window.location.origin}/social/clubs/join/${club.inviteCode}`
    navigator.clipboard.writeText(link)
    toast({
      title: 'Copied!',
      description: 'Invite link copied to clipboard',
    })
  }

  const handleBanClick = (member: NormalizedClubMember) => {
    setSelectedMember(member)
    setBanDialogOpen(true)
  }

  return (
    <Card className="flex flex-col h-[calc(100vh-8rem)] bg-card backdrop-blur-sm w-[280px] rounded-lg shadow-sm">
      {/* Club info header */}
      <CardHeader className="flex-shrink-0 border-b p-4 rounded-t-lg transition-none">
        <div className="flex items-center gap-2 mb-2">
          {club.isPublic ? (
            <Globe className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Lock className="h-4 w-4 text-muted-foreground" />
          )}
          <CardTitle className="text-2xl font-bold text-white tracking-tight truncate">
            {club.name}
          </CardTitle>
        </div>
        {club.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {club.description}
          </p>
        )}
        <div className="flex items-center justify-between">
          <Badge variant="outline">
            <Users className="h-3 w-3 mr-1" />
            {members.length}/{club.maxMembers}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={copyInviteLink}
          >
            <Copy className="h-3 w-3 mr-1" />
            Invite
          </Button>
        </div>
      </CardHeader>

      {/* Members list */}
      <div className="flex-1 overflow-hidden">
        <div className="p-3 border-b">
          <h3 className="text-sm font-medium">Members</h3>
        </div>
        <ScrollArea className="h-[calc(100%-48px)]">
          <div className="p-2 space-y-1">
            {members.map((member) => (
              <div
                key={member.userId}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {member.role === 'leader' && (
                    <Crown className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                  )}
                  <span className="text-sm truncate">{member.username}</span>
                </div>
                {isLeader && member.userId !== userId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleBanClick(member)}
                  >
                    <Ban className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* User Profile Footer */}
      <UserProfileFooter className="rounded-b-lg" />

      {/* Dialogs */}
      <ClubBanDialog
        open={banDialogOpen}
        onOpenChange={setBanDialogOpen}
        clubId={club.id}
        member={selectedMember}
        onBanned={() => {
          if (selectedMember) {
            onMemberBanned?.(selectedMember.userId)
          }
        }}
      />
    </Card>
  )
}
