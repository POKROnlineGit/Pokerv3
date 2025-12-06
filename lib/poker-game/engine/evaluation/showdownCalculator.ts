/**
 * TypeScript wrapper for the standalone showdown calculator
 * Provides type-safe access to the JavaScript calculator
 */

// The calculator will be loaded dynamically via require or window

// Type definitions
export interface HandEvaluation {
  rank: number; // 1-7462, higher is better
  type: string; // "Royal Flush", "Straight Flush", etc.
}

export interface BestHandResult extends HandEvaluation {
  hand: string[];
}

// Get the calculator functions
type CalculatorType = {
  evaluateHand: (cards: string[]) => HandEvaluation;
  bestHand: (hands: string[][]) => BestHandResult;
};

let calculator: CalculatorType | null = null;

// Initialize calculator based on environment
function getCalculator(): CalculatorType {
  if (calculator) {
    return calculator;
  }

  // Try window first (browser, after IIFE executes from side-effect import)
  if (typeof window !== "undefined" && (window as any).showdownCalculator) {
    const calc = (window as any).showdownCalculator;
    if (
      calc &&
      typeof calc.evaluateHand === "function" &&
      typeof calc.bestHand === "function"
    ) {
      calculator = calc as CalculatorType;
      return calculator;
    }
  }

  // Try require (Node.js or webpack - webpack should handle this)
  try {
    // @ts-ignore - dynamic require for webpack/Node
    const calc = require("./showdownCalculator.js");
    if (
      calc &&
      typeof calc.evaluateHand === "function" &&
      typeof calc.bestHand === "function"
    ) {
      calculator = calc as CalculatorType;
      return calculator;
    }
  } catch (e) {
    // require failed - expected in some browser contexts
  }

  // Provide detailed error message for debugging
  const env = typeof window !== "undefined" ? "browser" : "Node.js";
  const windowCheck =
    typeof window !== "undefined"
      ? (window as any).showdownCalculator
        ? "present"
        : "missing"
      : "N/A";
  throw new Error(
    `Showdown calculator not available in ${env} environment. ` +
      `Window: ${windowCheck}. ` +
      `The calculator module may not have executed properly. ` +
      `Make sure showdownCalculator.js is loaded.`
  );
}

/**
 * Evaluate a single 5-card hand
 */
export function evaluateHand(cards: string[]): HandEvaluation {
  if (cards.length !== 5) {
    throw new Error(`Hand must contain exactly 5 cards, got ${cards.length}`);
  }
  const calc = getCalculator();
  if (!calc || typeof calc.evaluateHand !== "function") {
    throw new Error("Calculator evaluateHand function is not available");
  }
  return calc.evaluateHand(cards);
}

/**
 * Evaluate multiple hands and return the best one
 */
export function bestHand(hands: string[][]): BestHandResult {
  const calc = getCalculator();
  if (!calc || typeof calc.bestHand !== "function") {
    throw new Error("Calculator bestHand function is not available");
  }
  return calc.bestHand(hands);
}

/**
 * Generate all possible 5-card combinations from 7 cards
 * Returns array of 21 combinations (C(7,5) = 21)
 */
export function generateFiveCardCombinations(cards: string[]): string[][] {
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

/**
 * Find the best 5-card hand from 5, 6, or 7 cards
 * Takes either a single array of cards, or separate holeCards and communityCards
 * Works with any number of cards >= 5
 */
export function findBestHandFromSeven(
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

// Explicitly ensure all exports are available
// This helps webpack recognize the exports and prevents tree-shaking
export default {
  evaluateHand,
  bestHand,
  generateFiveCardCombinations,
  findBestHandFromSeven,
};
