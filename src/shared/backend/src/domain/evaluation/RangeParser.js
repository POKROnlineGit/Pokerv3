/**
 * Range Parser - Expands poker range notation into specific hand combinations
 * Supports pairs, suited/offsuit hands, ranges, and plus notation
 */

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS = ["c", "d", "h", "s"];

/**
 * Expands a range string (e.g. "AA, AKs, QQ+") into a list of specific 2-card combos.
 * @param {string} rangeStr - Range string in poker notation
 * @returns {string[][]} Array of hands, where each hand is string[] (e.g. [["Ah", "Ad"], ...])
 */
export function parseRange(rangeStr) {
  if (!rangeStr) return [];

  const parts = rangeStr
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const combos = [];
  const seen = new Set();

  const addCombo = (c1, c2) => {
    // Normalize to ensure uniqueness (e.g. AhKd vs KdAh)
    const signature = [c1, c2].sort().join("");
    if (!seen.has(signature)) {
      seen.add(signature);
      combos.push([c1, c2]);
    }
  };

  const idx = (r) => RANKS.indexOf(r);

  for (const part of parts) {
    // 1. Pairs (e.g., "AA", "99-77", "QQ+")
    if (part.length === 2 && part[0] === part[1]) {
      generatePairCombos(part[0], addCombo);
    } else if (part.includes("-") && part.length >= 5 && part[0] === part[1]) {
      // Range "99-77" or "77-99" (handle both orders)
      const [first, second] = part.split("-");
      if (first && second) {
        const firstIdx = idx(first[0]);
        const secondIdx = idx(second[0]);
        const startIdx = Math.min(firstIdx, secondIdx);
        const endIdx = Math.max(firstIdx, secondIdx);
        for (let i = startIdx; i <= endIdx; i++) {
          generatePairCombos(RANKS[i], addCombo);
        }
      }
    } else if (part.endsWith("+") && part[0] === part[1]) {
      // Plus "QQ+"
      const startIdx = idx(part[0]);
      for (let i = startIdx; i < RANKS.length; i++) {
        generatePairCombos(RANKS[i], addCombo);
      }
    }
    // 2. Non-Pairs (e.g. "AKs", "AKo", "QJs+", "AKs-A9s")
    else {
      const suited = part.includes("s");
      const offsuit = part.includes("o");

      // Handle ranges like "AKs-A9s" or "AKo-A9o" (must check BEFORE cleaning)
      if (part.includes("-") && (suited || offsuit)) {
        const [highPart, lowPart] = part.split("-");
        if (highPart && lowPart) {
          const highClean = highPart.replace(/[so]/g, "");
          const lowClean = lowPart.replace(/[so]/g, "");
          if (highClean.length === 2 && lowClean.length === 2) {
            // Both parts must have same first rank (e.g., "AKs-A9s")
            if (highClean[0] === lowClean[0]) {
              const topRank = highClean[1];
              const botRank = lowClean[1];
              const topIdx = idx(topRank);
              const botIdx = idx(botRank);
              for (let i = botIdx; i <= topIdx; i++) {
                generateNonPairCombos(highClean[0], RANKS[i], suited, addCombo);
              }
            }
          }
        }
      } else {
        const cleanPart = part.replace(/[so+]/g, "");

        if (cleanPart.length === 2) {
          const r1 = cleanPart[0];
          const r2 = cleanPart[1];

          if (part.endsWith("+")) {
            // "AQs+" -> AQs, AJs, ATs, A9s, ... down to A2s
            // For "AQs+", r1=A, r2=Q, so we want Q down to 2
            const topIdx = idx(r2);
            const botIdx = 0; // Down to 2 (index 0)
            for (let i = botIdx; i <= topIdx; i++) {
              generateNonPairCombos(r1, RANKS[i], suited, addCombo);
            }
          } else {
            // Single "AKs" or "AKo"
            generateNonPairCombos(r1, r2, suited, addCombo);
          }
        }
      }
    }
  }
  return combos;
}

/**
 * Generates all combinations for a pocket pair
 * @param {string} rank - Rank (2-A)
 * @param {function} add - Callback to add combo
 */
function generatePairCombos(rank, add) {
  for (let i = 0; i < SUITS.length; i++) {
    for (let j = i + 1; j < SUITS.length; j++) {
      add(rank + SUITS[i], rank + SUITS[j]);
    }
  }
}

/**
 * Generates combinations for non-pair hands (suited or offsuit)
 * @param {string} r1 - First rank
 * @param {string} r2 - Second rank
 * @param {boolean} suited - Whether hand is suited
 * @param {function} add - Callback to add combo
 */
function generateNonPairCombos(r1, r2, suited, add) {
  if (suited) {
    for (const s of SUITS) {
      add(r1 + s, r2 + s);
    }
  } else {
    for (const s1 of SUITS) {
      for (const s2 of SUITS) {
        if (s1 !== s2) {
          add(r1 + s1, r2 + s2);
        }
      }
    }
  }
}
