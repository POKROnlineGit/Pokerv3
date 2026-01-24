import { createClientComponentClient } from './client';
import type {
  HandStats,
  PreflopStatsFilters,
  PreflopStatsRawRow,
  PlayerCountFilter,
  PokerPosition,
  StatType
} from '@/lib/types/preflopStats';

function getPlayerCountRange(filter: PlayerCountFilter): { min: number | null; max: number | null } {
  switch (filter) {
    case 'heads_up':
      return { min: 2, max: 2 };
    case '3-6':
      return { min: 3, max: 6 };
    case '7+':
      return { min: 7, max: null };
    case 'all':
    default:
      return { min: null, max: null };
  }
}

function transformRawRow(row: PreflopStatsRawRow): HandStats {
  return {
    holeCards: row.hole_cards,
    totalHands: Number(row.total_hands) || 0,
    vpipCount: Number(row.vpip_count) || 0,
    pfrCount: Number(row.pfr_count) || 0,
    threeBetCount: Number(row.three_bet_count) || 0,
    canThreeBetCount: Number(row.can_three_bet_count) || 0,
    cbetCount: Number(row.cbet_count) || 0,
    canCbetCount: Number(row.can_cbet_count) || 0,
    sawFlopCount: Number(row.saw_flop_count) || 0,
    showdownCount: Number(row.showdown_count) || 0,
    wonCount: Number(row.won_count) || 0,
    netChipsTotal: Number(row.net_chips_total) || 0,
  };
}

export async function fetchPreflopStats(
  userId: string,
  filters: PreflopStatsFilters
): Promise<HandStats[]> {
  const supabase = createClientComponentClient();
  const { min, max } = getPlayerCountRange(filters.playerCount);

  const { data, error } = await supabase.rpc('get_preflop_stats_by_hand', {
    target_player_id: userId,
    min_player_count: min,
    max_player_count: max,
    target_position: filters.position === 'all' ? null : filters.position,
  });

  if (error) {
    console.error('Error fetching preflop stats:', error);
    return [];
  }

  if (!data) {
    return [];
  }

  return (data as PreflopStatsRawRow[]).map(transformRawRow);
}

export function getStatPercentage(stats: HandStats, statType: StatType): number {
  if (stats.totalHands === 0) return 0;

  switch (statType) {
    case 'vpip':
      return (stats.vpipCount / stats.totalHands) * 100;
    case 'pfr':
      return (stats.pfrCount / stats.totalHands) * 100;
    case '3bet':
      return stats.canThreeBetCount > 0
        ? (stats.threeBetCount / stats.canThreeBetCount) * 100
        : 0;
    case 'cbet':
      return stats.canCbetCount > 0
        ? (stats.cbetCount / stats.canCbetCount) * 100
        : 0;
    case 'saw_flop':
      return (stats.sawFlopCount / stats.totalHands) * 100;
    default:
      return 0;
  }
}

export function buildGridData(
  stats: HandStats[],
  statType: StatType
): Map<string, { percentage: number; sampleSize: number }> {
  const gridData = new Map<string, { percentage: number; sampleSize: number }>();

  for (const stat of stats) {
    const percentage = getStatPercentage(stat, statType);
    gridData.set(stat.holeCards, {
      percentage,
      sampleSize: stat.totalHands,
    });
  }

  return gridData;
}
