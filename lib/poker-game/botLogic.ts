import { GameContext, Action, ActionType } from './types';
import { getCurrentBet, validateAction } from './actions';
import { getHandStrength } from './botHandEvaluator';

// Pre-flop hand strength lookup (simplified)
const PREFLOP_STRENGTH: Record<string, number> = {
  'AA': 1.0, 'KK': 0.99, 'QQ': 0.98, 'JJ': 0.97, 'TT': 0.96,
  'AKs': 0.95, 'AKo': 0.92, 'AQs': 0.94, 'AQo': 0.91,
  'AJs': 0.93, 'AJo': 0.88, 'ATs': 0.92, 'ATo': 0.85,
  'KQs': 0.90, 'KQo': 0.87, 'KJs': 0.89, 'KJo': 0.84,
  'QJs': 0.88, 'QJo': 0.82, 'JTs': 0.87, 'JTo': 0.80,
};

function getPreflopStrength(cards: string[]): number {
  if (cards.length !== 2) return 0.5;
  const [c1, c2] = cards;
  const r1 = c1[0];
  const r2 = c2[0];
  const s1 = c1[1];
  const s2 = c2[1];
  const suited = s1 === s2;
  const pair = r1 === r2;

  let key = '';
  if (pair) {
    key = `${r1}${r1}`;
  } else {
    const ranks = [r1, r2].sort();
    key = `${ranks[0]}${ranks[1]}${suited ? 's' : 'o'}`;
  }

  return PREFLOP_STRENGTH[key] || 0.5;
}

function getPostflopStrength(playerCards: string[], communityCards: string[]): number {
  if (communityCards.length < 3) return 0.5;

  try {
    const allCards = [...playerCards, ...communityCards];
    if (allCards.length >= 5) {
      return getHandStrength(allCards as any);
    }
  } catch (e) {
    // Fallback
  }
  return 0.5;
}

export interface BotDecision {
  action: ActionType;
  amount?: number;
}

export function makeBotDecision(
  ctx: GameContext,
  botId: string,
  strategy: 'aggro' | 'tight' | 'calling' | 'random' | 'solid'
): BotDecision {
  const player = ctx.players.find(p => p.id === botId);
  if (!player || !player.holeCards || player.holeCards.length !== 2) {
    return { action: 'fold' };
  }

  const currentBet = getCurrentBet(ctx);
  const toCall = currentBet - player.currentBet;
  const pot = ctx.pots.reduce((sum, pot) => sum + pot.amount, 0);
  const potOdds = toCall > 0 ? pot / toCall : 0;

  // Get hand strength
  const isPreflop = ctx.communityCards.length === 0;
  const handStrength = isPreflop
    ? getPreflopStrength(player.holeCards)
    : getPostflopStrength(player.holeCards, ctx.communityCards);

  // Strategy-based decision
  switch (strategy) {
    case 'aggro':
      if (handStrength > 0.7) {
        const betSize = Math.min(Math.floor(pot * 0.75), player.chips);
        if (toCall === 0) return { action: 'bet', amount: betSize };
        return { action: 'raise', amount: Math.max(ctx.minRaise, Math.floor(betSize * 0.5)) };
      }
      if (handStrength > 0.5 && potOdds > 2) {
        return { action: 'call' };
      }
      if (toCall === 0) return { action: 'check' };
      return { action: 'fold' };

    case 'tight':
      if (handStrength > 0.8) {
        const betSize = Math.min(Math.floor(pot * 0.5), player.chips);
        if (toCall === 0) return { action: 'bet', amount: betSize };
        return { action: 'raise', amount: ctx.minRaise };
      }
      if (handStrength > 0.6 && potOdds > 3) {
        return { action: 'call' };
      }
      if (toCall === 0) return { action: 'check' };
      return { action: 'fold' };

    case 'calling':
      if (handStrength > 0.6) {
        if (toCall === 0) return { action: 'check' };
        return { action: 'call' };
      }
      if (potOdds > 4) {
        return { action: 'call' };
      }
      if (toCall === 0) return { action: 'check' };
      return { action: 'fold' };

    case 'random':
      const rand = Math.random();
      if (rand < 0.1 && toCall > 0) return { action: 'fold' };
      if (rand < 0.3 && toCall === 0) return { action: 'check' };
      if (rand < 0.5 && toCall > 0) return { action: 'call' };
      if (rand < 0.7 && toCall === 0) {
        return { action: 'bet', amount: Math.min(ctx.minRaise, player.chips) };
      }
      if (toCall > 0) {
        return { action: 'raise', amount: ctx.minRaise };
      }
      return { action: 'check' };

    case 'solid':
    default:
      if (handStrength > 0.75) {
        const betSize = Math.min(Math.floor(pot * 0.6), player.chips);
        if (toCall === 0) return { action: 'bet', amount: betSize };
        return { action: 'raise', amount: ctx.minRaise };
      }
      if (handStrength > 0.55 && potOdds > 2.5) {
        return { action: 'call' };
      }
      if (toCall === 0) return { action: 'check' };
      return { action: 'fold' };
  }
}

