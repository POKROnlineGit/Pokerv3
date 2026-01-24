'use client';

import { useState, useEffect, useMemo } from 'react';
import { RangeGrid } from '@/components/features/analysis/RangeGrid';
import { PreflopStatsSidebar } from './PreflopStatsSidebar';
import type { PreflopStatsPageProps } from './types';
import type { HandStats, PreflopStatsFilters } from '@/lib/types/preflopStats';
import { fetchPreflopStats, buildGridData } from '@/lib/api/supabase/preflopStats';

export function PreflopStatsPage({ userId }: PreflopStatsPageProps) {
  const [filters, setFilters] = useState<PreflopStatsFilters>({
    playerCount: 'all',
    position: 'all',
    statType: 'vpip',
  });
  const [hoveredHand, setHoveredHand] = useState<string | null>(null);
  const [stats, setStats] = useState<HandStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch stats when filters or userId changes
  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      setIsLoading(true);
      const data = await fetchPreflopStats(userId, filters);
      if (!cancelled) {
        setStats(data);
        setIsLoading(false);
      }
    };

    loadStats();

    return () => {
      cancelled = true;
    };
  }, [userId, filters]);

  // Build grid data for the selected stat type
  const gridData = useMemo(() => {
    return buildGridData(stats, filters.statType);
  }, [stats, filters.statType]);

  // Find hovered hand stats
  const hoveredHandStats = useMemo(() => {
    if (!hoveredHand) return null;
    return stats.find((s) => s.holeCards === hoveredHand) ?? null;
  }, [hoveredHand, stats]);

  return (
    <div className="flex h-screen">
      {/* Main grid area */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 w-full max-w-[80vh]">
          <h1 className="text-2xl font-bold">Preflop Range Stats</h1>
          <p className="text-muted-foreground text-sm">
            {isLoading
              ? 'Loading your stats...'
              : stats.length === 0
              ? 'No hands recorded yet. Play some games to see your stats!'
              : `Showing ${filters.statType.toUpperCase()} percentages`}
          </p>
          <RangeGrid
            selectedHands={new Set()}
            onToggle={() => {}}
            statsData={gridData}
            onCellHover={setHoveredHand}
            hoveredHand={hoveredHand}
            readOnly
            className="w-full"
          />
        </div>
      </div>

      {/* Sidebar */}
      <div className="flex-shrink-0 flex items-center pr-4">
        <PreflopStatsSidebar
          filters={filters}
          onFiltersChange={setFilters}
          hoveredHand={hoveredHand}
          hoveredHandStats={hoveredHandStats}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
