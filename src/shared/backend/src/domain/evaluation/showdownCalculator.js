/**
 * Standalone Poker Hand Evaluator
 * Evaluates 5-7 card poker hands and returns rank (1-7462) and type
 * Uses high-performance 7-card bitwise evaluator for 7-card scenarios
 * Falls back to 5-card evaluator for 5-6 card scenarios
 * No external dependencies - pure JavaScript
 * Compatible with Node.js and browser environments
 */

"use strict";

const calculatorExports = (function () {
  "use strict";

  // ============================================================================
  // CONSTANTS
  // ============================================================================

  /** Card rank mapping: '2'=2, '3'=3, ..., '9'=9, 'T'=10, 'J'=11, 'Q'=12, 'K'=13, 'A'=14 */
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

  /** Suit mapping: 'h'=0 (hearts), 'd'=1 (diamonds), 'c'=2 (clubs), 's'=3 (spades) */
  const suitMap = {
    h: 0,
    d: 1,
    c: 2,
    s: 3,
  };

  /** Hand type constants for 7-card bitwise evaluator */
  const HAND_TYPES = {
    HIGH_CARD: 0,
    PAIR: 1,
    TWO_PAIR: 2,
    TRIPS: 3,
    STRAIGHT: 4,
    FLUSH: 5,
    FULL_HOUSE: 6,
    QUADS: 7,
    STRAIGHT_FLUSH: 8,
  };

  /** Hand type names (indexed by category) */
  const typeNames = [
    "High Card",
    "Pair",
    "Two Pair",
    "Set",
    "Straight",
    "Flush",
    "Full House",
    "Four of a Kind",
    "Straight Flush",
    "Royal Flush",
  ];

  /** Straight detection masks for bitwise evaluation */
  const STRAIGHT_MASKS = [
    0x1f00, // A-K-Q-J-T
    0x0f80, // K-Q-J-T-9
    0x07c0, // Q-J-T-9-8
    0x03e0, // J-T-9-8-7
    0x01f0, // T-9-8-7-6
    0x00f8, // 9-8-7-6-5
    0x007c, // 8-7-6-5-4
    0x003e, // 7-6-5-4-3
    0x001f, // 6-5-4-3-2
    0x100f, // 5-4-3-2-A (wheel)
  ];

  // ============================================================================
  // UTILITY FUNCTIONS - Card Parsing and Conversion
  // ============================================================================

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
   * Converts a card string to integer format (0-51) for bitwise evaluation
   * Format: Rank=card>>2, Suit=card&3
   * Ranks: 2=0, 3=1, ..., K=11, A=12
   * @param {string} cardStr - Card string (e.g., "Ah", "2d")
   * @returns {number} Integer representation (0-51)
   */
  function cardStringToInt(cardStr) {
    const parsed = parseCard(cardStr);
    // Convert rank from 2-14 to 0-12
    const rankInt = parsed.rank - 2;
    const suitInt = parsed.suit;
    // Card integer: rank * 4 + suit
    return rankInt * 4 + suitInt;
  }

  /**
   * Converts an array of card strings to integer format
   * @param {string[]} cardStrings - Array of card strings
   * @returns {number[]} Array of integers (0-51)
   */
  function cardsToInts(cardStrings) {
    return cardStrings.map(cardStringToInt);
  }

  /**
   * Validates that a hand contains the correct number of unique cards
   * @param {string[]} cards - Array of card strings
   * @param {number} expectedLength - Expected number of cards (optional)
   * @throws {Error} If hand is invalid
   */
  function validateHand(cards, expectedLength = null) {
    if (!Array.isArray(cards)) {
      throw new Error("Hand must be an array of card strings");
    }

    if (cards.length < 5) {
      throw new Error(
        `Hand must contain at least 5 cards, got ${cards.length}`
      );
    }

    if (expectedLength !== null && cards.length !== expectedLength) {
      throw new Error(
        `Hand must contain exactly ${expectedLength} cards, got ${cards.length}`
      );
    }

    // Check for duplicates
    const cardSet = new Set(cards.map((c) => c.toUpperCase()));
    if (cardSet.size !== cards.length) {
      throw new Error("Hand contains duplicate cards");
    }
  }

  // ============================================================================
  // 7-CARD BITWISE EVALUATOR (High Performance)
  // ============================================================================

  /**
   * Gets straight score from a rank bitmask
   * @param {number} mask - Bitmask of ranks present
   * @returns {number} High card rank (0-12) if straight, 0 otherwise
   */
  function getStraightScore(mask) {
    for (let i = 0; i < STRAIGHT_MASKS.length; i++) {
      if ((mask & STRAIGHT_MASKS[i]) === STRAIGHT_MASKS[i]) {
        // Special case: Wheel (A-2-3-4-5) is 5-high (rank 3)
        if (STRAIGHT_MASKS[i] === 0x100f) return 3;
        // Find highest bit in mask
        let r = 12;
        while (r >= 0) {
          if ((STRAIGHT_MASKS[i] >> r) & 1) return r;
          r--;
        }
      }
    }
    return 0;
  }

  /**
   * High-performance 7-card poker hand evaluator using bitwise operations
   * Cards are integers 0-51 (Rank=card>>2, Suit=card&3)
   * Returns score: (Type<<24) | (Rank1<<16) | (Rank2<<8) | Kicker
   * Uses direct 7-card evaluation - no enumeration needed
   * @param {number[]} cards - Array of card integers (5-7 cards)
   * @returns {number} Bitwise score (higher is better)
   */
  function evaluate7CardBitwise(cards) {
    let ranks = 0;
    const suits = [0, 0, 0, 0];
    const rankCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // Map 2-A (0-12)

    // 1. Single Pass: Populate bitmasks and counts
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const r = c >> 2;
      const s = c & 3;
      ranks |= 1 << r;
      suits[s]++;
      rankCounts[r]++;
    }

    // 2. Check Flush & Straight Flush
    let flushSuit = -1;
    if (suits[0] >= 5) flushSuit = 0;
    else if (suits[1] >= 5) flushSuit = 1;
    else if (suits[2] >= 5) flushSuit = 2;
    else if (suits[3] >= 5) flushSuit = 3;

    if (flushSuit !== -1) {
      let flushRanks = 0;
      // Collect ranks specifically for the flush suit
      for (let i = 0; i < cards.length; i++) {
        if ((cards[i] & 3) === flushSuit) {
          flushRanks |= 1 << (cards[i] >> 2);
        }
      }

      // Check Straight Flush
      const sfScore = getStraightScore(flushRanks);
      if (sfScore > 0) {
        return (HAND_TYPES.STRAIGHT_FLUSH << 24) | sfScore;
      }

      // It is a Flush - Top 5 cards
      let score = 0;
      let count = 0;
      for (let r = 12; r >= 0; r--) {
        if ((flushRanks >> r) & 1) {
          score |= r << (4 * (4 - count));
          count++;
          if (count === 5) break;
        }
      }
      return (HAND_TYPES.FLUSH << 24) | score;
    }

    // 3. Check Quads / Full House / Trips / Two Pair / Pair
    let quads = -1;
    let trips = -1;
    const pairs = [];

    for (let r = 12; r >= 0; r--) {
      const c = rankCounts[r];
      if (c === 4) quads = r;
      else if (c === 3) {
        if (trips === -1) trips = r;
        else pairs.push(r); // Downgrade previous trips to pair
      } else if (c === 2) pairs.push(r);
    }

    // Quads
    if (quads !== -1) {
      let kicker = 0;
      for (let r = 12; r >= 0; r--) {
        if (r !== quads && rankCounts[r] > 0) {
          kicker = r;
          break;
        }
      }
      return (HAND_TYPES.QUADS << 24) | (quads << 16) | kicker;
    }

    // Full House
    if (trips !== -1 && pairs.length > 0) {
      // Trips + Best Pair
      return (HAND_TYPES.FULL_HOUSE << 24) | (trips << 16) | (pairs[0] << 8);
    }

    // Straight
    const straightScore = getStraightScore(ranks);
    if (straightScore > 0) {
      return (HAND_TYPES.STRAIGHT << 24) | straightScore;
    }

    // Trips
    if (trips !== -1) {
      let kickers = 0;
      let count = 0;
      for (let r = 12; r >= 0; r--) {
        if (r !== trips && rankCounts[r] > 0) {
          kickers |= r << (4 * (1 - count)); // 2 kickers needed
          count++;
          if (count === 2) break;
        }
      }
      return (HAND_TYPES.TRIPS << 24) | (trips << 16) | kickers;
    }

    // Two Pair
    if (pairs.length >= 2) {
      const p1 = pairs[0];
      const p2 = pairs[1];
      let kicker = 0;
      for (let r = 12; r >= 0; r--) {
        if (r !== p1 && r !== p2 && rankCounts[r] > 0) {
          kicker = r;
          break;
        }
      }
      return (HAND_TYPES.TWO_PAIR << 24) | (p1 << 16) | (p2 << 8) | kicker;
    }

    // Pair
    if (pairs.length === 1) {
      const p = pairs[0];
      let kickers = 0;
      let count = 0;
      for (let r = 12; r >= 0; r--) {
        if (r !== p && rankCounts[r] > 0) {
          kickers |= r << (4 * (2 - count)); // 3 kickers
          count++;
          if (count === 3) break;
        }
      }
      return (HAND_TYPES.PAIR << 24) | (p << 16) | kickers;
    }

    // High Card
    let score = 0;
    let count = 0;
    for (let r = 12; r >= 0; r--) {
      if (rankCounts[r] > 0) {
        score |= r << (4 * (4 - count));
        count++;
        if (count === 5) break;
      }
    }
    return (HAND_TYPES.HIGH_CARD << 24) | score;
  }

  /**
   * Constructs the best 5-card hand from 7 cards based on bitwise evaluation result
   * @param {number[]} cardInts - Array of 7 card integers
   * @param {number} bitwiseScore - Score from evaluate7CardBitwise
   * @param {string[]} cardStrings - Original card strings for return
   * @returns {string[]} Best 5-card combination
   */
  function constructBest5CardHand(cardInts, bitwiseScore, cardStrings) {
    const handType = (bitwiseScore >> 24) & 0xff;
    const rank1 = (bitwiseScore >> 16) & 0xff;
    const rank2 = (bitwiseScore >> 8) & 0xff;
    const kicker = bitwiseScore & 0xff;

    // Build rank counts for selection
    const rankCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const cardsByRank = [[], [], [], [], [], [], [], [], [], [], [], [], []];

    for (let i = 0; i < cardInts.length; i++) {
      const r = cardInts[i] >> 2;
      rankCounts[r]++;
      cardsByRank[r].push(i);
    }

    const selected = [];
    const selectedRanks = new Set();

    // Select cards based on hand type
    if (handType === HAND_TYPES.STRAIGHT_FLUSH) {
      // For straight flush, need to find flush suit and the straight within it
      const suits = [0, 0, 0, 0];
      for (let i = 0; i < cardInts.length; i++) {
        suits[cardInts[i] & 3]++;
      }
      let flushSuit = -1;
      if (suits[0] >= 5) flushSuit = 0;
      else if (suits[1] >= 5) flushSuit = 1;
      else if (suits[2] >= 5) flushSuit = 2;
      else if (suits[3] >= 5) flushSuit = 3;

      // Build bitmask of ranks in the flush suit
      let flushRanks = 0;
      for (let i = 0; i < cardInts.length; i++) {
        if ((cardInts[i] & 3) === flushSuit) {
          flushRanks |= 1 << (cardInts[i] >> 2);
        }
      }

      // Find which straight mask matches
      const straightRanks = [];
      for (let i = 0; i < STRAIGHT_MASKS.length; i++) {
        if ((flushRanks & STRAIGHT_MASKS[i]) === STRAIGHT_MASKS[i]) {
          if (STRAIGHT_MASKS[i] === 0x100f) {
            // Wheel (A-2-3-4-5): ranks 12 (A), 0 (2), 1 (3), 2 (4), 3 (5)
            straightRanks.push(12, 0, 1, 2, 3);
          } else {
            // Regular straight - find the 5 ranks in descending order
            for (let r = 12; r >= 0; r--) {
              if ((STRAIGHT_MASKS[i] >> r) & 1) {
                straightRanks.push(r);
              }
            }
          }
          break;
        }
      }

      // Select one card from each rank in the straight, but only from flush suit
      for (const r of straightRanks) {
        if (cardsByRank[r] && cardsByRank[r].length > 0) {
          // Find first card of this rank that's in the flush suit
          for (const idx of cardsByRank[r]) {
            if ((cardInts[idx] & 3) === flushSuit) {
              selected.push(idx);
              break;
            }
          }
        }
      }
    } else if (handType === HAND_TYPES.FLUSH) {
      // For flush only, select top 5 cards of flush suit
      const suits = [0, 0, 0, 0];
      for (let i = 0; i < cardInts.length; i++) {
        suits[cardInts[i] & 3]++;
      }
      let flushSuit = -1;
      if (suits[0] >= 5) flushSuit = 0;
      else if (suits[1] >= 5) flushSuit = 1;
      else if (suits[2] >= 5) flushSuit = 2;
      else if (suits[3] >= 5) flushSuit = 3;

      // Select top 5 cards of flush suit
      let count = 0;
      for (let r = 12; r >= 0; r--) {
        for (const idx of cardsByRank[r]) {
          if ((cardInts[idx] & 3) === flushSuit) {
            selected.push(idx);
            count++;
            if (count === 5) break;
          }
        }
        if (count === 5) break;
      }
    } else if (handType === HAND_TYPES.QUADS) {
      // Quads + kicker
      for (const idx of cardsByRank[rank1]) selected.push(idx);
      for (const idx of cardsByRank[kicker]) {
        selected.push(idx);
        if (selected.length === 5) break;
      }
    } else if (handType === HAND_TYPES.FULL_HOUSE) {
      // Trips + pair
      for (const idx of cardsByRank[rank1]) selected.push(idx);
      for (const idx of cardsByRank[rank2]) {
        selected.push(idx);
        if (selected.length === 5) break;
      }
    } else if (handType === HAND_TYPES.STRAIGHT) {
      // Find straight cards - need to select exactly 5 cards
      const straightRanks = [];
      let mask = 0;
      for (let r = 0; r < 13; r++) {
        if (rankCounts[r] > 0) mask |= 1 << r;
      }

      for (let i = 0; i < STRAIGHT_MASKS.length; i++) {
        if ((mask & STRAIGHT_MASKS[i]) === STRAIGHT_MASKS[i]) {
          if (STRAIGHT_MASKS[i] === 0x100f) {
            // Wheel (A-2-3-4-5): ranks 12 (A), 0 (2), 1 (3), 2 (4), 3 (5)
            straightRanks.push(12, 0, 1, 2, 3);
          } else {
            // Regular straight - find the 5 ranks in descending order
            for (let r = 12; r >= 0; r--) {
              if ((STRAIGHT_MASKS[i] >> r) & 1) {
                straightRanks.push(r);
              }
            }
          }
          break;
        }
      }

      // Select one card from each rank in the straight
      for (const r of straightRanks) {
        if (cardsByRank[r] && cardsByRank[r].length > 0) {
          selected.push(cardsByRank[r][0]); // Take first available card of this rank
        }
      }
    } else if (handType === HAND_TYPES.TRIPS) {
      // Trips + 2 kickers
      for (const idx of cardsByRank[rank1]) selected.push(idx);
      let kickerCount = 0;
      for (let r = 12; r >= 0; r--) {
        if (r !== rank1 && rankCounts[r] > 0) {
          for (const idx of cardsByRank[r]) {
            selected.push(idx);
            kickerCount++;
            if (kickerCount === 2) break;
          }
          if (kickerCount === 2) break;
        }
      }
    } else if (handType === HAND_TYPES.TWO_PAIR) {
      // Two pairs + kicker
      for (const idx of cardsByRank[rank1]) selected.push(idx);
      for (const idx of cardsByRank[rank2]) {
        selected.push(idx);
        if (selected.length === 4) break;
      }
      for (const idx of cardsByRank[kicker]) {
        selected.push(idx);
        if (selected.length === 5) break;
      }
    } else if (handType === HAND_TYPES.PAIR) {
      // Pair + 3 kickers
      for (const idx of cardsByRank[rank1]) selected.push(idx);
      let kickerCount = 0;
      for (let r = 12; r >= 0; r--) {
        if (r !== rank1 && rankCounts[r] > 0) {
          for (const idx of cardsByRank[r]) {
            selected.push(idx);
            kickerCount++;
            if (kickerCount === 3) break;
          }
          if (kickerCount === 3) break;
        }
      }
    } else {
      // High card - top 5 ranks
      let count = 0;
      for (let r = 12; r >= 0; r--) {
        if (rankCounts[r] > 0) {
          for (const idx of cardsByRank[r]) {
            selected.push(idx);
            count++;
            if (count === 5) break;
          }
          if (count === 5) break;
        }
      }
    }

    return selected.map((idx) => cardStrings[idx]);
  }

  /**
   * Evaluates 7 cards using direct 7-card bitwise evaluation (no enumeration)
   * @param {string[]} cardStrings - Array of 7 card strings
   * @returns {{rank: number, type: string}} Hand evaluation result
   */
  function evaluate7Card(cardStrings) {
    if (cardStrings.length !== 7) {
      throw new Error(
        `7-card evaluator requires exactly 7 cards, got ${cardStrings.length}`
      );
    }

    validateHand(cardStrings);

    // Convert 7 cards to integers ONCE (no repeated conversions)
    const cardInts = cardsToInts(cardStrings);

    // Evaluate all 7 cards directly with bitwise evaluator (single evaluation, no enumeration)
    const bitwiseScore = evaluate7CardBitwise(cardInts);

    // Extract hand type from bitwise score
    const handType = (bitwiseScore >> 24) & 0xff;
    let typeName;
    if (handType === HAND_TYPES.STRAIGHT_FLUSH) {
      const highCard = (bitwiseScore >> 16) & 0xff;
      // Check if it's a royal flush (A-high straight flush)
      if (highCard === 12) {
        // Verify it's actually A-K-Q-J-T
        let flushRanks = 0;
        const suits = [0, 0, 0, 0];
        for (let i = 0; i < cardInts.length; i++) {
          suits[cardInts[i] & 3]++;
        }
        let flushSuit = -1;
        if (suits[0] >= 5) flushSuit = 0;
        else if (suits[1] >= 5) flushSuit = 1;
        else if (suits[2] >= 5) flushSuit = 2;
        else if (suits[3] >= 5) flushSuit = 3;

        if (flushSuit !== -1) {
          for (let i = 0; i < cardInts.length; i++) {
            if ((cardInts[i] & 3) === flushSuit) {
              flushRanks |= 1 << (cardInts[i] >> 2);
            }
          }
          if ((flushRanks & 0x1f00) === 0x1f00) {
            typeName = "Royal Flush";
          } else {
            typeName = "Straight Flush";
          }
        } else {
          typeName = "Straight Flush";
        }
      } else {
        typeName = "Straight Flush";
      }
    } else {
      typeName = typeNames[handType] || "Unknown";
    }

    // Construct the best 5-card hand from the 7 cards
    const best5Cards = constructBest5CardHand(
      cardInts,
      bitwiseScore,
      cardStrings
    );

    // Evaluate the best 5-card hand with the 5-card evaluator for exact rank compatibility
    return evaluate5Card(best5Cards);
  }

  // ============================================================================
  // 5-CARD EVALUATOR (Legacy - Used for 5-6 card scenarios)
  // ============================================================================

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
   * @returns {number} Rank value (1-1277 for high card hands)
   */
  function calculateHighCardRank(ranks) {
    const base = 1;
    const r0 = Math.min(12, ranks[0] - 2);
    const r1 = Math.min(12, ranks[1] - 2);
    const r2 = Math.min(12, ranks[2] - 2);
    const r3 = Math.min(12, ranks[3] - 2);
    const r4 = Math.min(12, ranks[4] - 2);

    let position = 0;
    position += Math.min(1287, r0 * 100);
    position += Math.min(165, r1 * 13);
    position += Math.min(36, r2 * 3);
    position += Math.min(8, r3);
    position += r4;

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
    const base = 1278;

    const pair = pairRank - 2;
    const k0 = kickers[0] - 2;
    const k1 = kickers[1] - 2;
    const k2 = kickers[2] - 2;

    let adjK0 = k0 > pair ? k0 - 1 : k0;
    let adjK1 = k1 > pair ? k1 - 1 : k1;
    let adjK2 = k2 > pair ? k2 - 1 : k2;

    let kickerIndex = 0;
    for (let i = 2; i < adjK0; i++) {
      kickerIndex += (i * (i - 1)) / 2;
    }
    kickerIndex += (adjK1 * (adjK1 - 1)) / 2 + adjK2;

    const pairOffset = pair * 220;
    const rank = base + pairOffset + kickerIndex;

    const maxPossible = 4137;
    const maxAllowed = 2467;
    if (rank > maxAllowed) {
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
    const base = 2468;

    const highPair = pairRanks[0] - 2;
    const lowPair = pairRanks[1] - 2;
    const kickerVal = kicker - 2;

    let pairOffset = 0;
    for (let i = 1; i < highPair; i++) {
      pairOffset += i;
    }
    pairOffset += lowPair;

    let exclusions = 0;
    if (kickerVal > highPair) exclusions++;
    if (kickerVal > lowPair) exclusions++;
    const adjustedKicker = kickerVal - exclusions;

    const rank = base + pairOffset * 11 + adjustedKicker;
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
    const base = 3199;

    const trips = tripsRank - 2;
    const k0 = kickers[0] - 2;
    const k1 = kickers[1] - 2;

    let adjK0 = k0 > trips ? k0 - 1 : k0;
    let adjK1 = k1 > trips ? k1 - 1 : k1;

    const tripsOffset = trips * 66;
    let kickerIndex = (adjK0 * (adjK0 - 1)) / 2 + adjK1;

    const rank = base + tripsOffset + kickerIndex;
    return Math.min(4056, Math.max(3199, rank));
  }

  /**
   * Calculates the unique rank for a straight hand (category 4)
   * @param {number[]} ranks - Sorted ranks (descending)
   * @returns {number} Rank value
   */
  function calculateStraightRank(ranks) {
    const base = 4057;
    const highCard = ranks[0] === 14 && ranks[1] === 5 ? 5 : ranks[0];
    return base + (highCard - 5);
  }

  /**
   * Calculates the unique rank for a flush hand (category 5)
   * @param {number[]} ranks - Sorted ranks (descending)
   * @returns {number} Rank value
   */
  function calculateFlushRank(ranks) {
    const base = 4067;
    const r0 = Math.min(12, ranks[0] - 2);
    const r1 = Math.min(12, ranks[1] - 2);
    const r2 = Math.min(12, ranks[2] - 2);
    const r3 = Math.min(12, ranks[3] - 2);
    const r4 = Math.min(12, ranks[4] - 2);

    let position = 0;
    position += Math.min(1287, r0 * 100);
    position += Math.min(165, r1 * 13);
    position += Math.min(36, r2 * 3);
    position += Math.min(8, r3);
    position += r4;

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
    const base = 5344;
    const tripsOffset = Math.min(144, (tripsRank - 2) * 12);
    const pairOffset = Math.min(
      11,
      pairRank < tripsRank ? pairRank - 2 : pairRank - 3
    );
    const rank = base + tripsOffset + pairOffset;
    return Math.min(5499, Math.max(5344, rank));
  }

  /**
   * Evaluates a 5-card poker hand and returns its rank and type
   * @param {string[]} cards - Array of 5 card strings
   * @returns {{rank: number, type: string}} Hand evaluation result
   * @throws {Error} If hand is invalid
   */
  function evaluate5Card(cards) {
    validateHand(cards, 5);

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
      rank = 7462;
      type = "Royal Flush";
    }
    // Straight Flush
    else if (isFlush && straight) {
      const highCard = ranks[0] === 14 && ranks[1] === 5 ? 5 : ranks[0];
      rank = 6185 + (highCard - 5);
      type = "Straight Flush";
    }
    // Four of a Kind
    else if (quads !== -1) {
      const kicker = ranks.find((r) => r !== quads);
      const base = 5500;
      const quadsOffset = Math.min(144, (quads - 2) * 12);
      const kickerOffset = Math.min(11, kicker - 2);
      rank = base + quadsOffset + kickerOffset;
      rank = Math.min(5655, Math.max(5500, rank));
      type = "Four of a Kind";
    }
    // Full House
    else if (trips !== -1 && pairs.length > 0) {
      rank = calculateFullHouseRank(trips, pairs[0]);
      type = "Full House";
    }
    // Flush
    else if (isFlush) {
      rank = calculateFlushRank(ranks);
      type = "Flush";
    }
    // Straight
    else if (straight) {
      rank = calculateStraightRank(ranks);
      type = "Straight";
    }
    // Set (Three of a Kind)
    else if (trips !== -1) {
      rank = calculateTripsRank(ranks, trips);
      type = "Set";
    }
    // Two Pair
    else if (pairs.length >= 2) {
      const sortedPairs = pairs.sort((a, b) => b - a);
      rank = calculateTwoPairRank(ranks, sortedPairs);
      type = "Two Pair";
    }
    // Pair
    else if (pairs.length === 1) {
      rank = calculatePairRank(ranks, pairs[0]);
      type = "Pair";
    }
    // High Card
    else {
      rank = calculateHighCardRank(ranks);
      type = "High Card";
    }

    // Ensure rank is in valid range (1-7462)
    rank = Math.max(1, Math.min(7462, rank));

    return { rank, type };
  }

  /**
   * Generates all combinations of 5 cards from n cards
   * @param {string[]} cards - Array of card strings
   * @returns {string[][]} Array of 5-card combinations
   */
  function generate5CardCombinations(cards) {
    const combinations = [];
    const n = cards.length;

    function generate(start, combo) {
      if (combo.length === 5) {
        combinations.push([...combo]);
        return;
      }

      for (let i = start; i < n; i++) {
        combo.push(cards[i]);
        generate(i + 1, combo);
        combo.pop();
      }
    }

    generate(0, []);
    return combinations;
  }

  // ============================================================================
  // MAIN API - Smart Routing Based on Card Count
  // ============================================================================

  /**
   * Evaluates a poker hand (5-7 cards) and returns its rank and type
   * Automatically routes to 7-card evaluator for 7 cards, 5-card evaluator for 5-6 cards
   * @param {string[]} cards - Array of 5-7 card strings
   * @returns {{rank: number, type: string}} Hand evaluation result
   * @throws {Error} If hand is invalid
   */
  function evaluateHand(cards) {
    if (!Array.isArray(cards) || cards.length < 5 || cards.length > 7) {
      throw new Error(`Hand must contain 5-7 cards, got ${cards.length || 0}`);
    }

    validateHand(cards);

    // Route to appropriate evaluator
    if (cards.length === 7) {
      // Use high-performance 7-card bitwise evaluator
      return evaluate7Card(cards);
    } else if (cards.length === 5) {
      // Use 5-card evaluator directly
      return evaluate5Card(cards);
    } else {
      // 6 cards: generate all combinations and find best
      const combinations = generate5CardCombinations(cards);
      if (combinations.length === 0) {
        throw new Error("Failed to generate 5-card combinations");
      }

      // Evaluate all combinations and find the best
      let bestResult = null;
      let bestRank = 0;

      for (const combo of combinations) {
        const result = evaluate5Card(combo);
        if (result.rank > bestRank) {
          bestRank = result.rank;
          bestResult = result;
        }
      }

      return bestResult;
    }
  }

  /**
   * Evaluates multiple hands and returns the best one
   * @param {string[][]} hands - Array of hands (each hand is an array of 5-7 card strings)
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

  // ============================================================================
  // EXPORTS
  // ============================================================================

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

// Export for ES modules
export function evaluateHand(cards) {
  return calculatorExports.evaluateHand(cards);
}

export function bestHand(hands) {
  return calculatorExports.bestHand(hands);
}
