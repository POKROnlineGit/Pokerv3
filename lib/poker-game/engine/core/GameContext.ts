import { GameContext, Player, Card, Pot } from './types';
import { createDeck, shuffleDeck, dealCards } from '../utils/deck';
import { nextSeat } from '../utils/seatUtils';

/**
 * Immutable GameContext factory functions
 */

export function createInitialContext(
  gameId: string,
  players: Player[],
  smallBlind: number = 1,
  bigBlind: number = 2
): GameContext {
  return {
    gameId,
    maxPlayers: 6,
    players: [...players],
    buttonSeat: 1,
    smallBlind,
    bigBlind,
    deck: shuffleDeck(createDeck()),
    communityCards: [],
    pots: [{ amount: 0, eligiblePlayers: [] }],
    currentPhase: 'waiting',
    currentActorSeat: null,
    firstActorSeat: null,
    minRaise: bigBlind * 2,
    lastAggressorSeat: null,
    handHistory: [],
    handNumber: 0,
  };
}

export function updateContext(ctx: GameContext, updates: Partial<GameContext>): GameContext {
  return { ...ctx, ...updates };
}

export function addToHistory(ctx: GameContext, message: string): GameContext {
  return {
    ...ctx,
    handHistory: [...ctx.handHistory, message],
  };
}

export function resetPlayerBets(ctx: GameContext): GameContext {
  return {
    ...ctx,
    players: ctx.players.map(p => ({
      ...p,
      currentBet: 0,
    })),
  };
}

/**
 * Reset eligibleToBet for all non-all-in players at the start of a betting round
 */
export function resetEligibleToBet(ctx: GameContext): GameContext {
  return {
    ...ctx,
    players: ctx.players.map(p => ({
      ...p,
      eligibleToBet: p.allIn ? false : true, // All-in players are never eligible
    })),
  };
}

/**
 * Make all non-folded, non-all-in players eligible to bet (called when someone raises)
 */
export function makeAllEligible(ctx: GameContext): GameContext {
  return {
    ...ctx,
    players: ctx.players.map(p => ({
      ...p,
      eligibleToBet: (p.folded || p.allIn) ? false : true,
    })),
  };
}

export function dealHoleCards(ctx: GameContext): GameContext {
  let deck = [...ctx.deck];
  const players = ctx.players.map(player => {
    if (player.chips > 0 && !player.folded) {
      const { cards, remaining } = dealCards(deck, 2);
      deck = remaining;
      return {
        ...player,
        holeCards: cards,
      };
    }
    return player;
  });

  return {
    ...ctx,
    deck,
    players,
  };
}

export function postBlinds(ctx: GameContext): GameContext {
  const sbSeat = nextSeat(ctx.buttonSeat);
  const bbSeat = nextSeat(sbSeat);
  
  let pot = 0;
  const players = ctx.players.map(player => {
    if (player.seat === sbSeat) {
      const amount = Math.min(ctx.smallBlind, player.chips);
      pot += amount;
      const updated = {
        ...player,
        chips: player.chips - amount,
        currentBet: amount,
        totalBet: amount,
      };
      if (updated.chips === 0) {
        updated.allIn = true;
      }
      return updated;
    }
    if (player.seat === bbSeat) {
      const amount = Math.min(ctx.bigBlind, player.chips);
      pot += amount;
      const updated = {
        ...player,
        chips: player.chips - amount,
        currentBet: amount,
        totalBet: amount,
      };
      if (updated.chips === 0) {
        updated.allIn = true;
      }
      return updated;
    }
    return player;
  });

  return {
    ...ctx,
    players,
    pots: [{ amount: pot, eligiblePlayers: players.filter(p => !p.folded && p.chips > 0).map(p => p.id) }],
  };
}

