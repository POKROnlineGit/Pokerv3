import { GameContext, Action, ActionValidation, ActionType } from "../core/types";
import { getNextActivePlayer, getNextEligiblePlayer } from "./seatUtils";

/**
 * Get the current maximum bet in this round
 */
export function getCurrentBet(ctx: GameContext): number {
  return Math.max(...ctx.players.map((p) => p.currentBet), 0);
}

/**
 * Validate an action before executing
 */
export function validateAction(
  ctx: GameContext,
  seat: number,
  action: ActionType,
  amount?: number
): ActionValidation {
  if (ctx.currentActorSeat !== seat) {
    return { valid: false, error: "Not your turn" };
  }

  const player = ctx.players.find((p) => p.seat === seat);
  if (!player || player.folded || player.allIn) {
    return { valid: false, error: "Player cannot act" };
  }

  const currentBet = getCurrentBet(ctx);
  const toCall = currentBet - player.currentBet;

  switch (action) {
    case "fold":
      if (player.allIn) {
        return { valid: false, error: "Cannot fold when all-in" };
      }
      return { valid: true };

    case "check":
      if (toCall > 0) {
        return { valid: false, error: "Cannot check, must call or fold" };
      }
      return { valid: true };

    case "call":
      if (toCall === 0) {
        return { valid: false, error: "Can check instead of calling" };
      }
      if (toCall > player.chips) {
        return { valid: false, error: "Not enough chips to call" };
      }
      return { valid: true };

    case "bet":
      if (toCall > 0) {
        return { valid: false, error: "Cannot bet, must call or fold" };
      }
      // Cannot bet again if you're the last aggressor AND still active
      if (ctx.lastAggressorSeat === seat) {
        const lastAggressor = ctx.players.find(
          (p) => p.seat === ctx.lastAggressorSeat
        );
        // Only block if the last aggressor is still active (not folded, not all-in)
        if (lastAggressor && !lastAggressor.folded && !lastAggressor.allIn) {
          return {
            valid: false,
            error: "Cannot bet again, you already bet. You can only check.",
          };
        }
        // If last aggressor is folded/all-in, they're no longer the blocker
      }
      if (!amount || amount < ctx.minRaise) {
        return {
          valid: false,
          error: `Bet must be at least ${ctx.minRaise}`,
          minAmount: ctx.minRaise,
        };
      }
      if (amount > player.chips) {
        return {
          valid: false,
          error: "Not enough chips",
          maxAmount: player.chips,
        };
      }
      return { valid: true, minAmount: ctx.minRaise, maxAmount: player.chips };

    case "raise":
      if (toCall === 0) {
        return { valid: false, error: "Cannot raise, must bet first" };
      }
      // Cannot raise again if you're the last aggressor AND still active
      if (ctx.lastAggressorSeat === seat) {
        const lastAggressor = ctx.players.find(
          (p) => p.seat === ctx.lastAggressorSeat
        );
        // Only block if the last aggressor is still active (not folded, not all-in)
        if (lastAggressor && !lastAggressor.folded && !lastAggressor.allIn) {
          return {
            valid: false,
            error:
              "Cannot raise again, you already raised. You can only call or fold.",
          };
        }
        // If last aggressor is folded/all-in, they're no longer the blocker
      }
      if (!amount) {
        return { valid: false, error: "Raise amount required" };
      }
      const totalNeeded = toCall + amount;
      if (totalNeeded > player.chips) {
        return { valid: false, error: "Not enough chips" };
      }
      if (amount < ctx.minRaise) {
        return {
          valid: false,
          error: `Raise must be at least ${ctx.minRaise} more`,
          minAmount: ctx.minRaise,
        };
      }
      return {
        valid: true,
        minAmount: ctx.minRaise,
        maxAmount: player.chips - toCall,
      };

    case "allin":
      if (player.chips === 0) {
        return { valid: false, error: "Already all-in" };
      }
      return { valid: true };

    default:
      return { valid: false, error: "Invalid action" };
  }
}

/**
 * Apply a validated action to the game context
 */
