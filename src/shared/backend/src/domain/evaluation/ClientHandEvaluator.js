/**
 * ClientHandEvaluator - Frontend-friendly hand strength evaluator
 * Provides user-friendly hand descriptions for display in the UI
 * 
 * Designed for client-side usage to show current hand strength
 * (e.g., "Pair (Kings)", "Set (7s)", "Full House (Aces full of Kings)")
 */

import { bestHand, evaluateHand } from "./showdownCalculator.js";

/**
 * Rank to name mapping for display
 */
const RANK_NAMES = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "T",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

/**
 * Convert rank number to display name
 * @param {number} rank - Rank number (2-14)
 * @returns {string} Display name
 */
function getRankName(rank) {
  return RANK_NAMES[rank] || String(rank);
}

/**
 * Parse card string to extract rank
 * @param {string} card - Card string (e.g., "Ah", "Kd")
 * @returns {number} Rank (2-14)
 */
function getCardRank(card) {
  if (typeof card !== "string" || card.length < 1) {
    return null;
  }
  const rankChar = card[0].toUpperCase();
  const rankMap = {
    2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
    T: 10, J: 11, Q: 12, K: 13, A: 14,
  };
  return rankMap[rankChar] || null;
}

/**
 * Convert card format (handles both string and object formats)
 * @param {Array} cards - Array of cards (strings or objects)
 * @returns {Array} Array of card strings
 */
function convertCardsToStringFormat(cards) {
  if (!cards || cards.length === 0) return [];

  // If cards are already strings, return as-is
  if (typeof cards[0] === "string") {
    return cards;
  }

  const suitMap = {
    hearts: "h",
    diamonds: "d",
    clubs: "c",
    spades: "s",
  };

  return cards.map((card) => {
    if (typeof card === "string") {
      return card;
    }

    // Handle object format {suit, rank} or {display}
    if (card.display) {
      return card.display;
    }

    const rank = card.rank || card.display?.[0];
    const suit =
      suitMap[card.suit] ||
      card.suit?.[0]?.toLowerCase() ||
      card.display?.[1]?.toLowerCase();

    return `${rank}${suit}`;
  });
}

/**
 * Evaluate 2-4 cards using simple heuristics
 * @param {Array<string>} cardStrings - Array of 2-4 card strings
 * @returns {string|null} User-friendly description or null
 */
function evaluatePartialHand(cardStrings) {
  if (cardStrings.length < 2) {
    return null;
  }

  const ranks = cardStrings
    .map(getCardRank)
    .filter((r) => r !== null)
    .sort((a, b) => b - a); // Descending

  if (ranks.length < 2) {
    return null;
  }

  // Count rank frequencies
  const rankCounts = {};
  ranks.forEach((rank) => {
    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
  });

  const counts = Object.values(rankCounts).sort((a, b) => b - a);
  const uniqueRanks = Object.keys(rankCounts)
    .map(Number)
    .sort((a, b) => b - a);

  // Check for pairs
  if (counts[0] === 2) {
    const pairRank = uniqueRanks.find((r) => rankCounts[r] === 2);
    const rankName = getRankName(pairRank);
    // Pluralize for display
    const pluralName = rankName === "A" ? "Aces" : rankName === "K" ? "Kings" : rankName === "Q" ? "Queens" : rankName === "J" ? "Jacks" : rankName + "s";
    return `Pair (${pluralName})`;
  }

  // Check for three of a kind (if 3+ cards)
  if (cardStrings.length >= 3 && counts[0] === 3) {
    const tripsRank = uniqueRanks.find((r) => rankCounts[r] === 3);
    const rankName = getRankName(tripsRank);
    const pluralName = rankName === "A" ? "Aces" : rankName === "K" ? "Kings" : rankName === "Q" ? "Queens" : rankName === "J" ? "Jacks" : rankName + "s";
    return `Set (${pluralName})`;
  }

  // High card
  const highCardName = getRankName(ranks[0]);
  const highCardDisplay =
    highCardName === "A"
      ? "Ace"
      : highCardName === "K"
      ? "King"
      : highCardName === "Q"
      ? "Queen"
      : highCardName === "J"
      ? "Jack"
      : highCardName;
  return `High Card (${highCardDisplay})`;
}

/**
 * Format hand type for display with details
 * @param {Object} evaluation - Evaluation result from calculator {rank, type, hand?}
 * @returns {string} User-friendly description
 */
