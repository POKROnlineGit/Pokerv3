/**
 * Pair Categorizer - Categorizes pairs into specific types
 * Distinguishes Overpairs, Top/Middle/Bottom pairs, Pocket Pair gaps, and Board pairs
 */

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

/**
 * Pair category types
 * @typedef {'Overpair'|'Top Pair'|'Pocket Pair 1/2'|'Middle Pair'|'Pocket Pair 2/3'|'Pocket Pair 3/4'|'Pocket Pair 4/5'|'Bottom Pair'|'Underpair'|'Board Pair'|'Pair'} PairCategory
 */

/**
 * Categorizes a pair based on hole cards and board.
 * Only called when the evaluator has already determined the best hand is a 'Pair'.
 * @param {string[]} hole - Hole cards (2 cards)
 * @param {string[]} board - Board cards (0-5 cards)
 * @returns {PairCategory} The pair category
 */
export function categorizePair(hole, board) {
  const getRank = (c) => RANKS.indexOf(c[0]);

  const h1 = getRank(hole[0]);
  const h2 = getRank(hole[1]);

  // Get unique board ranks sorted descending (High to Low)
  const boardRanks = Array.from(new Set(board.map(getRank))).sort((a, b) => b - a);
  const maxBoard = boardRanks.length > 0 ? boardRanks[0] : -1;

  // 1. POCKET PAIRS (h1 == h2)
  if (h1 === h2) {
    const pp = h1;

    // Overpair: Higher than top board card
    if (maxBoard >= 0 && pp > maxBoard) return "Overpair";

    // Check Gaps (pocket pair between board cards)
    for (let i = 0; i < boardRanks.length - 1; i++) {
      const highCard = boardRanks[i];
      const lowCard = boardRanks[i + 1];

      if (pp < highCard && pp > lowCard) {
        if (i === 0) return "Pocket Pair 1/2";
        if (i === 1) return "Pocket Pair 2/3";
        if (i === 2) return "Pocket Pair 3/4";
        if (i === 3) return "Pocket Pair 4/5";
      }
    }

    // Underpair: Lower than lowest board card
    // (Or equal to lowest if board has duplicates? No, if equal it's a Set, handled by Trips logic)
    // So simple 'less than last' check works.
    if (boardRanks.length > 0 && pp < boardRanks[boardRanks.length - 1]) {
      return "Underpair";
    }

    return "Pair"; // Should be unreachable unless logic gap
  }

  // 2. NON-POCKET PAIRS
  // Determine which hole card makes the pair
  let matchRank = -1;
  if (boardRanks.includes(h1)) matchRank = h1;
  else if (boardRanks.includes(h2)) matchRank = h2;

  // If neither matches, the pair is entirely on the board (e.g. 89 on KK5)
  if (matchRank === -1) return "Board Pair";

  // Top Pair
  if (matchRank === boardRanks[0]) return "Top Pair";

  // Middle Pair: Matches 2nd highest rank
  if (boardRanks.length >= 2 && matchRank === boardRanks[1]) return "Middle Pair";

  // Bottom Pair: Matches lowest rank OR anything below Middle
  // If board has 3 cards: Top, Mid, Bottom.
  // If board has 4 cards: Top, Mid, Weak, Bottom?
  // Standard simplification: Anything below Middle is Bottom/Weak. We'll label 'Bottom Pair'.
  return "Bottom Pair";
}