export function applyAction(ctx: GameContext, action: Action): GameContext {
  const validation = validateAction(
    ctx,
    action.seat,
    action.type,
    action.amount
  );
  if (!validation.valid) {
    throw new Error(validation.error || "Invalid action");
  }

  const player = ctx.players.find((p) => p.seat === action.seat)!;
  const currentBet = getCurrentBet(ctx);
  const toCall = currentBet - player.currentBet;

  let newPlayers = [...ctx.players];
  let newPots = [...ctx.pots];
  let newMinRaise = ctx.minRaise;
  let newLastAggressorSeat = ctx.lastAggressorSeat;
  let potIncrease = 0;

  const playerIndex = newPlayers.findIndex((p) => p.seat === action.seat);
  let updatedPlayer = { ...newPlayers[playerIndex] };

  let wasRaise = false; // Track if this action was a raise/bet

  switch (action.type) {
    case "fold":
      updatedPlayer.folded = true;
      updatedPlayer.eligibleToBet = false; // Folded players are not eligible
      // If the last aggressor folds, clear lastAggressorSeat
      if (newLastAggressorSeat === action.seat) {
        newLastAggressorSeat = null;
      }
      break;

    case "check":
      // No chips moved, but player is no longer eligible
      updatedPlayer.eligibleToBet = false;
      break;

    case "call":
      const callAmount = Math.min(toCall, updatedPlayer.chips);
      updatedPlayer.chips -= callAmount;
      updatedPlayer.currentBet += callAmount;
      updatedPlayer.totalBet += callAmount;
      potIncrease = callAmount;
      updatedPlayer.eligibleToBet = false; // Called, no longer eligible
      if (updatedPlayer.chips === 0) {
        updatedPlayer.allIn = true;
        updatedPlayer.eligibleToBet = false; // All-in players are never eligible
      }
      break;

    case "bet":
      if (!action.amount) throw new Error("Bet amount required");
      updatedPlayer.chips -= action.amount;
      updatedPlayer.currentBet = action.amount;
      updatedPlayer.totalBet += action.amount;
      potIncrease = action.amount;
      newMinRaise = Math.max(newMinRaise, action.amount);
      newLastAggressorSeat = action.seat;
      wasRaise = true; // Bet is a raise action
      updatedPlayer.eligibleToBet = false; // This player acted, but others become eligible
      if (updatedPlayer.chips === 0) {
        updatedPlayer.allIn = true;
        updatedPlayer.eligibleToBet = false;
      }
      break;

    case "raise":
      if (!action.amount) throw new Error("Raise amount required");
      const totalRaiseAmount = toCall + action.amount;
      updatedPlayer.chips -= totalRaiseAmount;
      updatedPlayer.currentBet = currentBet + action.amount;
      updatedPlayer.totalBet += totalRaiseAmount;
      potIncrease = totalRaiseAmount;
      newMinRaise = Math.max(newMinRaise, action.amount * 2);
      newLastAggressorSeat = action.seat;
      wasRaise = true; // Raise makes others eligible
      updatedPlayer.eligibleToBet = false; // This player acted, but others become eligible
      if (updatedPlayer.chips === 0) {
        updatedPlayer.allIn = true;
        updatedPlayer.eligibleToBet = false;
      }
      break;

    case "allin":
      const allInAmount = updatedPlayer.chips;
      updatedPlayer.chips = 0;
      updatedPlayer.currentBet += allInAmount;
      updatedPlayer.totalBet += allInAmount;
      potIncrease = allInAmount;
      updatedPlayer.allIn = true;
      updatedPlayer.eligibleToBet = false; // All-in players are never eligible
      if (updatedPlayer.currentBet > currentBet) {
        newLastAggressorSeat = action.seat;
        newMinRaise = Math.max(
          newMinRaise,
          updatedPlayer.currentBet - currentBet
        );
        wasRaise = true; // All-in that raises makes others eligible
      }
      break;
  }

  newPlayers[playerIndex] = updatedPlayer;

  // If this was a raise/bet, make all non-folded, non-all-in players eligible again
  // EXCEPT the player who just raised (they can't raise again until someone else raises)
  if (wasRaise) {
    newPlayers = newPlayers.map((p) => {
      if (p.folded || p.allIn) {
        return p; // Keep folded/all-in players as not eligible
      }
      // Don't make the raiser eligible again - they must wait for someone else to act
      if (p.seat === action.seat) {
        return p; // Keep the raiser as not eligible
      }
      return { ...p, eligibleToBet: true };
    });
  }

  // Update pot - add to main pot
  if (potIncrease > 0) {
    if (newPots.length === 0) {
      newPots = [
        {
          amount: potIncrease,
          eligiblePlayers: ctx.players
            .filter((p) => !p.folded && p.chips > 0)
            .map((p) => p.id),
        },
      ];
    } else {
      newPots = newPots.map((pot, index) =>
        index === 0 ? { ...pot, amount: pot.amount + potIncrease } : pot
      );
    }
  }

  // Determine next eligible actor
  const nextActor = getNextEligiblePlayer(action.seat, newPlayers);

  return {
    ...ctx,
    players: newPlayers,
    pots: newPots,
    minRaise: newMinRaise,
    lastAggressorSeat: newLastAggressorSeat,
    currentActorSeat: nextActor,
  };
}

/**
 * Check if betting round is complete
 * A betting round ends when no players are eligible to bet
 */
export function isBettingRoundComplete(ctx: GameContext): boolean {
  if (ctx.currentActorSeat === null) return true;

  const activePlayers = ctx.players.filter((p) => !p.folded && p.chips > 0);
  if (activePlayers.length <= 1) return true;

  // Check if there are any eligible players
  const eligiblePlayers = ctx.players.filter(
    (p) => !p.folded && !p.allIn && p.chips > 0 && p.eligibleToBet
  );

  // Round is complete when no one is eligible to bet
  return eligiblePlayers.length === 0;
}
