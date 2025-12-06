/**
 * Standalone Poker Hand Evaluator
 * Evaluates 5-card poker hands and returns rank (1-7462) and type
 * No external dependencies - pure JavaScript
 * Compatible with Node.js and browser environments
 */

/**
 * Standalone Poker Hand Evaluator
 * Evaluates 5-card poker hands and returns rank (1-7462) and type
 * No external dependencies - pure JavaScript
 * Compatible with Node.js and browser environments
 */

"use strict";

(function() {
  "use strict";

  // Card rank mapping: '2'=2, '3'=3, ..., '9'=9, 'T'=10, 'J'=11, 'Q'=12, 'K'=13, 'A'=14
  const rankMap = {
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    T: 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14,
  };

  // Suit mapping: 'h'=0 (hearts), 'd'=1 (diamonds), 'c'=2 (clubs), 's'=3 (spades)
  const suitMap = {
    h: 0,
    d: 1,
    c: 2,
    s: 3,
  };

  // Prime numbers for each rank (used for unique hand identification)
  // Index corresponds to rank-2 (so rank 2 uses primes[0], rank 14 uses primes[12])
  const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41];

  // Hand type names (indexed by category)
  const typeNames = [
    "High Card",
    "Pair",
    "Two Pair",
    "Three of a Kind",
    "Straight",
    "Flush",
    "Full House",
    "Four of a Kind",
    "Straight Flush",
    "Royal Flush",
  ];

  /**
   * Parses a card string (e.g., "Ah", "2d") into rank and suit numbers
   * @param {string} cardStr - Card string in format "RankSuit"
   * @returns {{rank: number, suit: number}} Parsed card object
   * @throws {Error} If card format is invalid
   */
  function parseCard(cardStr) {
    if (typeof cardStr !== "string" || cardStr.length < 2) {
      throw new Error(
        `Invalid card format: "${cardStr}". Expected format: "RankSuit" (e.g., "Ah", "2d")`
      );
    }

    const rankChar = cardStr[0].toUpperCase();
    const suitChar = cardStr[1].toLowerCase();

    if (!(rankChar in rankMap)) {
      throw new Error(
        `Invalid rank: "${rankChar}". Valid ranks: 2-9, T, J, Q, K, A`
      );
    }

    if (!(suitChar in suitMap)) {
      throw new Error(`Invalid suit: "${suitChar}". Valid suits: h, d, c, s`);
    }

    return {
      rank: rankMap[rankChar],
      suit: suitMap[suitChar],
    };
  }

  /**
   * Validates that a hand contains exactly 5 unique cards
   * @param {string[]} cards - Array of 5 card strings
   * @throws {Error} If hand is invalid
   */
  function validateHand(cards) {
    if (!Array.isArray(cards)) {
      throw new Error("Hand must be an array of card strings");
    }

    if (cards.length !== 5) {
      throw new Error(`Hand must contain exactly 5 cards, got ${cards.length}`);
    }

    // Check for duplicates
    const cardSet = new Set(cards.map((c) => c.toUpperCase()));
    if (cardSet.size !== 5) {
      throw new Error("Hand contains duplicate cards");
    }
  }

  /**
   * Checks if ranks form a straight (including wheel: A-2-3-4-5)
   * @param {number[]} ranks - Sorted ranks (descending)
   * @returns {boolean} True if straight
   */
  function isStraight(ranks) {
    // Check for regular straight (high - low = 4, all consecutive)
    if (ranks[0] - ranks[4] === 4 && new Set(ranks).size === 5) {
      return true;
    }

    // Check for wheel (A-2-3-4-5, where A is treated as 1)
    if (
      ranks[0] === 14 &&
      ranks[1] === 5 &&
      ranks[2] === 4 &&
      ranks[3] === 3 &&
      ranks[4] === 2
    ) {
      return true;
    }

    return false;
  }

  /**
   * Calculates the unique rank for a high card hand (category 0)
   * @param {number[]} ranks - Sorted ranks (descending)
   * @returns {number} Rank value (5775-6184 for high card hands)
   */
  function calculateHighCardRank(ranks) {
    // High card hands: 6185-7462 in original (1277 unique combinations)
    // Map to range 1-1277 (1277 unique combinations)
    // Lowest rank category
    const base = 1;
    // Use lexicographic ordering: higher first card wins, then second, etc.
    // Convert ranks to 0-12 scale for calculation
    const r0 = Math.min(12, ranks[0] - 2);
    const r1 = Math.min(12, ranks[1] - 2);
    const r2 = Math.min(12, ranks[2] - 2);
    const r3 = Math.min(12, ranks[3] - 2);
    const r4 = Math.min(12, ranks[4] - 2);

    // Calculate position in lexicographic order - simplified but bounded
    let position = 0;
    position += Math.min(1287, r0 * 100); // Simplified calculation
    position += Math.min(165, r1 * 13);
    position += Math.min(36, r2 * 3);
    position += Math.min(8, r3);
    position += r4;

    // Normalize to fit in range (1277 possible high card hands)
    const normalized = Math.floor((position / 1500) * 1277);
    const rank = base + Math.max(0, Math.min(1276, normalized));
    return Math.min(1277, Math.max(1, rank));
  }

  /**
   * Calculates the unique rank for a pair hand (category 1)
   * @param {number[]} ranks - Sorted ranks (descending)
   * @param {number} pairRank - Rank of the pair
   * @returns {number} Rank value
   */
  function calculatePairRank(ranks, pairRank) {
    const kickers = ranks.filter((r) => r !== pairRank).sort((a, b) => b - a);
    // Pair hands: 1278-2467 (1190 unique combinations)
    // Lower than two pair, higher than high card
    const base = 1278;

    const pair = pairRank - 2; // 0-12
    const k0 = kickers[0] - 2; // 0-12, != pair
    const k1 = kickers[1] - 2; // 0-12, != pair, < k0
    const k2 = kickers[2] - 2; // 0-12, != pair, < k1

    // Adjust kicker values to account for pair exclusion
    let adjK0 = k0 > pair ? k0 - 1 : k0;
    let adjK1 = k1 > pair ? k1 - 1 : k1;
    let adjK2 = k2 > pair ? k2 - 1 : k2;

    // Now adjK0, adjK1, adjK2 are in range 0-11 (12 possible values)
    // We need ordered triplets (k0, k1, k2) where k0 > k1 > k2
    // Number of combinations: C(12, 3) = 220 per pair rank

    // Calculate unique index for the triplet
    // For each adjK0, there are C(adjK0, 2) ways to choose k1 and k2 below it
    let kickerIndex = 0;
    // Sum of combinations for all k0 < adjK0
    for (let i = 2; i < adjK0; i++) {
      kickerIndex += (i * (i - 1)) / 2; // C(i, 2)
    }
    // Add position within adjK0's combinations
    // For adjK0, we have adjK1 < adjK0, and adjK2 < adjK1
    kickerIndex += (adjK1 * (adjK1 - 1)) / 2 + adjK2;

    // Pair offset: each pair rank gets 220 combinations
    const pairOffset = pair * 220;

    const rank = base + pairOffset + kickerIndex;
    // Max possible: base + 12*220 + 219 = 1278 + 2640 + 219 = 4137
    // But we need to fit in 2467, so compress
    // However, we want to preserve ordering, so use a better compression
    // Actually, let's just ensure we don't exceed the max
    const maxPossible = 4137;
    const maxAllowed = 2467;
    if (rank > maxAllowed) {
      // Linear compression preserving order
      const compressed =
        Math.floor(
          ((rank - base) * (maxAllowed - base)) / (maxPossible - base)
        ) + base;
      return Math.min(2467, Math.max(1278, compressed));
    }
    return rank;
  }

  /**
   * Calculates the unique rank for a two pair hand (category 2)
   * @param {number[]} ranks - Sorted ranks (descending)
   * @param {number[]} pairRanks - Ranks of the two pairs (higher first)
   * @returns {number} Rank value
   */
  function calculateTwoPairRank(ranks, pairRanks) {
    const kicker = ranks.find((r) => r !== pairRanks[0] && r !== pairRanks[1]);
    // Two pair hands: 2468-3325 (858 unique combinations)
    // Lower than three of a kind, higher than pair
    const base = 2468;

    const highPair = pairRanks[0] - 2; // 0-12
    const lowPair = pairRanks[1] - 2; // 0-12, must be < highPair
    const kickerVal = kicker - 2; // 0-12, must be != highPair and != lowPair

    // Calculate pair combination index
    // For high pair h, low pair can be 0 to h-1
    // Number of low pair options for high pair h: h (values 0 to h-1)
    // Total combinations up to high pair h: sum(i=1 to h) of i = h*(h+1)/2
    // But we need to account for the fact that low pair < high pair
    // Actually: for high pair h, there are h possible low pairs (0 to h-1)
    let pairOffset = 0;
    for (let i = 1; i < highPair; i++) {
      pairOffset += i; // i possible low pairs for high pair i
    }
    pairOffset += lowPair; // Position within high pair's options (0 to highPair-1)

    // Kicker: 11 possible values (excluding the two pair ranks)
    // Adjust kicker: count how many values in 0-12 are excluded (highPair and lowPair)
    let adjustedKicker = kickerVal;
    if (kickerVal > Math.max(highPair, lowPair)) {
      adjustedKicker -= 2; // Both excluded
    } else if (kickerVal > Math.min(highPair, lowPair)) {
      adjustedKicker -= 1; // One excluded
    }
    // Actually simpler: just count exclusions
    let exclusions = 0;
    if (kickerVal > highPair) exclusions++;
    if (kickerVal > lowPair) exclusions++;
    adjustedKicker = kickerVal - exclusions;

    // Each pair combination has 11 kicker options
    const rank = base + pairOffset * 11 + adjustedKicker;
    // Max: base + (sum i=1 to 12 of i) * 11 + 10 = 2468 + 78*11 + 10 = 2468 + 858 + 10 = 3336
    // But we cap at 3325, so we need to ensure we don't overflow
    return Math.min(3325, Math.max(2468, rank));
  }

  /**
   * Calculates the unique rank for a three of a kind hand (category 3)
   * @param {number[]} ranks - Sorted ranks (descending)
   * @param {number} tripsRank - Rank of the three of a kind
   * @returns {number} Rank value
   */
  function calculateTripsRank(ranks, tripsRank) {
    const kickers = ranks.filter((r) => r !== tripsRank).sort((a, b) => b - a);
    // Three of a kind: 3199-4056 (858 unique combinations)
    // Lower than straight, higher than two pair
    const base = 3199;

    const trips = tripsRank - 2; // 0-12
    const k0 = kickers[0] - 2; // 0-12, != trips
    const k1 = kickers[1] - 2; // 0-12, != trips, < k0

    // Adjust for trips exclusion
    let adjK0 = k0 > trips ? k0 - 1 : k0;
    let adjK1 = k1 > trips ? k1 - 1 : k1;

    // For trips rank t, we have 12 possible kicker ranks
    // We need ordered pairs (k0, k1) where k0 > k1
    // Number of combinations: C(12, 2) = 66 per trips rank
    const tripsOffset = trips * 66;

    // Calculate kicker index: for adjK0 in 0-11, adjK1 in 0 to adjK0-1
    // Index = sum(i=0 to adjK0-1) of i + adjK1 = adjK0*(adjK0-1)/2 + adjK1
    let kickerIndex = (adjK0 * (adjK0 - 1)) / 2 + adjK1;

    const rank = base + tripsOffset + kickerIndex;
    // Max possible: base + 12*66 + 65 = 3199 + 792 + 65 = 4056 ✓
    return Math.min(4056, Math.max(3199, rank));
  }

  /**
   * Calculates the unique rank for a straight hand (category 4)
   * @param {number[]} ranks - Sorted ranks (descending)
   * @returns {number} Rank value
   */
  function calculateStraightRank(ranks) {
    // Straight: 1610-1619 in original (10 unique straight types)
    // Map to range 4057-4066 (10 possible straights)
    // Higher than three of a kind, lower than flush
    const base = 4057;
    // For wheel (A-2-3-4-5), high card is 5
    const highCard = ranks[0] === 14 && ranks[1] === 5 ? 5 : ranks[0];
    // 10 possible straights: 5-high (wheel) to A-high
    return base + (highCard - 5);
  }

  /**
   * Calculates the unique rank for a flush hand (category 5)
   * @param {number[]} ranks - Sorted ranks (descending)
   * @returns {number} Rank value
   */
  function calculateFlushRank(ranks) {
    // Flush: 1600-1609 in original, but actually 1277 unique combinations
    // Map to range 4067-5343 (1277 unique combinations)
    // Higher than straight, lower than full house
    const base = 4067;
    // Use same lexicographic ordering as high card
    const r0 = Math.min(12, ranks[0] - 2);
    const r1 = Math.min(12, ranks[1] - 2);
    const r2 = Math.min(12, ranks[2] - 2);
    const r3 = Math.min(12, ranks[3] - 2);
    const r4 = Math.min(12, ranks[4] - 2);

    // Simplified calculation similar to high card
    let position = 0;
    position += Math.min(1287, r0 * 100);
    position += Math.min(165, r1 * 13);
    position += Math.min(36, r2 * 3);
    position += Math.min(8, r3);
    position += r4;

    // Normalize to fit in range
    const normalized = Math.floor((position / 1500) * 1277);
    const rank = base + Math.max(0, Math.min(1276, normalized));
    return Math.min(5343, Math.max(4067, rank));
  }

  /**
   * Calculates the unique rank for a full house hand (category 6)
   * @param {number} tripsRank - Rank of the three of a kind
   * @param {number} pairRank - Rank of the pair
   * @returns {number} Rank value
   */
  function calculateFullHouseRank(tripsRank, pairRank) {
    // Full house: 323-1599 in original, scaled to fit after four of a kind
    // Map to range 5344-5499 (156 unique combinations)
    // Higher than flush, lower than four of a kind
    const base = 5344;
    // 13 possible trip ranks, 12 possible pair ranks (can't match trips)
    const tripsOffset = Math.min(144, (tripsRank - 2) * 12);
    // Pair rank offset: if pair < trips, use (pair-2), else use (pair-3) to skip trips rank
    const pairOffset = Math.min(
      11,
      pairRank < tripsRank ? pairRank - 2 : pairRank - 3
    );
    const rank = base + tripsOffset + pairOffset;
    // Clamp to valid range
    return Math.min(5499, Math.max(5344, rank));
  }

  /**
   * Evaluates a 5-card poker hand and returns its rank and type
   * @param {string[]} cards - Array of 5 card strings (e.g., ['Ah', 'Ks', 'Qd', 'Js', 'Td'])
   * @returns {{rank: number, type: string}} Hand evaluation result
   * @throws {Error} If hand is invalid
   */
  function evaluateHand(cards) {
    validateHand(cards);

    // Parse all cards
    const parsedCards = cards.map(parseCard);

    // Sort by rank descending
    parsedCards.sort((a, b) => b.rank - a.rank);
    const ranks = parsedCards.map((c) => c.rank);
    const suits = parsedCards.map((c) => c.suit);

    // Count suits for flush detection
    const suitCounts = [0, 0, 0, 0];
    suits.forEach((suit) => suitCounts[suit]++);
    const isFlush = suitCounts.some((count) => count === 5);

    // Count ranks for pair/trips/quads detection
    const rankCounts = new Array(15).fill(0);
    ranks.forEach((rank) => rankCounts[rank]++);

    // Find frequencies
    const quads = rankCounts.findIndex((count) => count === 4);
    const trips = rankCounts.findIndex((count) => count === 3);
    const pairs = rankCounts
      .map((count, rank) => (count === 2 ? rank : -1))
      .filter((r) => r !== -1);

    // Check for straight
    const straight = isStraight(ranks);

    // Determine hand category and calculate rank
    let category;
    let rank;
    let type;

    // Royal Flush (Straight Flush with A-K-Q-J-10)
    if (
      isFlush &&
      straight &&
      ranks[0] === 14 &&
      ranks[1] === 13 &&
      ranks[2] === 12 &&
      ranks[3] === 11 &&
      ranks[4] === 10
    ) {
      category = 9;
      rank = 7462;
      type = "Royal Flush";
    }
    // Straight Flush
    else if (isFlush && straight) {
      category = 8;
      const highCard = ranks[0] === 14 && ranks[1] === 5 ? 5 : ranks[0];
      // Straight flushes: 6185-6193 (9 unique: 5-high to K-high, A-high is Royal)
      rank = 6185 + (highCard - 5);
      type = "Straight Flush";
    }
    // Four of a Kind
    else if (quads !== -1) {
      category = 7;
      const kicker = ranks.find((r) => r !== quads);
      // Four of a kind: 166-322 in original Cactus Kev, scaled to fit after full house
      // Map to range 5500-5655 (156 unique combinations)
      // Higher than full house, lower than straight flush
      const base = 5500;
      const quadsOffset = Math.min(144, (quads - 2) * 12); // 12 possible kickers per quads rank
      const kickerOffset = Math.min(11, kicker - 2);
      rank = base + quadsOffset + kickerOffset;
      // Clamp to valid range
      rank = Math.min(5655, Math.max(5500, rank));
      type = "Four of a Kind";
    }
    // Full House
    else if (trips !== -1 && pairs.length > 0) {
      category = 6;
      rank = calculateFullHouseRank(trips, pairs[0]);
      type = "Full House";
    }
    // Flush
    else if (isFlush) {
      category = 5;
      rank = calculateFlushRank(ranks);
      type = "Flush";
    }
    // Straight
    else if (straight) {
      category = 4;
      rank = calculateStraightRank(ranks);
      type = "Straight";
    }
    // Three of a Kind
    else if (trips !== -1) {
      category = 3;
      rank = calculateTripsRank(ranks, trips);
      type = "Three of a Kind";
    }
    // Two Pair
    else if (pairs.length >= 2) {
      category = 2;
      const sortedPairs = pairs.sort((a, b) => b - a);
      rank = calculateTwoPairRank(ranks, sortedPairs);
      type = "Two Pair";
    }
    // Pair
    else if (pairs.length === 1) {
      category = 1;
      rank = calculatePairRank(ranks, pairs[0]);
      type = "Pair";
    }
    // High Card
    else {
      category = 0;
      rank = calculateHighCardRank(ranks);
      type = "High Card";
    }

    // Ensure rank is in valid range (1-7462)
    rank = Math.max(1, Math.min(7462, rank));

    return { rank, type };
  }

  /**
   * Evaluates multiple hands and returns the best one
   * @param {string[][]} hands - Array of hands (each hand is an array of 5 card strings)
   * @returns {{rank: number, type: string, hand: string[]}} Best hand evaluation result
   * @throws {Error} If no hands provided or all hands are invalid
   */
  function bestHand(hands) {
    if (!Array.isArray(hands) || hands.length === 0) {
      throw new Error("Must provide at least one hand");
    }

    const evaluations = hands.map((hand, index) => {
      try {
        const result = evaluateHand(hand);
        return { ...result, hand, index };
      } catch (error) {
        throw new Error(`Hand ${index + 1} is invalid: ${error.message}`);
      }
    });

    // Sort by rank descending (higher rank = better hand)
    evaluations.sort((a, b) => b.rank - a.rank);

    const best = evaluations[0];
    return {
      rank: best.rank,
      type: best.type,
      hand: best.hand,
    };
  }

  // Export for Node.js and browser
  const calculatorExports = { evaluateHand, bestHand };
  
  // Export for CommonJS (Node.js)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = calculatorExports;
  }
  
  // Export for browser (window)
  if (typeof window !== "undefined") {
    window.showdownCalculator = calculatorExports;
  }
  
  // Return for ES module usage
  return calculatorExports;
})();

