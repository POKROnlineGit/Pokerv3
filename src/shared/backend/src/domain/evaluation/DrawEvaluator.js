/**
 * Draw Evaluator - Detects Flush Draws, OESDs, and Gutshots
 * Uses standard poker definitions (e.g., A-2-3-4 is a Gutshot, not OESD)
 */

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

/**
 * Draw type enumeration
 * @typedef {'Flush Draw'|'OESD'|'Gutshot'|null} DrawType
 */

/**
 * Detects draws in a set of cards (Hole + Board).
 * Returns the strongest draw found, or null.
 * Prioritizes: Flush Draw > OESD > Gutshot
 * @param {string[]} cards - Array of card strings (e.g., ["Ah", "Kh", "Qh", "Jh"])
 * @returns {DrawType} The strongest draw type found, or null if no draw
 */
export function detectDraw(cards) {
  const suits = { s: 0, h: 0, d: 0, c: 0 };
  let ranksMask = 0;

  // 1. Parse Cards
  for (const card of cards) {
    const rChar = card[0];
    const sChar = card[1];

    if (suits.hasOwnProperty(sChar)) {
      suits[sChar]++;
    }

    const rIdx = RANKS.indexOf(rChar);
    if (rIdx !== -1) {
      ranksMask |= 1 << rIdx;
    }
  }

  // 2. Check Flush Draw (4 cards of same suit)
  // Note: 5+ cards is a Made Flush, checked by main evaluator.
  if (suits.s === 4 || suits.h === 4 || suits.d === 4 || suits.c === 4) {
    return "Flush Draw";
  }

  // 3. Check Straight Draws
  let isOESD = false;
  let isGutshot = false;

  // --- OESD CHECK ---
  // Standard OESD: 4 consecutive ranks (e.g. 5-6-7-8)
  // Masks: 2345 (0x0F) up to TJQK (0xF00)
  // NOTE: JQKA (0x1E00) is NOT OESD, it is Gutshot (Broadway Draw)

  for (let i = 0; i <= 8; i++) {
    // Check 4 consecutive bits: 1111 shifted i times
    const mask = 0xf << i;
    if ((ranksMask & mask) === mask) {
      isOESD = true;
      break; // Found OESD, no need to check further
    }
  }

  if (isOESD) return "OESD";

  // --- GUTSHOT CHECK ---

  // A. Ace-High Blocked (Broadway Draw): J-Q-K-A
  // Mask: 0x1E00 (bits 9,10,11,12)
  if ((ranksMask & 0x1e00) === 0x1e00) {
    isGutshot = true;
  }

  // B. Ace-Low Blocked (Wheel Draw): A-2-3-4
  // Mask: A(12) | 2(0) | 3(1) | 4(2) => 1000...0111 => 0x1007
  if ((ranksMask & 0x1007) === 0x1007) {
    isGutshot = true;
  }

  // C. Inside Gaps (1-gap in a 4-card sequence)
  // We iterate through 5-bit windows to find patterns: 10111, 11011, 11101
  if (!isGutshot) {
    for (let i = 0; i <= 8; i++) {
      const window = (ranksMask >> i) & 0x1f;
      // 0x17 = 10111 (Gap at 2)
      // 0x1B = 11011 (Gap at 3)
      // 0x1D = 11101 (Gap at 4)
      if (window === 0x17 || window === 0x1b || window === 0x1d) {
        isGutshot = true;
        break;
      }
    }
  }

  // D. Wheel Gutshots (Gaps involving Ace)
  // A-2-3-5 (Gap 4): 0x100B
  // A-2-4-5 (Gap 3): 0x100D
  // A-3-4-5 (Gap 2): 0x100E
  if (!isGutshot) {
    if ((ranksMask & 0x100b) === 0x100b) isGutshot = true;
    if ((ranksMask & 0x100d) === 0x100d) isGutshot = true;
    if ((ranksMask & 0x100e) === 0x100e) isGutshot = true;
  }

  if (isGutshot) return "Gutshot";

  return null;
}

