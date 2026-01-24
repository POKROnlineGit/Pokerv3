'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import type { PreflopStatsSidebarProps } from './types';
import type { PlayerCountFilter, PokerPosition, StatType } from '@/lib/types/preflopStats';
import { UserProfileFooter } from '@/components/layout/UserProfileFooter';

const PLAYER_COUNT_OPTIONS: { value: PlayerCountFilter; label: string }[] = [
  { value: 'all', label: 'All Table Sizes' },
  { value: 'heads_up', label: 'Heads Up (2)' },
  { value: '3-6', label: '3-6 Players' },
  { value: '7+', label: '7+ Players' },
];

const POSITION_OPTIONS: { value: PokerPosition | 'all'; label: string }[] = [
  { value: 'all', label: 'All Positions' },
  { value: 'UTG', label: 'Under the Gun (UTG)' },
  { value: 'UTG+1', label: 'UTG+1' },
  { value: 'UTG+2', label: 'UTG+2' },
  { value: 'MP', label: 'Middle Position (MP)' },
  { value: 'MP+1', label: 'MP+1' },
  { value: 'LJ', label: 'Lojack (LJ)' },
  { value: 'HJ', label: 'Hijack (HJ)' },
  { value: 'CO', label: 'Cutoff (CO)' },
  { value: 'BTN', label: 'Button (BTN)' },
  { value: 'SB', label: 'Small Blind (SB)' },
  { value: 'BB', label: 'Big Blind (BB)' },
];

const STAT_TYPE_OPTIONS: { value: StatType; label: string }[] = [
  { value: 'vpip', label: 'VPIP' },
  { value: 'pfr', label: 'PFR' },
  { value: '3bet', label: '3-Bet' },
  { value: 'cbet', label: 'C-Bet' },
  { value: 'saw_flop', label: 'Saw Flop' },
];

function formatPercentage(count: number, total: number): string {
  if (total === 0) return '0.0%';
  return ((count / total) * 100).toFixed(1) + '%';
}

function formatChips(chips: number): string {
  if (chips >= 0) {
    return '+' + chips.toLocaleString();
  }
  return chips.toLocaleString();
}

export function PreflopStatsSidebar({
  filters,
  onFiltersChange,
  hoveredHand,
  hoveredHandStats,
  isLoading,
}: PreflopStatsSidebarProps) {
  const handlePlayerCountChange = (value: PlayerCountFilter) => {
    onFiltersChange({ ...filters, playerCount: value });
  };

  const handlePositionChange = (value: PokerPosition | 'all') => {
    onFiltersChange({ ...filters, position: value });
  };

  const handleStatTypeChange = (value: StatType) => {
    onFiltersChange({ ...filters, statType: value });
  };

  return (
    <Card className="flex flex-col h-[calc(100vh-8rem)] bg-card backdrop-blur-sm w-[280px] rounded-lg shadow-sm">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Link href="/profile" className="p-1 -ml-1 hover:bg-muted/50 rounded transition-colors">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </Link>
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Preflop Statistics</h2>
        </div>
      </div>

      {/* Filters Section */}
      <div className="p-4 space-y-4 border-b">
        <div className="space-y-2">
          <Label htmlFor="player-count">Table Size</Label>
          <Select
            value={filters.playerCount}
            onValueChange={handlePlayerCountChange}
          >
            <SelectTrigger id="player-count">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAYER_COUNT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="position">Position</Label>
          <Select
            value={filters.position}
            onValueChange={handlePositionChange}
          >
            <SelectTrigger id="position">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POSITION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="stat-type">Stat Type</Label>
          <Select
            value={filters.statType}
            onValueChange={handleStatTypeChange}
          >
            <SelectTrigger id="stat-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAT_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Hover Stats Section */}
      <ScrollArea className="flex-1 p-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            Loading stats...
          </div>
        ) : hoveredHandStats ? (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-center mb-4">
              {hoveredHand}
            </h3>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Hands</span>
                <span className="font-medium">{hoveredHandStats.totalHands.toLocaleString()}</span>
              </div>

              <div className="h-px bg-border my-2" />

              <div className="flex justify-between">
                <span className="text-muted-foreground">VPIP</span>
                <span className="font-medium">
                  {formatPercentage(hoveredHandStats.vpipCount, hoveredHandStats.totalHands)}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">PFR</span>
                <span className="font-medium">
                  {formatPercentage(hoveredHandStats.pfrCount, hoveredHandStats.totalHands)}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">3-Bet</span>
                <span className="font-medium">
                  {formatPercentage(hoveredHandStats.threeBetCount, hoveredHandStats.canThreeBetCount)}
                  <span className="text-xs text-muted-foreground ml-1">
                    ({hoveredHandStats.threeBetCount}/{hoveredHandStats.canThreeBetCount})
                  </span>
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">C-Bet</span>
                <span className="font-medium">
                  {formatPercentage(hoveredHandStats.cbetCount, hoveredHandStats.canCbetCount)}
                  <span className="text-xs text-muted-foreground ml-1">
                    ({hoveredHandStats.cbetCount}/{hoveredHandStats.canCbetCount})
                  </span>
                </span>
              </div>

              <div className="h-px bg-border my-2" />

              <div className="flex justify-between">
                <span className="text-muted-foreground">Saw Flop</span>
                <span className="font-medium">
                  {formatPercentage(hoveredHandStats.sawFlopCount, hoveredHandStats.totalHands)}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Showdown</span>
                <span className="font-medium">
                  {formatPercentage(hoveredHandStats.showdownCount, hoveredHandStats.totalHands)}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Win Rate</span>
                <span className="font-medium">
                  {formatPercentage(hoveredHandStats.wonCount, hoveredHandStats.totalHands)}
                </span>
              </div>

              <div className="h-px bg-border my-2" />

              <div className="flex justify-between">
                <span className="text-muted-foreground">Net Chips</span>
                <span className={`font-medium ${hoveredHandStats.netChipsTotal >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {formatChips(hoveredHandStats.netChipsTotal)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Hover over a hand to see detailed stats
          </p>
        )}
      </ScrollArea>

      {/* User Profile Footer */}
      <UserProfileFooter className="rounded-b-lg" />
    </Card>
  );
}
