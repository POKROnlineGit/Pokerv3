/**
 * Bot Strategies - Decision-making functions for different bot personalities
 * Works with GameEngine context
 */

import { evaluateHand } from "../services/ShowdownService.js";

/**
 * Normalize amount to ensure it's a whole number (integer)
 * @param {number} amount - Amount to normalize
 * @returns {number} Whole number amount
 */
function normalizeAmount(amount) {
  return Math.floor(Math.max(0, amount));
}

/**
 * Make decision for a bot player
 * @param {GameContext} ctx - Current game context
 * @param {Player} player - Bot player
 * @param {Object} botProfile - Bot profile with strategy
 * @returns {Action} Action object
 */
export function makeDecision(ctx, player, botProfile) {
  const strategy = botProfile?.strategy || "balanced";

  // Evaluate hand strength
  const handStrength = evaluateHandStrength(
    player.holeCards || [],
    ctx.communityCards || []
  );

  // Get current bet and amount to call
  const currentBet = Math.max(...ctx.players.map((p) => p.currentBet), 0);
  const toCall = currentBet - player.currentBet;

  // CRITICAL: Handle all-in scenarios
  // If toCall >= player.chips, bot can only call (all-in) or fold
  // Cannot raise if they can't cover the minimum raise
  const canAffordToCall = toCall <= player.chips;
  const canAffordToRaise = (() => {
    if (toCall === 0) return true; // Can bet if no bet to call
    if (toCall >= player.chips) return false; // Can't raise if all-in to call
    const minRaise = Math.max(ctx.bigBlind, currentBet * 2 - player.currentBet);
    const minRaiseAmount = minRaise - player.currentBet;
    const totalNeededForRaise = toCall + minRaiseAmount;
    return totalNeededForRaise <= player.chips;
  })();

  // Route to strategy function
  let action;
  switch (strategy) {
    case "aggressive":
      action = aggressiveStrategy(
        handStrength,
        toCall,
        player,
        ctx,
        canAffordToRaise
      );
      break;
    case "tight":
      action = tightStrategy(
        handStrength,
        toCall,
        player,
        ctx,
        canAffordToRaise
      );
      break;
    case "loose":
      action = looseStrategy(
        handStrength,
        toCall,
        player,
        ctx,
        canAffordToRaise
      );
      break;
    case "calling":
      action = callingStrategy(
        handStrength,
        toCall,
        player,
        ctx,
        canAffordToRaise
      );
      break;
    case "random":
      action = randomStrategy(
        handStrength,
        toCall,
        player,
        ctx,
        canAffordToRaise
      );
      break;
    default:
      action = balancedStrategy(
        handStrength,
        toCall,
        player,
        ctx,
        canAffordToRaise
      );
  }

  // CRITICAL: Validate and fix action for all-in scenarios
  if (!canAffordToCall) {
    // Bot doesn't have enough chips to call - should have folded or this is an error
    // Fallback: fold
    action = { type: "fold", seat: player.seat };
  } else if (action.type === "raise" && !canAffordToRaise) {
    // Bot tried to raise but can't afford it - convert to call (all-in) or fold
    // More aggressive: call all-in with weaker hands (lower threshold)
    if (handStrength > 0.15) {
      action = { type: "call", seat: player.seat };
    } else {
      action = { type: "fold", seat: player.seat };
    }
  }

  // CRITICAL: Ensure amount is always a whole number
  if (action.amount !== undefined && action.amount !== null) {
    action.amount = normalizeAmount(action.amount);
    // Ensure bet/raise amounts meet minimum requirements
    if (action.type === "bet" && action.amount < ctx.bigBlind) {
      action.amount = ctx.bigBlind;
    } else if (action.type === "raise") {
      const minRaise = Math.max(
        ctx.bigBlind,
        currentBet * 2 - player.currentBet
      );
      const minRaiseAmount = minRaise - player.currentBet;
      if (action.amount < minRaiseAmount) {
        // Can't afford minimum raise - convert to call or fold
        // More aggressive: call with weaker hands (lower threshold)
        if (canAffordToCall && handStrength > 0.15) {
          action = { type: "call", seat: player.seat };
        } else {
          action = { type: "fold", seat: player.seat };
        }
      }
    }
  }

  return action;
}

/**
 * Evaluate hand strength (0-1 scale)
 * Uses ShowdownService for accurate evaluation
 * Includes preflop-specific logic for better starting hand evaluation
 */