function formatHandDescription(evaluation) {
  if (!evaluation || !evaluation.type) {
    return "Unknown Hand";
  }

  const type = evaluation.type;
  const hand = evaluation.hand || [];

  // Parse ranks from hand
  const ranks = hand
    .map(getCardRank)
    .filter((r) => r !== null)
    .sort((a, b) => b - a);

  // Count rank frequencies
  const rankCounts = {};
  ranks.forEach((rank) => {
    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
  });

  const sortedRanks = Object.keys(rankCounts)
    .map(Number)
    .sort((a, b) => {
      // Sort by frequency (descending), then by rank (descending)
      if (rankCounts[b] !== rankCounts[a]) {
        return rankCounts[b] - rankCounts[a];
      }
      return b - a;
    });

  switch (type) {
    case "Royal Flush":
      return "Royal Flush";

    case "Straight Flush":
      return "Straight Flush";

    case "Four of a Kind": {
      const quadsRank = sortedRanks[0];
      const quadsName = getRankName(quadsRank);
      const quadsPlural =
        quadsName === "A"
          ? "Aces"
          : quadsName === "K"
          ? "Kings"
          : quadsName === "Q"
          ? "Queens"
          : quadsName === "J"
          ? "Jacks"
          : quadsName + "s";
      return `Quads (${quadsPlural})`;
    }

    case "Full House":
      return "Full House";

    case "Flush":
      return "Flush";

    case "Straight":
      return "Straight";

    case "Set": {
      const tripsRank = sortedRanks[0];
      const tripsName = getRankName(tripsRank);
      const tripsPlural =
        tripsName === "A"
          ? "Aces"
          : tripsName === "K"
          ? "Kings"
          : tripsName === "Q"
          ? "Queens"
          : tripsName === "J"
          ? "Jacks"
          : tripsName + "s";
      return `Set (${tripsPlural})`;
    }

    case "Two Pair": {
      const highPairRank = sortedRanks[0];
      const lowPairRank = sortedRanks[1];
      const highPairName = getRankName(highPairRank);
      const lowPairName = getRankName(lowPairRank);
      const highPairPlural =
        highPairName === "A"
          ? "Aces"
          : highPairName === "K"
          ? "Kings"
          : highPairName === "Q"
          ? "Queens"
          : highPairName === "J"
          ? "Jacks"
          : highPairName + "s";
      const lowPairPlural =
        lowPairName === "A"
          ? "Aces"
          : lowPairName === "K"
          ? "Kings"
          : lowPairName === "Q"
          ? "Queens"
          : lowPairName === "J"
          ? "Jacks"
          : lowPairName + "s";
      return `Two Pair (${highPairPlural}, ${lowPairPlural})`;
    }

    case "Pair": {
      const pairRank = sortedRanks[0];
      const pairName = getRankName(pairRank);
      const pairPlural =
        pairName === "A"
          ? "Aces"
          : pairName === "K"
          ? "Kings"
          : pairName === "Q"
          ? "Queens"
          : pairName === "J"
          ? "Jacks"
          : pairName + "s";
      return `Pair (${pairPlural})`;
    }

    case "High Card": {
      const highCard = ranks[0];
      const highCardName = getRankName(highCard);
      const highCardDisplay =
        highCardName === "A"
          ? "Ace"
          : highCardName === "K"
          ? "King"
          : highCardName === "Q"
          ? "Queen"
          : highCardName === "J"
          ? "Jack"
          : highCardName;
      return `High Card (${highCardDisplay})`;
    }

    default:
      return type;
  }
}

/**
 * Get client-friendly hand strength description
 * @param {Array} holeCards - Player's hole cards (2 cards)
 * @param {Array} communityCards - Community cards (0-5 cards)
 * @returns {string|null} User-friendly hand description or null if insufficient cards
 */
export function getClientHandStrength(holeCards, communityCards = []) {
  // Convert cards to string format
  const holeCardStrings = convertCardsToStringFormat(holeCards || []);
  const communityCardStrings = convertCardsToStringFormat(communityCards || []);
  const allCards = [...holeCardStrings, ...communityCardStrings];

  // < 2 cards: Return null
  if (allCards.length < 2) {
    return null;
  }

  // 2-4 cards: Use simple heuristics
  if (allCards.length < 5) {
    return evaluatePartialHand(allCards);
  }

  // 5+ cards: Use bestHand to find best 5-card combination
  if (allCards.length === 5) {
    // Exactly 5 cards - evaluate directly
    try {
      const evaluation = evaluateHand(allCards);
      return formatHandDescription({ ...evaluation, hand: allCards });
    } catch (error) {
      console.error("Error evaluating 5-card hand:", error);
      return null;
    }
  }

  // 6-7 cards: Generate all combinations and find best
  const combinations = [];
  function generateCombinations(start, combo) {
    if (combo.length === 5) {
      combinations.push([...combo]);
      return;
    }
    for (let i = start; i < allCards.length; i++) {
      combo.push(allCards[i]);
      generateCombinations(i + 1, combo);
      combo.pop();
    }
  }
  generateCombinations(0, []);

  if (combinations.length === 0) {
    return null;
  }

  try {
    const best = bestHand(combinations);
    return formatHandDescription(best);
  } catch (error) {
    console.error("Error finding best hand:", error);
    return null;
  }
}

