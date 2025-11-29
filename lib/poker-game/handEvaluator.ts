import { Card } from './types';
// @ts-ignore - poker-evaluator doesn't have types
import PokerEvaluator from 'poker-evaluator';

// Map our card format (Ah, Kd, etc.) to poker-evaluator format
function cardToEvaluatorFormat(card: Card): string {
  const rank = card[0];
  const suit = card[1].toUpperCase();
  
  // poker-evaluator uses: 2H, 3H, etc. (uppercase suit)
  return `${rank}${suit}`;
}

export function evaluateHand(cards: Card[]): { rank: number; value: number; name: string } {
  if (cards.length < 3) {
    throw new Error('Need at least 3 cards to evaluate hand');
  }

  // Convert cards to evaluator format
  const evaluatorCards = cards.map(cardToEvaluatorFormat);
  
  // poker-evaluator supports 3, 5, 6, or 7 cards
  const result = PokerEvaluator.evalHand(evaluatorCards);
  
  return {
    rank: result.handRank,
    value: result.value,
    name: result.handName
  };
}

export function compareHands(hand1: Card[], hand2: Card[]): number {
  // Returns: -1 if hand1 < hand2, 0 if equal, 1 if hand1 > hand2
  const eval1 = evaluateHand(hand1);
  const eval2 = evaluateHand(hand2);
  
  if (eval1.value < eval2.value) return -1;
  if (eval1.value > eval2.value) return 1;
  return 0;
}

export function findBestHand(playerCards: Card[], communityCards: Card[]): { cards: Card[]; evaluation: ReturnType<typeof evaluateHand> } {
  const allCards = [...playerCards, ...communityCards];
  
  if (allCards.length < 5) {
    throw new Error('Not enough cards to evaluate');
  }

  if (allCards.length === 5) {
    const evaluation = evaluateHand(allCards);
    return { cards: allCards, evaluation };
  }

  // For 7 cards, find best 5-card combination
  // This is a simplified version - poker-evaluator handles this internally
  const evaluation = evaluateHand(allCards);
  return { cards: allCards, evaluation };
}

