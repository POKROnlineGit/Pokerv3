import type { HandStats, PreflopStatsFilters } from '@/lib/types/preflopStats';

export interface PreflopStatsSidebarProps {
  filters: PreflopStatsFilters;
  onFiltersChange: (filters: PreflopStatsFilters) => void;
  hoveredHand: string | null;
  hoveredHandStats: HandStats | null;
  isLoading: boolean;
}

export interface PreflopStatsPageProps {
  userId: string;
}
