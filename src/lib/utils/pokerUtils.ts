// Simple poker utility functions extracted from legacy engine
// Used only for UI display (debug overlay, etc.)

export type Card = `${Rank}${Suit}`;
export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "T"
  | "J"
  | "Q"
  | "K"
  | "A";
export type Suit = "h" | "d" | "c" | "s";

interface PlayerForUtils {
  seat: number;
  folded: boolean;
  allIn: boolean;
  chips: number;
}

/**
 * Get next seat clockwise (1→2→3→4→5→6→1)
 */
const nextSeat = (seat: number): number => (seat % 6) + 1;

/**
 * Find next active player clockwise from a given seat
 * Active = not folded, not all-in, has chips
 * Returns null if no active player found
 */
export const getNextActivePlayer = (
  fromSeat: number,
  players: PlayerForUtils[]
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

