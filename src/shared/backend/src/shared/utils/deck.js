/**
 * Deck utilities for shuffling and dealing cards
 */

const SUITS = ["hearts", "diamonds", "clubs", "spades"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"]; // T for 10 (standard poker format)
const VALUES = {
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

/**
 * Create a standard 52-card deck
 */
export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      // Use lowercase suit abbreviation: hearts -> h, diamonds -> d, clubs -> c, spades -> s
      const suitAbbr = suit[0].toLowerCase();
      deck.push({
        suit,
        rank,
        value: VALUES[rank],
        display: `${rank}${suitAbbr}`, // e.g., "Ah", "Kd", "Th", "2c" (T = 10)
      });
    }
  }
  return deck;
}

/**
 * Shuffle deck using Fisher-Yates algorithm
 */
export function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Create and shuffle a new deck
 */
export function createShuffledDeck() {
  return shuffleDeck(createDeck());
}

/**
 * Deal cards from deck
 */
export function dealCards(deck, count) {
  if (deck.length < count) {
    throw new Error(
      `Not enough cards in deck. Need ${count}, have ${deck.length}`
    );
  }
  return deck.splice(0, count);
}
