export type PokerPosition =
  | 'BTN' | 'SB' | 'BB'
  | 'UTG' | 'UTG+1' | 'UTG+2'
  | 'MP' | 'MP+1' | 'LJ' | 'HJ' | 'CO';

export type PlayerCountFilter = 'all' | 'heads_up' | '3-6' | '7+';
export type StatType = 'vpip' | 'pfr' | '3bet' | 'cbet' | 'saw_flop';

export interface HandStats {
  holeCards: string;
  totalHands: number;
  vpipCount: number;
  pfrCount: number;
  threeBetCount: number;
  canThreeBetCount: number;
  cbetCount: number;
  canCbetCount: number;
  sawFlopCount: number;
  showdownCount: number;
  wonCount: number;
  netChipsTotal: number;
}

export interface PreflopStatsFilters {
  playerCount: PlayerCountFilter;
  position: PokerPosition | 'all';
  statType: StatType;
}

export interface GridCellData {
  hand: string;
  percentage: number;
  sampleSize: number;
}

export interface PreflopStatsRawRow {
  hole_cards: string;
  total_hands: number;
  vpip_count: number;
  pfr_count: number;
  three_bet_count: number;
  can_three_bet_count: number;
  cbet_count: number;
  can_cbet_count: number;
  saw_flop_count: number;
  showdown_count: number;
  won_count: number;
  net_chips_total: number;
}
