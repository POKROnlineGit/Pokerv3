'use client'

import { useEffect, useState } from 'react'
import { useClubSocket } from '@/lib/api/socket'
import { ClubMemberStats, LifetimeStats, normalizeClubMemberStats } from '@/lib/types/club'
import { createClientComponentClient } from '@/lib/api/supabase/client'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Loader2, Crown, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks'

interface ClubStatsProps {
  clubId: string
}

export function ClubStats({ clubId }: ClubStatsProps) {
  const { getMemberStats } = useClubSocket()
  const { toast } = useToast()
  const supabase = createClientComponentClient()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<ClubMemberStats[]>([])

  const fetchStats = async () => {
    setLoading(true)
    try {
      const result = await getMemberStats(clubId)
      if ('error' in result) {
        toast({
          title: 'Error',
          description: result.error,
          variant: 'destructive',
        })
        return
      }

      const normalizedStats = result.stats.map((s) =>
        normalizeClubMemberStats(s as unknown as Record<string, unknown>)
      )

      // Fetch lifetime stats for each member using the public RPC
      const lifetimeStatsPromises = normalizedStats.map(async (member) => {
        const { data, error } = await supabase.rpc('get_lifetime_stats_public', {
          target_user_id: member.userId,
        })
        if (error) {
          console.error(`Error fetching lifetime stats for ${member.username}:`, error)
          return { userId: member.userId, lifetimeChipChange: null }
        }
        const lifetimeData = data as LifetimeStats | null
        return {
          userId: member.userId,
          lifetimeChipChange: lifetimeData?.lifetime_chip_change ?? 0,
        }
      })

      const lifetimeStatsResults = await Promise.all(lifetimeStatsPromises)
      const lifetimeStatsMap = new Map(
        lifetimeStatsResults.map((r) => [r.userId, r.lifetimeChipChange])
      )

      // Merge lifetime stats into normalized stats
      const statsWithLifetime = normalizedStats.map((member) => ({
        ...member,
        lifetimeChipChange: lifetimeStatsMap.get(member.userId) ?? null,
      }))

      setStats(statsWithLifetime)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load stats',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [clubId])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Member Statistics</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchStats}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead className="text-right">Hands</TableHead>
              <TableHead className="text-right">VPIP%</TableHead>
              <TableHead className="text-right">PFR%</TableHead>
              <TableHead className="text-right">Lifetime +/-</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No member stats available
                </TableCell>
              </TableRow>
            ) : (
              stats.map((member) => (
                <TableRow key={member.userId}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {member.role === 'leader' && (
                        <Crown className="h-4 w-4 text-yellow-500" />
                      )}
                      <span className="font-medium">{member.username}</span>
                      {member.role === 'leader' && (
                        <Badge variant="secondary" className="text-xs">
                          Leader
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {member.handsPlayed.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {member.vpipPercent.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right">
                    {member.pfrPercent.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right">
                    {member.lifetimeChipChange === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : member.lifetimeChipChange > 0 ? (
                      <span className="flex items-center justify-end gap-1 text-green-500">
                        <TrendingUp className="h-4 w-4" />
                        +{member.lifetimeChipChange.toLocaleString()}
                      </span>
                    ) : member.lifetimeChipChange < 0 ? (
                      <span className="flex items-center justify-end gap-1 text-red-500">
                        <TrendingDown className="h-4 w-4" />
                        {member.lifetimeChipChange.toLocaleString()}
                      </span>
                    ) : (
                      <span className="flex items-center justify-end gap-1 text-muted-foreground">
                        <Minus className="h-4 w-4" />
                        0
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p><strong>VPIP</strong> - Voluntarily Put $ In Pot (how often you play hands)</p>
        <p><strong>PFR</strong> - Pre-Flop Raise (how often you raise pre-flop)</p>
        <p><strong>Lifetime +/-</strong> - Total chips won or lost across all games</p>
      </div>
    </div>
  )
}
