'use client'

import { useState } from 'react'
import { NormalizedClub, NormalizedClubMember } from '@/lib/types/club'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Crown,
  Settings,
  Copy,
  LogOut,
  UserMinus,
  Ban,
  Trash2,
  Users,
  Lock,
  Globe,
} from 'lucide-react'
import { useToast } from '@/lib/hooks'
import { ClubSettingsDialog } from './ClubSettingsDialog'
import { ClubBanDialog } from './ClubBanDialog'
import { ClubLeaveDialog } from './ClubLeaveDialog'
import { UserProfileFooter } from '@/components/layout/UserProfileFooter'

interface ClubSidebarProps {
  club: NormalizedClub
  members: NormalizedClubMember[]
  isLeader: boolean
  userId: string
  onLeave: () => void
  onMemberKicked?: (userId: string) => void
  onMemberBanned?: (userId: string) => void
  onClubUpdated?: (club: NormalizedClub) => void
  onClubDisbanded?: () => void
}

export function ClubSidebar({
  club,
  members,
  isLeader,
  userId,
  onLeave,
  onMemberKicked,
  onMemberBanned,
  onClubUpdated,
  onClubDisbanded,
}: ClubSidebarProps) {
  const { toast } = useToast()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [banDialogOpen, setBanDialogOpen] = useState(false)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
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
    <div className="flex flex-col h-full border-l bg-card w-[280px]">
      {/* Club info header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-2">
          {club.isPublic ? (
            <Globe className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Lock className="h-4 w-4 text-muted-foreground" />
          )}
          <h2 className="font-semibold truncate">{club.name}</h2>
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
      </div>

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

      {/* Actions footer */}
      <div className="p-3 border-t space-y-2">
        {isLeader && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-4 w-4 mr-2" />
            Club Settings
          </Button>
        )}
        <Button
          variant="destructive"
          className="w-full"
          onClick={() => setLeaveDialogOpen(true)}
        >
          {isLeader ? (
            <>
              <Trash2 className="h-4 w-4 mr-2" />
              Disband Club
            </>
          ) : (
            <>
              <LogOut className="h-4 w-4 mr-2" />
              Leave Club
            </>
          )}
        </Button>
      </div>

      {/* User Profile Footer */}
      <UserProfileFooter />

      {/* Dialogs */}
      <ClubSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        club={club}
        onClubUpdated={onClubUpdated}
      />

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

      <ClubLeaveDialog
        open={leaveDialogOpen}
        onOpenChange={setLeaveDialogOpen}
        clubId={club.id}
        isLeader={isLeader}
        onLeave={onLeave}
        onDisbanded={onClubDisbanded}
      />
    </div>
  )
}
