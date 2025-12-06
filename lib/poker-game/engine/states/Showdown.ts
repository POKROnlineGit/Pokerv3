import { GameState } from './GameState';
import { GameContext, Action, ActionType } from '../core/types';
import { addToHistory } from '../core/GameContext';
import { HandComplete } from './HandComplete';
import { evaluateHand, bestHand } from '../evaluation/showdownCalculator';

// Generate all possible 5-card combinations from N cards (where N >= 5)
function generateFiveCardCombinations(cards: string[]): string[][] {
  if (cards.length < 5) {
    return [];
  }
  if (cards.length === 5) {
    return [cards];
  }

  const combinations: string[][] = [];

  // Generate all combinations of 5 cards from the input
  function combine(start: number, combo: string[]) {
    if (combo.length === 5) {
      combinations.push([...combo]);
      return;
    }

    for (let i = start; i < cards.length; i++) {
      combo.push(cards[i]);
      combine(i + 1, combo);
      combo.pop();
    }
  }

  combine(0, []);
  return combinations;
}

// Find the best 5-card hand from 5, 6, or 7 cards
function findBestHandFromSeven(
  cardsOrHoleCards: string[],
  communityCards?: string[]
): { rank: number; type: string } | null {
  try {
    // Handle both signatures: (cards) or (holeCards, communityCards)
    let allCards: string[];
    if (communityCards !== undefined) {
      // Two-parameter version: holeCards + communityCards
      allCards = [...cardsOrHoleCards, ...communityCards];
    } else {
      // Single-parameter version: already all cards
      allCards = cardsOrHoleCards;
    }

    if (!Array.isArray(allCards) || allCards.length < 5) {
      return null;
    }

    // If exactly 5 cards, evaluate directly
    if (allCards.length === 5) {
      try {
        return evaluateHand(allCards);
      } catch (error) {
        console.error(
          "Error evaluating 5-card hand in findBestHandFromSeven:",
          error,
          "Cards:",
          allCards
        );
        return null;
      }
    }

    // For 6 or 7 cards, generate all combinations and find the best
    const combinations = generateFiveCardCombinations(allCards);

    if (combinations.length === 0) {
      return null;
    }

    // bestHand already returns the highest-ranked one
    const result = bestHand(combinations);
    return {
      rank: result.rank,
      type: result.type,
    };
  } catch (error) {
    console.error("Error in findBestHandFromSeven:", error);
    return null;
  }
}

export class Showdown implements GameState {
  phase = 'showdown' as const;

  onEnter(ctx: GameContext): GameContext {
    let newCtx = { ...ctx };
    
    // Find all players still in the hand
    const activePlayers = newCtx.players.filter(p => !p.folded && p.chips > 0);
    
    if (activePlayers.length === 1) {
      // Only one player left - award pot
      const winner = activePlayers[0];
      const totalPot = newCtx.pots.reduce((sum, pot) => sum + pot.amount, 0);
      newCtx.players = newCtx.players.map(p => 
        p.id === winner.id 
          ? { ...p, chips: p.chips + totalPot }
          : p
      );
      // Clear pots after distribution
      newCtx.pots = [];
      newCtx = addToHistory(newCtx, `Seat ${winner.seat} wins ${totalPot} chips (all others folded)`);
    } else {
      // Evaluate hands using the showdown calculator
      const evaluations = activePlayers.map(player => {
        try {
          const allCards = [...player.holeCards, ...newCtx.communityCards];
          const evaluation = findBestHandFromSeven(allCards);
          
          if (!evaluation) {
            // Fallback: return lowest possible rank
            return {
              player,
              rank: 0,
              type: 'Invalid Hand',
            };
          }
          
          return {
            player,
            rank: evaluation.rank,
            type: evaluation.type,
          };
        } catch (error) {
          console.error(`Error evaluating hand for player ${player.id}:`, error);
          // Fallback: return lowest possible rank
          return {
            player,
            rank: 0,
            type: 'Invalid Hand',
          };
        }
      });
      
      // Sort by hand rank (descending - higher rank = better hand)
      evaluations.sort((a, b) => b.rank - a.rank);
      
      // Award pots
      const winners = evaluations.filter(e => e.rank === evaluations[0].rank);
      const totalPot = newCtx.pots.reduce((sum, pot) => sum + pot.amount, 0);
      const winningsPerPlayer = Math.floor(totalPot / winners.length);
      const remainder = totalPot - (winningsPerPlayer * winners.length); // Handle rounding
      
      const winnerIds = winners.map(w => w.player.id);
      const firstWinnerId = winners[0].player.id;
      
      // Award chips to winners
      newCtx.players = newCtx.players.map(p => {
        if (winnerIds.includes(p.id)) {
          // Give base winnings, plus remainder to first winner (by evaluation order)
          const extra = p.id === firstWinnerId ? remainder : 0;
          const winnings = winningsPerPlayer + extra;
          return { ...p, chips: p.chips + winnings };
        }
        return p;
      });
      
      // Clear pots after distribution
      newCtx.pots = [];
      
      // Update hand history with actual hand types
      winners.forEach((winner) => {
        const player = newCtx.players.find(p => p.id === winner.player.id)!;
        const extra = winner.player.id === firstWinnerId ? remainder : 0;
        const actualWinnings = winningsPerPlayer + extra;
        newCtx = addToHistory(
          newCtx, 
          `Seat ${player.seat} wins ${actualWinnings} chips with ${winner.type}`
        );
      });
      
      // Also log losing hands for debugging
      const losers = evaluations.filter(e => e.rank < evaluations[0].rank);
      losers.forEach(loser => {
        const player = newCtx.players.find(p => p.id === loser.player.id)!;
        newCtx = addToHistory(
          newCtx,
          `Seat ${player.seat} shows ${loser.type}`
        );
      });
    }
    
    newCtx.currentPhase = 'showdown';
    newCtx.currentActorSeat = null;
    
    return newCtx;
  }

  onAction(ctx: GameContext, action: Action): GameContext {
    return ctx;
  }

  getLegalActions(ctx: GameContext, seat: number): ActionType[] {
    return [];
  }

  shouldTransition(ctx: GameContext): boolean {
    // Don't auto-transition - the store will call forceTransition() after 5 seconds
    // This prevents immediate transition when showdown state is entered
    return false;
  }

  getNextState(): GameState | null {
    return new HandComplete();
  }
}

