/**
 * Browser-compatible hand evaluator for bot decisions
 * Simplified version that doesn't require Node.js modules
 */

import { Card } from '../core/types';

// Simple hand ranking (0-9, higher is better)
// 9 = Straight Flush, 8 = Four of a Kind, etc.
export function evaluateHandSimple(cards: Card[]): { rank: number; value: number } {
  if (cards.length < 5) {
    return { rank: 0, value: 0 };
  }

  // For 7 cards, find best 5-card combination
  let bestHand = { rank: 0, value: 0 };
  
  if (cards.length === 7) {
    // Try all 21 combinations of 5 cards from 7
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const fiveCardHand = cards.filter((_, idx) => idx !== i && idx !== j);
        const evaluation = evaluateFiveCardHand(fiveCardHand);
        if (evaluation.rank > bestHand.rank || 
            (evaluation.rank === bestHand.rank && evaluation.value > bestHand.value)) {
          bestHand = evaluation;
        }
      }
    }
    return bestHand;
  }

  return evaluateFiveCardHand(cards);
}

function evaluateFiveCardHand(cards: Card[]): { rank: number; value: number } {
  if (cards.length !== 5) {
    return { rank: 0, value: 0 };
  }

  const ranks = cards.map(c => c[0]);
  const suits = cards.map(c => c[1]);
  
  const rankCounts: Record<string, number> = {};
  const suitCounts: Record<string, number> = {};
  
  ranks.forEach(r => rankCounts[r] = (rankCounts[r] || 0) + 1);
  suits.forEach(s => suitCounts[s] = (suitCounts[s] || 0) + 1);
  
  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  const maxSuitCount = Math.max(...Object.values(suitCounts));
  
  // Check for flush
  const isFlush = maxSuitCount >= 5;
  
  // Check for straight
  const rankOrder = '23456789TJQKA';
  const sortedRanks = [...new Set(ranks)].sort((a, b) => 
    rankOrder.indexOf(a) - rankOrder.indexOf(b)
  );
  let isStraight = false;
  if (sortedRanks.length >= 5) {
    for (let i = 0; i <= sortedRanks.length - 5; i++) {
      const sequence = sortedRanks.slice(i, i + 5);
      const indices = sequence.map(r => rankOrder.indexOf(r));
      const consecutive = indices.every((idx, j) => 
        j === 0 || idx === indices[j - 1] + 1
      );
      if (consecutive) {
        isStraight = true;
        break;
      }
    }
    // Check for A-2-3-4-5 straight
    if (!isStraight && sortedRanks.includes('A') && sortedRanks.includes('2') && 
        sortedRanks.includes('3') && sortedRanks.includes('4') && sortedRanks.includes('5')) {
      isStraight = true;
    }
  }
  
  // Determine hand rank
  if (isStraight && isFlush) {
    return { rank: 9, value: 900000 }; // Straight Flush
  }
  if (counts[0] === 4) {
    return { rank: 8, value: 800000 }; // Four of a Kind
  }
  if (counts[0] === 3 && counts[1] === 2) {
    return { rank: 7, value: 700000 }; // Full House
  }
  if (isFlush) {
    return { rank: 6, value: 600000 }; // Flush
  }
  if (isStraight) {
    return { rank: 5, value: 500000 }; // Straight
  }
  if (counts[0] === 3) {
    return { rank: 4, value: 400000 }; // Three of a Kind
  }
  if (counts[0] === 2 && counts[1] === 2) {
    return { rank: 3, value: 300000 }; // Two Pair
  }
  if (counts[0] === 2) {
    return { rank: 2, value: 200000 }; // One Pair
  }
  return { rank: 1, value: 100000 }; // High Card
}

// Get hand strength as 0-1 value for bot decisions
export function getHandStrength(cards: Card[]): number {
  if (cards.length < 5) return 0.5;
  
  const evaluation = evaluateHandSimple(cards);
  // Normalize to 0-1 scale using both rank and value
  // Base strength from rank (0-1), plus value component for tie-breaking
  const rankStrength = evaluation.rank / 9;
  const valueStrength = Math.min(evaluation.value / 1000000, 1.0);
  return rankStrength * 0.8 + valueStrength * 0.2;
}