function evaluateHandStrength(holeCards, communityCards) {
  if (!holeCards || holeCards.length < 2) return 0;

  // Preflop evaluation (no community cards)
  if (!communityCards || communityCards.length === 0) {
    return evaluatePreflopStrength(holeCards);
  }

  // Post-flop evaluation (use ShowdownService)
  const evaluation = evaluateHand(holeCards, communityCards);
  if (!evaluation) return 0;

  // Map hand types to 0-1 scale
  // Custom calculator returns type as string (e.g., "Royal Flush", "Pair")
  // Higher rank = better hand in custom calculator (1-7462)
  const typeToStrength = {
    "Royal Flush": 1.0,
    "Straight Flush": 0.98,
    "Four of a Kind": 0.95,
    "Full House": 0.9,
    Flush: 0.75,
    Straight: 0.65,
    "Set": 0.5,
    "Two Pair": 0.35,
    Pair: 0.2,
    "High Card": 0.1,
  };

  // Use type if available, otherwise fall back to rank-based mapping
  if (evaluation.type && typeToStrength.hasOwnProperty(evaluation.type)) {
    return typeToStrength[evaluation.type];
  }

  // Fallback: Map rank to strength (custom calculator: 1-7462, higher is better)
  // Normalize rank to 0-1 scale
  const normalizedRank = Math.min(
    1.0,
    Math.max(0.0, (evaluation.rank - 1) / 7461)
  );
  // Invert so higher rank = higher strength (already correct, but ensure it's in 0.1-1.0 range)
  return Math.max(0.1, Math.min(1.0, 0.1 + normalizedRank * 0.9));
}

/**
 * Evaluate preflop hand strength (0-1 scale)
 * Based on starting hand rankings
 */
function evaluatePreflopStrength(holeCards) {
  if (!holeCards || holeCards.length !== 2) return 0;

  const [card1, card2] = holeCards;

  // Get numeric values (handle both value property and rank string)
  const getValue = (card) => {
    if (card.value) return card.value;
    // Convert rank string to value
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
    return rankMap[card.rank] || 2;
  };

  const rank1 = getValue(card1);
  const rank2 = getValue(card2);
  const suit1 = card1.suit;
  const suit2 = card2.suit;
  const isPair = rank1 === rank2;
  const isSuited = suit1 === suit2;
  const highCard = Math.max(rank1, rank2);
  const lowCard = Math.min(rank1, rank2);

  // Premium pairs (AA, KK, QQ, JJ)
  if (isPair && highCard >= 11) {
    return 0.85 + (highCard - 11) * 0.03; // 0.85-0.97
  }

  // Medium pairs (TT, 99, 88, 77)
  if (isPair && highCard >= 7) {
    return 0.6 + (highCard - 7) * 0.05; // 0.6-0.75
  }

  // Small pairs (66, 55, 44, 33, 22)
  if (isPair) {
    return 0.4 + (highCard - 2) * 0.05; // 0.4-0.6
  }

  // Premium high cards (AK, AQ, AJ, KQ)
  if (highCard === 14 && lowCard >= 11) {
    return isSuited ? 0.7 : 0.65; // AKs/AKo, AQs/AQo, AJs/AJo
  }
  if (highCard === 13 && lowCard === 12) {
    return isSuited ? 0.65 : 0.6; // KQs/KQo
  }

  // Strong high cards (AT, KJ, QJ, KT)
  if (highCard === 14 && lowCard === 10) {
    return isSuited ? 0.55 : 0.5; // ATs/ATo
  }
  if (
    (highCard === 13 && lowCard === 11) ||
    (highCard === 12 && lowCard === 11)
  ) {
    return isSuited ? 0.5 : 0.45; // KJs/KJo, QJs/QJo
  }
  if (highCard === 13 && lowCard === 10) {
    return isSuited ? 0.45 : 0.4; // KTs/KTo
  }

  // Medium hands (A9-A2, K9-K2, Q9-Q2, J9-JT, T9)
  if (highCard === 14) {
    return isSuited ? 0.35 + (lowCard - 2) * 0.01 : 0.3 + (lowCard - 2) * 0.01; // A9s-A2s: 0.42-0.35, A9o-A2o: 0.37-0.3
  }
  if (highCard === 13 && lowCard >= 9) {
    return isSuited ? 0.35 : 0.3; // K9s/K9o
  }
  if (highCard === 12 && lowCard >= 9) {
    return isSuited ? 0.3 : 0.25; // Q9s/Q9o
  }
  if (highCard === 11 && lowCard === 10) {
    return isSuited ? 0.3 : 0.25; // JTs/JTo
  }
  if (highCard === 10 && lowCard === 9) {
    return isSuited ? 0.25 : 0.2; // T9s/T9o
  }

  // Weak hands
  return 0.1 + (highCard - 2) * 0.01; // 0.1-0.2
}

/**
 * Aggressive strategy - bets/raises more often, rarely folds
 */
function aggressiveStrategy(
  handStrength,
  toCall,
  player,
  ctx,
  canAffordToRaise = true
) {
  if (toCall === 0) {
    // More aggressive: bet with weaker hands
    if (handStrength > 0.2) {
      return {
        type: "bet",
        seat: player.seat,
        amount: Math.min(ctx.bigBlind * 3, Math.floor(player.chips * 0.3)),
      };
    }
    return { type: "check", seat: player.seat };
  }

  // More aggressive: lower thresholds for raises and calls
  if (handStrength > 0.5 && canAffordToRaise) {
    return {
      type: "raise",
      seat: player.seat,
      amount: Math.min(toCall * 2, Math.floor(player.chips * 0.4)),
    };
  }
  // Call with much weaker hands, only fold very weak hands
  if (handStrength > 0.15) {
    return { type: "call", seat: player.seat };
  }
  return { type: "fold", seat: player.seat };
}

