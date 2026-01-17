/**
 * Embedded Preflop Equity Lookup (No file I/O, Client & Server Compatible)
 * - Data is embedded as a generated JS array in preflop_equities_array.js
 * - Logic: Triangle lookup (Upper Triangle Storage) over 1326 specific hands
 */

import { EQUITY_DATA } from "./preflop_equities_array.js";

// 1. Constants
const RANK_MAP = {
  2: 0,
  3: 1,
  4: 2,
  5: 3,
  6: 4,
  7: 5,
  8: 6,
  9: 7,
  T: 8,
  J: 9,
  Q: 10,
  K: 11,
  A: 12,
};

const SUIT_MAP = {
  c: 0,
  d: 1,
  h: 2,
  s: 3,
};

const NUM_HANDS = 1326;
const TRIANGLE_SIZE = (NUM_HANDS * (NUM_HANDS + 1)) / 2; // 879,651 entries

// 2. State Management - fully synchronous, no async init required
const equityBuffer =
  Array.isArray(EQUITY_DATA) && EQUITY_DATA.length === TRIANGLE_SIZE
    ? new Uint16Array(EQUITY_DATA)
    : null;

/**
 * Helper: Card String to ID (0-51)
 */
function getCardId(cardStr) {
  if (!cardStr || cardStr.length < 2) return -1;
  const r = cardStr[0].toUpperCase();
  const s = cardStr[1].toLowerCase();
  
  if (RANK_MAP[r] === undefined || SUIT_MAP[s] === undefined) return -1;
  return (RANK_MAP[r] * 4) + SUIT_MAP[s];
}

/**
 * Helper: 2 Cards to Hand ID (0-1325)
 */
function getHandId(c1, c2) {
  let lower = c1;
  let higher = c2;
  
  if (c1 > c2) { lower = c2; higher = c1; } 
  else if (c1 === c2) return -1;

  // Lexicographical Index Formula
  return (51 * lower) - ((lower * (lower - 1)) / 2) + higher - lower - 1;
}

/**
 * Helper: Triangle Index Calculation
 */
function getTriangleIndex(idA, idB) {
  // Assumes idA <= idB
  const base = (idA * NUM_HANDS) - ((idA * (idA - 1)) / 2);
  return base + (idB - idA);
}

/**
 * Sync Check for availability
 */
export function isLookupAvailable() {
  return equityBuffer !== null;
}

/**
 * The Main Lookup Function (Synchronous)
 */
export function lookupHeadsUpPreflop(hand1, hand2) {
  if (!equityBuffer) return null;

  // Basic shape validation (defensive)
  if (
    !Array.isArray(hand1) ||
    !Array.isArray(hand2) ||
    hand1.length !== 2 ||
    hand2.length !== 2
  ) {
    return null;
  }

  const allCards = [...hand1, ...hand2];
  if (new Set(allCards).size !== 4) return null;

  const h1c1 = getCardId(hand1[0]);
  const h1c2 = getCardId(hand1[1]);
  const h2c1 = getCardId(hand2[0]);
  const h2c2 = getCardId(hand2[1]);

  if (h1c1 < 0 || h1c2 < 0 || h2c1 < 0 || h2c2 < 0) return null;

  const id1 = getHandId(h1c1, h1c2);
  const id2 = getHandId(h2c1, h2c2);

  if (id1 < 0 || id2 < 0) return null;

  let eq1, eq2;

  if (id1 <= id2) {
    // Upper Triangle: Value is Eq1
    const val = equityBuffer[getTriangleIndex(id1, id2)];
    eq1 = val / 100;
    eq2 = 100 - eq1;
  } else {
    // Lower Triangle: Lookup (id2, id1) -> Value is Eq2
    const val = equityBuffer[getTriangleIndex(id2, id1)];
    eq2 = val / 100;
    eq1 = 100 - eq2;
  }

  return {
    equities: [eq1, eq2],
    iterations: 1712304,
  };
}