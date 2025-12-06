import { Player } from "../core/types";

/**
 * IMMUTABLE SEAT UTILITIES
 *
 * All seat calculations MUST use these functions - no raw math allowed elsewhere.
 * Seats are numbered 1-6, clockwise around the table.
 */

/**
 * Get next seat clockwise (1→2→3→4→5→6→1)
 */
export const nextSeat = (seat: number): number => (seat % 6) + 1;

/**
 * Get previous seat counter-clockwise (1→6→5→4→3→2→1)
 */
export const prevSeat = (seat: number): number => (seat === 1 ? 6 : seat - 1);

/**
 * Find next active player clockwise from a given seat
 * Active = not folded, not all-in, has chips
 * Returns null if no active player found
 */
export const getNextActivePlayer = (
  fromSeat: number,
  players: Player[]
): number | null => {
  let seat = nextSeat(fromSeat);
  let safety = 0;

  while (safety < 8) {
    const player = players.find((p) => p.seat === seat);
    if (player && !player.folded && !player.allIn && player.chips > 0) {
      return seat;
    }
    seat = nextSeat(seat);
    safety++;
  }

  return null;
};

/**
 * Find next eligible player clockwise from a given seat
 * Eligible = not folded, not all-in, has chips, AND eligibleToBet is true
 * Returns null if no eligible player found
 */
export const getNextEligiblePlayer = (
  fromSeat: number,
  players: Player[]
): number | null => {
  let seat = nextSeat(fromSeat);
  let safety = 0;

  while (safety < 8) {
    const player = players.find((p) => p.seat === seat);
    if (
      player &&
      !player.folded &&
      !player.allIn &&
      player.chips > 0 &&
      player.eligibleToBet
    ) {
      return seat;
    }
    seat = nextSeat(seat);
    safety++;
  }

  return null;
};

/**
 * Get all active players in clockwise order starting from a given seat
 */
export const getActivePlayersInOrder = (
  startSeat: number,
  players: Player[]
): Player[] => {
  const ordered: Player[] = [];
  let seat = startSeat;

  for (let i = 0; i < 6; i++) {
    const player = players.find((p) => p.seat === seat);
    if (player && !player.folded && player.chips > 0) {
      ordered.push(player);
    }
    seat = nextSeat(seat);
  }

  return ordered;
};