/**
 * Tight strategy - only plays strong hands, but less likely to fold when committed
 */
function tightStrategy(
  handStrength,
  toCall,
  player,
  ctx,
  canAffordToRaise = true
) {
  if (toCall === 0) {
    // Slightly more aggressive: bet with slightly weaker hands
    if (handStrength > 0.55) {
      return {
        type: "bet",
        seat: player.seat,
        amount: Math.min(ctx.bigBlind * 2, Math.floor(player.chips * 0.2)),
      };
    }
    return { type: "check", seat: player.seat };
  }

  // Tight but less fold-happy: raise with very strong hands
  if (handStrength > 0.8 && canAffordToRaise) {
    return {
      type: "raise",
      seat: player.seat,
      amount: Math.floor(
        Math.min(toCall * 1.5, Math.floor(player.chips * 0.25))
      ),
    };
  }
  // Call with decent hands, only fold weak hands
  if (handStrength > 0.5) {
    return { type: "call", seat: player.seat };
  }
  return { type: "fold", seat: player.seat };
}

/**
 * Loose strategy - plays more hands, very rarely folds
 */
function looseStrategy(
  handStrength,
  toCall,
  player,
  ctx,
  canAffordToRaise = true
) {
  if (toCall === 0) {
    // Very loose: bet with very weak hands
    if (handStrength > 0.15) {
      return {
        type: "bet",
        seat: player.seat,
        amount: Math.min(ctx.bigBlind * 2, Math.floor(player.chips * 0.25)),
      };
    }
    return { type: "check", seat: player.seat };
  }

  // Loose: raise with decent hands, call with very weak hands
  if (handStrength > 0.45 && canAffordToRaise) {
    return {
      type: "raise",
      seat: player.seat,
      amount: Math.floor(
        Math.min(toCall * 1.5, Math.floor(player.chips * 0.3))
      ),
    };
  }
  // Call with almost any hand, only fold the absolute worst
  if (handStrength > 0.1) {
    return { type: "call", seat: player.seat };
  }
  return { type: "fold", seat: player.seat };
}

/**
 * Calling station - calls often, rarely raises, almost never folds
 */
function callingStrategy(
  handStrength,
  toCall,
  player,
  ctx,
  canAffordToRaise = true
) {
  if (toCall === 0) {
    return { type: "check", seat: player.seat };
  }

  // Calling station: call with almost any hand, only fold the absolute worst
  if (handStrength > 0.1) {
    return { type: "call", seat: player.seat };
  }
  // Only fold if hand is extremely weak
  return { type: "fold", seat: player.seat };
}

/**
 * Random strategy - unpredictable but more aggressive
 */
function randomStrategy(
  handStrength,
  toCall,
  player,
  ctx,
  canAffordToRaise = true
) {
  const rand = Math.random();
  if (toCall === 0) {
    // More likely to bet
    if (rand > 0.4) {
      return { type: "check", seat: player.seat };
    }
    return {
      type: "bet",
      seat: player.seat,
      amount: Math.floor(
        Math.min(
          ctx.bigBlind * (1 + Math.random() * 2),
          Math.floor(player.chips * 0.3)
        )
      ),
    };
  }

  // More aggressive random: more likely to call or raise, less likely to fold
  if (rand > 0.5) {
    return { type: "call", seat: player.seat };
  }
  if (rand > 0.2 && handStrength > 0.2 && canAffordToRaise) {
    return {
      type: "raise",
      seat: player.seat,
      amount: Math.floor(
        Math.min(toCall * (1 + Math.random()), Math.floor(player.chips * 0.3))
      ),
    };
  }
  // Only fold if hand is very weak AND random chance is low
  if (handStrength < 0.15 && rand < 0.2) {
    return { type: "fold", seat: player.seat };
  }
  // Default to call if we get here
  return { type: "call", seat: player.seat };
}

/**
 * Balanced strategy - default, more aggressive than before
 */
function balancedStrategy(
  handStrength,
  toCall,
  player,
  ctx,
  canAffordToRaise = true
) {
  if (toCall === 0) {
    // More aggressive: bet with weaker hands
    if (handStrength > 0.4) {
      return {
        type: "bet",
        seat: player.seat,
        amount: Math.floor(
          Math.min(ctx.bigBlind * 2.5, Math.floor(player.chips * 0.25))
        ),
      };
    }
    return { type: "check", seat: player.seat };
  }

  // More aggressive: lower thresholds for raises and calls
  if (handStrength > 0.65 && canAffordToRaise) {
    return {
      type: "raise",
      seat: player.seat,
      amount: Math.floor(
        Math.min(toCall * 1.5, Math.floor(player.chips * 0.3))
      ),
    };
  }
  // Call with weaker hands, only fold very weak hands
  if (handStrength > 0.25) {
    return { type: "call", seat: player.seat };
  }
  return { type: "fold", seat: player.seat };
}
