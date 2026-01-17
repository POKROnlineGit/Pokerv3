/**
 * N-Player Equity Calculator - Calculates win percentages for 2-10 players
 * Supports both specific hands and range strings as input
 * Uses Exact Enumeration for Flop, Turn, and River
 * Uses Monte Carlo only for Preflop
 * Leverages the optimized 7-card evaluator from showdownCalculator
 */

import { evaluateHand } from "./showdownCalculator.js";
import { parseRange } from "./RangeParser.js";
import { lookupHeadsUpPreflop } from "./equity_lookup/EquityLookup.js";

// Deck constants
const SUITS = ["h", "d", "c", "s"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

// Generate full deck of 52 cards
const FULL_DECK = [];
for (const s of SUITS) {
  for (const r of RANKS) {
    FULL_DECK.push(r + s);
  }
}

function safeFail(numPlayers) {
  return { equities: Array(numPlayers).fill(0), iterations: 0 };
}

function canonicalizeCard(card) {
  if (typeof card !== "string" || card.length < 2) return null;
  const r = card[0].toUpperCase();
  const s = card[1].toLowerCase();
  if (!RANKS.includes(r) || !SUITS.includes(s)) return null;
  return r + s;
}

/**
 * Equity calculation result
 * @typedef {Object} EquityResult
 * @property {number[]} equities - Array of equity percentages (0-100), index matches input hands order
 * @property {number} iterations - Number of iterations/simulations run
 */

/**
 * Calculates equity for N players (2-10) where players can be specific hands OR ranges.
 *
 * Strategy:
 * - River (0 cards to come): Exact enumeration (iterates all range combinations)
 * - Turn (1 card to come): Exact enumeration (iterates all range combinations × deck cards)
 * - Flop (2 cards to come): Monte Carlo with range sampling (default 10k iterations)
 * - Preflop (3-5 cards to come): Monte Carlo with range sampling (default 10k iterations)
 *
 * @param {(string[]|string)[]} playerInputs - Array where each element is either:
 *   - string[]: Specific hand e.g. ['Ah', 'Kh']
 *   - string: Range string e.g. "QQ+, AKs"
 * @param {string[]} board - Array of community cards (0-5)
 * @param {number} iterations - Monte Carlo iterations for Preflop/Flop (default 10000)
 * @returns {EquityResult} Equity calculation result with equities array and iterations count
 */
export function calculateEquity(playerInputs, board, iterations = 10000) {
  const numPlayers = Array.isArray(playerInputs) ? playerInputs.length : 0;
  if (numPlayers < 2 || numPlayers > 10) return safeFail(numPlayers);

  try {
    // Validate board early (size, format, duplicates) to avoid evaluator throws
    if (!Array.isArray(board) || board.length < 0 || board.length > 5) {
      return safeFail(numPlayers);
    }

    const canonicalBoard = board.map(canonicalizeCard);
    if (canonicalBoard.some((c) => !c)) return safeFail(numPlayers);
    if (new Set(canonicalBoard).size !== canonicalBoard.length) return safeFail(numPlayers);

    // Ensure iterations is sane
    const safeIterations =
      Number.isFinite(iterations) && iterations > 0 ? Math.floor(iterations) : 0;
    if (safeIterations <= 0) return safeFail(numPlayers);

    // 1. Parse Inputs & Identify Fixed vs Range Players
    const playerCombos = []; // [playerIndex][comboIndex] => Hand
    const isRangePlayer = [];

    for (const input of playerInputs) {
      if (Array.isArray(input)) {
        // Specific Hand - validate it has exactly 2 cards
        if (!input || input.length !== 2) return safeFail(numPlayers);

        const c1 = canonicalizeCard(input[0]);
        const c2 = canonicalizeCard(input[1]);
        if (!c1 || !c2) return safeFail(numPlayers);
        if (c1 === c2) return safeFail(numPlayers); // duplicate within hand

        playerCombos.push([[c1, c2]]);
        isRangePlayer.push(false);
      } else if (typeof input === "string") {
        // Range String
        const combos = parseRange(input);
        if (!Array.isArray(combos) || combos.length === 0) return safeFail(numPlayers);

        // Defensive: normalize any cards coming from the range parser
        const normalizedCombos = [];
        for (const combo of combos) {
          if (!Array.isArray(combo) || combo.length !== 2) continue;
          const c1 = canonicalizeCard(combo[0]);
          const c2 = canonicalizeCard(combo[1]);
          if (!c1 || !c2 || c1 === c2) continue;
          normalizedCombos.push([c1, c2]);
        }
        if (normalizedCombos.length === 0) return safeFail(numPlayers);

        playerCombos.push(normalizedCombos);
        isRangePlayer.push(true);
      } else {
        // Invalid input type
        return safeFail(numPlayers);
      }
    }

    // 2. Setup Dead Cards (Board + Fixed Hands)
    // Note: We don't filter range combos yet because they vary per simulation.
    // But we MUST remove fixed cards from the deck.
    const fixedDeadCards = new Set(canonicalBoard);
    for (let i = 0; i < numPlayers; i++) {
      if (!isRangePlayer[i]) {
        for (const c of playerCombos[i][0]) {
          if (fixedDeadCards.has(c)) return safeFail(numPlayers); // duplicate across board/hands
          fixedDeadCards.add(c);
        }
      }
    }

    // 2.5. Fast Path: Heads-Up Preflop Fixed-vs-Fixed Lookup
    if (numPlayers === 2 && canonicalBoard.length === 0 && !isRangePlayer[0] && !isRangePlayer[1]) {
      const lookupResult = lookupHeadsUpPreflop(playerCombos[0][0], playerCombos[1][0]);
      if (lookupResult) {
        return lookupResult;
      }
      // Fall through to normal calculation if lookup fails
    }

    // 3. Setup Counters
    // wins[i] = score for player i (1.0 for win, 0.5 for 2-way tie, etc.)
    const wins = new Float64Array(numPlayers);
    const cardsToCome = 5 - canonicalBoard.length;
    let totalCount = 0;

    // 4. Helper: Evaluate one showdown with specific hands and runout
    const evaluateShowdown = (activeHands, runout) => {
      let bestRank = -1;
      const ranks = new Int32Array(numPlayers);

      for (let i = 0; i < numPlayers; i++) {
        const rank = evaluateHand([
          ...activeHands[i],
          ...canonicalBoard,
          ...runout,
        ]).rank;
        ranks[i] = rank;
        if (rank > bestRank) bestRank = rank;
      }

      let winnersCount = 0;
      for (let i = 0; i < numPlayers; i++) {
        if (ranks[i] === bestRank) winnersCount++;
      }

      const points = 1.0 / winnersCount;
      for (let i = 0; i < numPlayers; i++) {
        if (ranks[i] === bestRank) wins[i] += points;
      }
    };

    // 5. Execution Strategy

    // Check if any player is using a range
    const hasRangePlayer = isRangePlayer.some((isRange) => isRange);

    // SCENARIO A: PREFLOP / FLOP (Monte Carlo with Range Sampling)
    // Reason: Too many combinations to enumerate when ranges are involved.
    // If all players have fixed hands, use exact enumeration for Flop (like original).
    if (cardsToCome > 1 && (hasRangePlayer || cardsToCome > 2)) {
      totalCount = safeIterations;

      // Pre-filter range combos against fixed dead cards (optimization)
      const filteredCombos = [];
      for (let p = 0; p < numPlayers; p++) {
        if (isRangePlayer[p]) {
          filteredCombos[p] = playerCombos[p].filter(
            (combo) =>
              !fixedDeadCards.has(combo[0]) && !fixedDeadCards.has(combo[1])
          );
          // If no valid combos after filtering, return zero equity
          if (filteredCombos[p].length === 0) return safeFail(numPlayers);
        } else {
          filteredCombos[p] = playerCombos[p];
        }
      }

      // Simulation Loop
      for (let i = 0; i < safeIterations; i++) {
        // A. Sample Hands for Range Players
        const currentHands = new Array(numPlayers);
        const currentDead = new Set(fixedDeadCards);
        let validSample = true;

        for (let p = 0; p < numPlayers; p++) {
          if (!isRangePlayer[p]) {
            currentHands[p] = filteredCombos[p][0];
          } else {
            // Randomly pick a combo that doesn't conflict with currentDead
            const combos = filteredCombos[p];
            let attempts = 0;
            let selected = null;

            while (attempts < 10) {
              const r = Math.floor(Math.random() * combos.length);
              const candidate = combos[r];
              if (
                !currentDead.has(candidate[0]) &&
                !currentDead.has(candidate[1])
              ) {
                selected = candidate;
                break;
              }
              attempts++;
            }

            if (!selected) {
              validSample = false;
              break; // Failed to find valid hand for this player
            }

            currentHands[p] = selected;
            currentDead.add(selected[0]);
            currentDead.add(selected[1]);
          }
        }

        if (!validSample) {
          // Retry this iteration (don't count it)
          i--;
          continue;
        }

        // B. Generate Runout from remaining deck
        const deck = FULL_DECK.filter((c) => !currentDead.has(c));
        if (deck.length < cardsToCome) {
          // Not enough cards for runout, skip this iteration
          i--;
          continue;
        }

        // Fisher-Yates shuffle for the first 'cardsToCome' cards
        const tempDeck = [...deck];
        for (let k = 0; k < cardsToCome; k++) {
          const r = k + Math.floor(Math.random() * (tempDeck.length - k));
          const t = tempDeck[k];
          tempDeck[k] = tempDeck[r];
          tempDeck[r] = t;
        }
        const runout = tempDeck.slice(0, cardsToCome);

        evaluateShowdown(currentHands, runout);
      }
    }
    // SCENARIO B: FLOP (2 cards to come) - Exact Enumeration (only if all fixed hands)
    else if (cardsToCome === 2 && !hasRangePlayer) {
      // All players have fixed hands - use exact enumeration like original
      const deck = FULL_DECK.filter((c) => !fixedDeadCards.has(c));
      totalCount = (deck.length * (deck.length - 1)) / 2;
      const currentHands = [];
      for (let i = 0; i < numPlayers; i++) {
        currentHands.push(playerCombos[i][0]);
      }
      for (let i = 0; i < deck.length; i++) {
        for (let j = i + 1; j < deck.length; j++) {
          evaluateShowdown(currentHands, [deck[i], deck[j]]);
        }
      }
    }
    // SCENARIO C: TURN (1 card to come) - Exact Enumeration
    else if (cardsToCome === 1) {
      // Iterate through all valid range combinations × remaining deck cards
      const iteratePlayersTurn = (pIdx, currentHands, currentDead) => {
        if (pIdx === numPlayers) {
          // All players set. Now iterate remaining deck.
          const finalDeck = FULL_DECK.filter((c) => !currentDead.has(c));
          for (const card of finalDeck) {
            totalCount++;
            evaluateShowdown(currentHands, [card]);
          }
          return;
        }

        if (!isRangePlayer[pIdx]) {
          // Fixed player
          const nextDead = new Set(currentDead);
          playerCombos[pIdx][0].forEach((c) => nextDead.add(c));
          iteratePlayersTurn(
            pIdx + 1,
            [...currentHands, playerCombos[pIdx][0]],
            nextDead
          );
        } else {
          // Range player: Iterate ALL valid combos
          for (const combo of playerCombos[pIdx]) {
            if (!currentDead.has(combo[0]) && !currentDead.has(combo[1])) {
              const nextDead = new Set(currentDead);
              nextDead.add(combo[0]);
              nextDead.add(combo[1]);
              iteratePlayersTurn(pIdx + 1, [...currentHands, combo], nextDead);
            }
          }
        }
      };

      iteratePlayersTurn(0, [], fixedDeadCards);
    }
    // SCENARIO D: RIVER (0 cards to come) - Exact Enumeration
    else {
      // cardsToCome === 0
      // Iterate through all valid range combinations
      const iteratePlayers = (pIdx, currentHands, currentDead) => {
        if (pIdx === numPlayers) {
          totalCount++;
          evaluateShowdown(currentHands, []);
          return;
        }

        if (!isRangePlayer[pIdx]) {
          // Fixed player
          const nextDead = new Set(currentDead);
          playerCombos[pIdx][0].forEach((c) => nextDead.add(c));
          iteratePlayers(
            pIdx + 1,
            [...currentHands, playerCombos[pIdx][0]],
            nextDead
          );
        } else {
          // Range player: Iterate ALL valid combos
          for (const combo of playerCombos[pIdx]) {
            if (!currentDead.has(combo[0]) && !currentDead.has(combo[1])) {
              const nextDead = new Set(currentDead);
              nextDead.add(combo[0]);
              nextDead.add(combo[1]);
              iteratePlayers(pIdx + 1, [...currentHands, combo], nextDead);
            }
          }
        }
      };

      iteratePlayers(0, [], fixedDeadCards);
    }

    // 6. Calculate Percentages
    const equities = [];
    for (let i = 0; i < numPlayers; i++) {
      equities.push((wins[i] / (totalCount || 1)) * 100);
    }

    return { equities, iterations: totalCount };
  } catch (error) {
    // Hard safety net: never throw from equity calculation
    return safeFail(numPlayers);
  }
}