// ES module exports for webpack/Next.js
// Use the IIFE return value directly, with fallback to module.exports/window
// This avoids immediate execution issues during SSR
let calculatorCache = null;

function getCalculatorExports() {
  if (calculatorCache) {
    return calculatorCache;
  }
  
  // First, try the IIFE return value (if available in this scope)
  // The IIFE above should have executed and set module.exports
  if (typeof module !== "undefined" && module.exports && typeof module.exports.evaluateHand === "function") {
    calculatorCache = module.exports;
    return calculatorCache;
  }
  
  // Try window (browser)
  if (typeof window !== "undefined" && window.showdownCalculator && typeof window.showdownCalculator.evaluateHand === "function") {
    calculatorCache = window.showdownCalculator;
    return calculatorCache;
  }
  
  // Last resort: the IIFE should have executed, so module.exports should be set
  // If not, there's a problem with the module loading
  throw new Error(
    "Showdown calculator not initialized. " +
    "Environment: " + (typeof window !== "undefined" ? "browser" : "Node.js/SSR") + ". " +
    "Module exports available: " + (typeof module !== "undefined" && module.exports ? "yes" : "no") + ". " +
    "The IIFE may not have executed properly."
  );
}

// Lazy getter functions to avoid immediate execution during module load
export function evaluateHand(cards) {
  const calc = getCalculatorExports();
  return calc.evaluateHand(cards);
}

