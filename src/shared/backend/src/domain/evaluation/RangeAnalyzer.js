/**
 * Range Analyzer - Analyzes poker ranges against board states
 * Uses the shared showdownCalculator for hand evaluation
 * Categorizes draws (Flush Draw, OESD, Gutshot) for High Card hands
 */

import { evaluateHand } from "./showdownCalculator.js";
import { parseRange } from "./RangeParser.js";
import { detectDraw } from "./DrawEvaluator.js";
import { categorizePair } from "./PairCategorizer.js";

/**
 * Hand statistics result
 * @typedef {Object} HandStats
 * @property {string} type - Hand type name
 * @property {number} count - Number of combos with this hand type
 * @property {number} percentage - Percentage of valid combos
 */

/**
 * Range analysis result
 * @typedef {Object} RangeAnalysisResult
 * @property {number} totalCombos - Total combos in range (before filtering)
 * @property {number} validCombos - Valid combos after removing dead cards
 * @property {HandStats[]} stats - Hand type statistics
 */

const HAND_ORDER = [
  "Royal Flush",
  "Straight Flush",
  "Four of a Kind",
  "Full House",
  "Flush",
  "Straight",
  "Set",
  "Two Pair",
  "Overpair",
  "Top Pair",
  "Pocket Pair 1/2",
  "Middle Pair",
  "Pocket Pair 2/3",
  "Pocket Pair 3/4",
  "Pocket Pair 4/5",
  "Bottom Pair",
  "Underpair",
  "Board Pair",
  "Flush Draw",
  "OESD",
  "Gutshot",
  "Air",
];

/**
 * Analyzes a range against a board using the shared evaluator.
 * Can be run on frontend or backend (isomorphic).
 * @param {string|string[][]} rangeInput - Range string or pre-parsed combos array
 * @param {string[]} board - Community cards (0-5 cards)
 * @returns {RangeAnalysisResult} Analysis result with statistics
 */
export function analyzeRange(rangeInput, board) {
  const combos =
    typeof rangeInput === "string" ? parseRange(rangeInput) : rangeInput;

  // Filter Dead Cards (cards on board cannot be in hole)
  const boardSet = new Set(board);
  const validCombos = combos.filter(
    (hand) => !boardSet.has(hand[0]) && !boardSet.has(hand[1])
  );

  const totalValid = validCombos.length;
  if (totalValid === 0) {
    return { totalCombos: combos.length, validCombos: 0, stats: [] };
  }

  const counts = {};
  const isPreflop = board.length === 0;

  // Evaluation Loop
  for (const hand of validCombos) {
    let typeName = "";

    if (isPreflop) {
      // Simple Preflop categorization (Pair vs Air)
      const r1 = hand[0][0];
      const r2 = hand[1][0];
      typeName = r1 === r2 ? "Pair" : "Air";
    } else {
      // Postflop: Use Shared 7-Card Evaluator
      // Combine Hand + Board (evaluator handles 5-7 cards)
      const evalResult = evaluateHand([...hand, ...board]);
      typeName = evalResult.type;

      // If Pair, categorize it
      if (evalResult.type === "Pair") {
        const pairCategory = categorizePair(hand, board);

        if (pairCategory === "Board Pair") {
          // Check for draws on board pairs (draws take priority)
          const draw = detectDraw([...hand, ...board]);
          typeName = draw || "Board Pair";
        } else if (pairCategory === "Pair") {
          // Fallback case - check for draws, otherwise use Air
          const draw = detectDraw([...hand, ...board]);
          typeName = draw || "Air";
        } else {
          // Real pair (Top Pair, Overpair, etc.)
          typeName = pairCategory;
        }
      }
      // If High Card, check for draws
      else if (evalResult.type === "High Card") {
        const draw = detectDraw([...hand, ...board]);
        typeName = draw || "Air";
      }
    }

    counts[typeName] = (counts[typeName] || 0) + 1;
  }

  // Stats Aggregation
  const stats = [];
  const order = isPreflop ? ["Pair", "Air"] : HAND_ORDER;

  for (const type of order) {
    const count = counts[type] || 0;
    const pct = (count / totalValid) * 100;
    if (pct >= 0.5) {
      stats.push({
        type,
        count,
        percentage: Number(pct.toFixed(2)),
      });
    }
  }

  return { totalCombos: combos.length, validCombos: totalValid, stats };
}
