/**
 * Stats Utilities - Helper functions for poker statistics
 * 
 * Converts hole cards to isomorphic format for stat aggregation
 */

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

/**
 * Converts two hole cards to isomorphic format (e.g., "Ah" "Ks" -> "AKo")
 * 
 * @param {string|number} card1 - First card (e.g., "Ah" or card index 0-51)
 * @param {string|number} card2 - Second card (e.g., "Ks" or card index 0-51)
 * @returns {string} Isomorphic format (e.g., "AA", "AKs", "AKo", "T9o")
 * @throws {Error} If cards are invalid or identical
 */
export function cardsToIsomorphic(card1, card2) {
  // Convert card indices to strings if needed
  if (typeof card1 === "number") {
    card1 = indexToCardString(card1);
  }
  if (typeof card2 === "number") {
    card2 = indexToCardString(card2);
  }

  // Validate inputs are strings
  if (typeof card1 !== "string" || typeof card2 !== "string") {
    throw new Error(`Invalid card format: card1=${card1}, card2=${card2}`);
  }

  if (card1.length < 2 || card2.length < 2) {
    throw new Error(`Invalid card format: cards must be at least 2 characters`);
  }

  // Extract rank and suit
  const getRank = (card) => card[0].toUpperCase();
  const getSuit = (card) => card[1].toLowerCase();

  const rank1 = getRank(card1);
  const rank2 = getRank(card2);
  const suit1 = getSuit(card1);
  const suit2 = getSuit(card2);

  // Validate ranks
  const rank1Idx = RANKS.indexOf(rank1);
  const rank2Idx = RANKS.indexOf(rank2);

  if (rank1Idx === -1) {
    throw new Error(`Invalid rank: ${rank1}`);
  }
  if (rank2Idx === -1) {
    throw new Error(`Invalid rank: ${rank2}`);
  }

  // Validate suits
  const validSuits = ["h", "d", "c", "s"];
  if (!validSuits.includes(suit1)) {
    throw new Error(`Invalid suit: ${suit1}`);
  }
  if (!validSuits.includes(suit2)) {
    throw new Error(`Invalid suit: ${suit2}`);
  }

  // Ensure higher rank first (for consistency)
  const highRank = rank1Idx > rank2Idx ? rank1 : rank2;
  const lowRank = rank1Idx > rank2Idx ? rank2 : rank1;

  // Pocket pair
  if (rank1 === rank2) {
    return highRank + highRank; // e.g., "AA", "99"
  }

  // Suited or offsuit
  const suited = suit1 === suit2;
  return highRank + lowRank + (suited ? "s" : "o"); // e.g., "AKs" or "AKo"
}

/**
 * Converts a card index (0-51) to card string format (e.g., "Ah")
 * @param {number} index - Card index (0-51)
 * @returns {string} Card string (e.g., "Ah", "Kd")
 */
function indexToCardString(index) {
  if (typeof index !== "number" || index < 0 || index > 51) {
    throw new Error(`Invalid card index: ${index} (must be 0-51)`);
  }

  const suit = Math.floor(index / 13);
  const rank = index % 13;
  const suitChars = ["h", "d", "c", "s"];
  const rankChars = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

  return `${rankChars[rank]}${suitChars[suit]}`;
}
