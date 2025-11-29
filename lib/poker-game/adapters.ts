import { GameContext } from './types';
import { getCurrentBet } from './actions';

/**
 * Adapter to convert new GameContext to old GameState format for UI compatibility
 * This allows existing components to work with the new engine
 */
export interface LegacyGameState {
  gameId: string;
  players: Array<{
    id: string;
    name: string;
    seat: number;
    chips: number;
    betThisRound: number;
    totalBet: number;
    holeCards: string[];
    folded: boolean;
    allIn: boolean;
    isBot?: boolean;
  }>;
  communityCards: string[];
  pot: number;
  sidePots: Array<{ amount: number; eligibleSeats: number[] }>;
  buttonSeat: number;
  sbSeat: number;
  bbSeat: number;
  currentRound: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
  currentActorSeat: number;
  minRaise: number;
  lastRaise: number;
  betsThisRound: number[];
  handNumber: number;
}

export function gameContextToLegacyState(ctx: GameContext): LegacyGameState {
  // Calculate SB and BB seats
  const sbSeat = ((ctx.buttonSeat % 6) + 1);
  const bbSeat = ((sbSeat % 6) + 1);
  
  // Convert pots
  const mainPot = ctx.pots[0]?.amount || 0;
  const sidePots = ctx.pots.slice(1).map(pot => ({
    amount: pot.amount,
    eligibleSeats: pot.eligiblePlayers
      .map(id => ctx.players.find(p => p.id === id)?.seat)
      .filter((seat): seat is number => seat !== undefined),
  }));

  // Map currentPhase to currentRound
  const phaseToRound: Record<GameContext['currentPhase'], LegacyGameState['currentRound']> = {
    waiting: 'preflop',
    preflop: 'preflop',
    flop: 'flop',
    turn: 'turn',
    river: 'river',
    showdown: 'showdown',
    complete: 'showdown',
  };

  // Calculate lastRaise from minRaise (approximation)
  const lastRaise = ctx.minRaise > 0 ? Math.floor(ctx.minRaise / 2) : 0;

  return {
    gameId: ctx.gameId,
    players: ctx.players.map(p => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      chips: p.chips,
      betThisRound: p.currentBet,
      totalBet: p.totalBet,
      holeCards: p.holeCards,
      folded: p.folded,
      allIn: p.allIn,
      isBot: p.isBot,
    })),
    communityCards: ctx.communityCards,
    pot: mainPot,
    sidePots,
    buttonSeat: ctx.buttonSeat,
    sbSeat,
    bbSeat,
    currentRound: phaseToRound[ctx.currentPhase],
    currentActorSeat: ctx.currentActorSeat || 0,
    minRaise: ctx.minRaise,
    lastRaise,
    betsThisRound: ctx.players.map(p => p.currentBet),
    handNumber: ctx.handNumber,
  };
}

