/**
 * Helper function to update player hand types based on current cards
 * Called when community cards are dealt or state changes
 */

import { GameContext, Player } from "../core/types";
import { evaluateHand, bestHand } from "./showdownCalculator";
import type { HandEvaluation } from "./showdownCalculator";

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
): HandEvaluation | null {
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

/**
 * Update playerHandType for all active players based on their hole cards and community cards
 * Only updates if player has 2 hole cards and there are enough community cards (3+)
 */
export function updatePlayerHandTypes(ctx: GameContext): GameContext {
  const newCtx = { ...ctx };

  // Only update if we have at least 3 community cards (flop)
  if (newCtx.communityCards.length < 3) {
    // Reset hand types if not enough cards
    newCtx.players = newCtx.players.map((p) => ({
      ...p,
      playerHandType: undefined,
    }));
    return newCtx;
  }

  // Update hand types for all players who haven't folded and have hole cards
  newCtx.players = newCtx.players.map((player) => {
    // Skip if player has folded or doesn't have hole cards
    if (player.folded || player.holeCards.length < 2) {
      return {
        ...player,
        playerHandType: undefined,
      };
    }

    // Calculate best hand from hole cards + community cards
    try {
      const totalCards = player.holeCards.length + newCtx.communityCards.length;

      // Only calculate if we have at least 5 cards total
      if (totalCards >= 5) {
        // Combine hole cards and community cards
        const allCards = [...player.holeCards, ...newCtx.communityCards];

        // Use findBestHandFromSeven which now handles 5, 6, or 7 cards
        const result = findBestHandFromSeven(allCards);

        return {
          ...player,
          playerHandType: result ? result.type : undefined,
        };
      } else {
        // Not enough cards yet
        return {
          ...player,
          playerHandType: undefined,
        };
      }
    } catch (error) {
      console.error(
        `Error calculating hand type for player ${player.id}:`,
        error
      );
      return {
        ...player,
        playerHandType: undefined,
      };
    }
  });

  return newCtx;
}

/**
 * Reset all player hand types (called at start of new hand)
 */
export function resetPlayerHandTypes(ctx: GameContext): GameContext {
  const newCtx = { ...ctx };
  newCtx.players = newCtx.players.map((p) => ({
    ...p,
    playerHandType: undefined,
  }));
  return newCtx;
}