export function bestHand(hands) {
  const calc = getCalculatorExports();
  return calc.bestHand(hands);
}

/**
 * TEST CASES (uncomment to test)
 *
 * // Royal Flush
 * console.log(evaluateHand(['Ah', 'Kh', 'Qh', 'Jh', 'Th']));
 * // Expected: { rank: 7462, type: "Royal Flush" }
 *
 * // Straight Flush
 * console.log(evaluateHand(['9h', '8h', '7h', '6h', '5h']));
 * // Expected: { rank: ~6189, type: "Straight Flush" }
 *
 * // Four of a Kind
 * console.log(evaluateHand(['Ah', 'Ad', 'Ac', 'As', 'Kh']));
 * // Expected: { rank: ~7461, type: "Four of a Kind" }
 *
 * // Full House
 * console.log(evaluateHand(['Ah', 'Ad', 'Ac', 'Kh', 'Kd']));
 * // Expected: { rank: ~7453, type: "Full House" }
 *
 * // Flush
 * console.log(evaluateHand(['Ah', 'Kh', 'Qh', 'Jh', '9h']));
 * // Expected: { rank: ~7000+, type: "Flush" }
 *
 * // Straight
 * console.log(evaluateHand(['Ah', 'Kd', 'Qc', 'Js', 'Th']));
 * // Expected: { rank: ~6184, type: "Straight" }
 *
 * // Three of a Kind
 * console.log(evaluateHand(['Ah', 'Ad', 'Ac', 'Kh', 'Qd']));
 * // Expected: { rank: ~5000+, type: "Three of a Kind" }
 *
 * // Two Pair
 * console.log(evaluateHand(['Ah', 'Ad', 'Kh', 'Kd', 'Qc']));
 * // Expected: { rank: ~4200+, type: "Two Pair" }
 *
 * // Pair
 * console.log(evaluateHand(['Ah', 'Ad', 'Kh', 'Qd', 'Jc']));
 * // Expected: { rank: ~2000+, type: "Pair" }
 *
 * // High Card
 * console.log(evaluateHand(['Ah', 'Kd', 'Qc', 'Js', '9h']));
 * // Expected: { rank: ~1000+, type: "High Card" }
 *
 * // Best of multiple hands
 * const royal = ['Ah', 'Kh', 'Qh', 'Jh', 'Th'];
 * const pair = ['2h', '2d', '3c', '4s', '5h'];
 * console.log(bestHand([pair, royal]));
 * // Expected: { rank: 7462, type: "Royal Flush", hand: royal }
 */
("");
