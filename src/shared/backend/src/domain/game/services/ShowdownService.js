/**
 * ShowdownService - Server-side hand evaluation using custom pure JS calculator
 * Uses custom showdownCalculator for browser/Node.js compatibility
 */

import {
  evaluateHand as evaluateHandFromCalculator,
  bestHand,
} from "../../evaluation/showdownCalculator.js";

/**
 * Convert our card format to calculator format (string format)
 * @param {Array} cards - Array of {suit, rank} objects or card strings
 * @returns {Array} Array of strings in format "Ah", "Kd", etc.
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
    // Handle both object format {suit, rank} and string format "Ah"
    if (typeof card === "string") {
      return card;
    }

    // Card rank is already in format "T" for ten
    const rank = card.rank || card.display?.[0];
    const suit =
      suitMap[card.suit] ||
      card.suit?.[0]?.toLowerCase() ||
      card.display?.[1]?.toLowerCase();

    // If card has display property, use it directly
    if (card.display) {
      return card.display;
    }

    return `${rank}${suit}`;
  });
}

/**
 * Find the best 5-card hand from 5, 6, or 7 cards
 * Uses the calculator's smart routing: 5-card direct, 6-card with combinations, 7-card with direct bitwise evaluation
 * @param {Array} holeCards - Player's hole cards
 * @param {Array} communityCards - Community cards
 * @returns {Object|null} Hand evaluation result {rank, type} or null
 */
function findBestHandFromCards(holeCards, communityCards) {
  const allCards = [...holeCards, ...communityCards];

  if (allCards.length < 5) {
    return null;
  }

  const cardStrings = convertCardsToStringFormat(allCards);

  // Let the calculator handle routing automatically:
  // - 5 cards: direct evaluation
  // - 6 cards: generates 6 combinations, evaluates each
  // - 7 cards: direct 7-card bitwise evaluation (fast, no enumeration)
  try {
    return evaluateHandFromCalculator(cardStrings);
  } catch (error) {
    console.error("Error evaluating hand:", error);
    return null;
  }
}

/**
 * Evaluate a player's hand
 * @param {Array} holeCards - Player's hole cards
 * @param {Array} communityCards - Community cards
 * @returns {Object} Hand evaluation result
 */
export function evaluateHand(holeCards, communityCards) {
  const evaluation = findBestHandFromCards(holeCards, communityCards);

  if (!evaluation) {
    return null;
  }

  // Convert cards to string format for metadata
  const holeCardStrings = convertCardsToStringFormat(holeCards);
  const communityCardStrings = convertCardsToStringFormat(communityCards);

  return {
    name: evaluation.type,
    rank: evaluation.rank,
    type: evaluation.type,
    // Additional metadata
    holeCards: holeCardStrings,
    communityCards: communityCardStrings,
  };
}

/**
 * Compare multiple hands and determine winners
 * @param {Array} players - Array of {id, holeCards, ...} objects
 * @param {Array} communityCards - Community cards
 * @returns {Object} Winners and hand rankings
 */
export function determineWinners(players, communityCards) {
  const playerHands = [];
  const handStrings = []; // Array of card string arrays for bestHand comparison

  // Evaluate each player's hand
  for (const player of players) {
    if (player.folded || !player.holeCards || player.holeCards.length < 2) {
      continue;
    }

    const evaluation = findBestHandFromCards(player.holeCards, communityCards);
    if (evaluation) {
      // Convert to string format for comparison
      const allCardStrings = convertCardsToStringFormat([
        ...player.holeCards,
        ...communityCards,
      ]);

      // For display purposes, we want the best 5-card hand
      // If we have 5 cards, use them directly
      // If we have 6-7 cards, we need to find which 5 cards make the best hand
      // We can do this by evaluating all combinations, but for 7 cards this is expensive
      // For now, we'll store all cards and let the display layer handle it if needed
      // The evaluation already tells us the best hand type and rank
      let bestFiveCards = allCardStrings;
      if (allCardStrings.length > 5) {
        // For 6-7 cards, find the best 5-card combination
        // Note: For 7 cards, this still generates combinations, but it's only for display
        // The actual evaluation already used the fast 7-card evaluator
        const combinations = [];
        function generateCombinations(start, combo) {
          if (combo.length === 5) {
            combinations.push([...combo]);
            return;
          }
          for (let i = start; i < allCardStrings.length; i++) {
            combo.push(allCardStrings[i]);
            generateCombinations(i + 1, combo);
            combo.pop();
          }
        }
        generateCombinations(0, []);

        if (combinations.length > 0) {
          const bestResult = bestHand(combinations);
          bestFiveCards = bestResult.hand;
        }
      }

      handStrings.push(bestFiveCards);
      playerHands.push({
        playerId: player.id,
        seat: player.seat,
        hand: bestFiveCards, // Store the best 5-card hand for display
        evaluation: evaluation,
        rank: evaluation.rank, // Store rank for comparison
      });
    }
  }

  if (playerHands.length === 0) {
    return { winners: [], rankings: [] };
  }

  // Find winners using custom calculator
  // Evaluate all hands and find the best rank
  // The calculator uses rank 1-7462 where higher is better
  let bestRank = 0;
  for (const ph of playerHands) {
    if (ph.rank > bestRank) {
      bestRank = ph.rank;
    }
  }

  // Find all players with the best rank (winners)
  // Note: Multiple players can have the same rank (tie)
  const winnerIndices = [];
  for (let i = 0; i < playerHands.length; i++) {
    if (playerHands[i].rank === bestRank) {
      winnerIndices.push(i);
    }
  }

  // Map winners back to players
  const winnerPlayers = winnerIndices.map((idx) => playerHands[idx]);

  // Create rankings (all players sorted by hand strength)
  // Higher rank = better hand in our calculator
  const sortedHands = [...playerHands].sort((a, b) => {
    // Sort by hand rank (higher is better in our calculator)
    return b.rank - a.rank;
  });

  const rankings = sortedHands.map((ph, idx) => {
    const originalIndex = playerHands.findIndex(
      (p) => p.playerId === ph.playerId && p.seat === ph.seat
    );
    return {
      ...ph,
      rank: idx + 1,
      isWinner: winnerIndices.includes(originalIndex),
    };
  });

  return {
    winners: winnerPlayers,
    rankings: rankings,
  };
}

/**
 * Calculate pot distribution for winners
 * @param {Array} pots - Array of pot objects {amount, eligiblePlayers}
 * @param {Object} winnersResult - Result from determineWinners
 * @returns {Array} Pot distribution [{playerId, amount, potIndex}]
 */
export function distributePots(pots, winnersResult) {
  const distributions = [];

  for (let potIndex = 0; potIndex < pots.length; potIndex++) {
    const pot = pots[potIndex];
    const eligibleWinners = winnersResult.winners.filter((winner) =>
      pot.eligiblePlayers.includes(winner.playerId)
    );

    if (eligibleWinners.length === 0) {
      continue;
    }

    // Split pot equally among winners
    const amountPerWinner = Math.floor(pot.amount / eligibleWinners.length);
    const remainder = pot.amount % eligibleWinners.length;

    eligibleWinners.forEach((winner, idx) => {
      const amount = amountPerWinner + (idx < remainder ? 1 : 0);
      distributions.push({
        playerId: winner.playerId,
        amount: amount,
        potIndex: potIndex,
      });
    });
  }

  return distributions;
}

