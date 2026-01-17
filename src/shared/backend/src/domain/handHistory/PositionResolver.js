/**
 * PositionResolver - Maps physical seat numbers to logical poker positions
 * 
 * Handles both heads-up (2 players) and ring games (3+ players)
 */

/**
 * Resolves seat positions for a poker hand
 * 
 * @param {number[]} activeSeats - Array of active seat indices (0-based manifest indices)
 * @param {number} buttonSeat - Button seat index (0-based manifest index)
 * @returns {Record<number, string>} Map of seat index -> position label
 * @throws {Error} If inputs are invalid
 */
export class PositionResolver {
  static resolve(activeSeats, buttonSeat) {
    if (!Array.isArray(activeSeats) || activeSeats.length < 2) {
      throw new Error(`Invalid activeSeats: must be array with at least 2 seats, got ${activeSeats}`);
    }

    if (typeof buttonSeat !== "number" || buttonSeat < 0) {
      throw new Error(`Invalid buttonSeat: must be non-negative number, got ${buttonSeat}`);
    }

    if (!activeSeats.includes(buttonSeat)) {
      throw new Error(`buttonSeat ${buttonSeat} not in activeSeats ${activeSeats.join(", ")}`);
    }

    const result = {};
    const playerCount = activeSeats.length;

    // Heads-up rule (2 players): Button is SB, other is BB
    if (playerCount === 2) {
      for (const seat of activeSeats) {
        if (seat === buttonSeat) {
          result[seat] = "SB";
        } else {
          result[seat] = "BB";
        }
      }
      return result;
    }

    // Ring game rule (3+ players): Rotate so button is index 0
    // Find button position in activeSeats array
    const buttonIndex = activeSeats.indexOf(buttonSeat);
    if (buttonIndex === -1) {
      throw new Error(`Button seat ${buttonSeat} not found in activeSeats`);
    }

    // Rotate activeSeats so button is first
    const rotatedSeats = [];
    for (let i = 0; i < playerCount; i++) {
      const index = (buttonIndex + i) % playerCount;
      rotatedSeats.push(activeSeats[index]);
    }

    // Position labels for ring games
    // Standard 10-max positions (from button): BTN, SB, BB, UTG, UTG+1, UTG+2, MP, MP+1, LJ, HJ, CO
    // Note: CO (Cutoff) is the position right before the button
    // In our rotation, button is first, so CO appears as the last position
    const positions = ["BTN", "SB", "BB"];

    // Add UTG positions based on player count
    if (playerCount >= 4) {
      positions.push("UTG");
    }
    if (playerCount >= 5) {
      positions.push("UTG+1");
    }
    if (playerCount >= 6) {
      positions.push("UTG+2");
    }
    if (playerCount >= 7) {
      positions.push("MP");
    }
    if (playerCount >= 8) {
      positions.push("MP+1");
    }
    if (playerCount >= 9) {
      positions.push("LJ"); // Lojack
    }
    if (playerCount >= 10) {
      positions.push("HJ"); // Hijack
    }
    // CO (Cutoff) is the position right before the button
    // For 10-max, we use CO instead of HJ as the last position
    // Standard 10-max positions: BTN, SB, BB, UTG, UTG+1, UTG+2, MP, MP+1, LJ, CO
    if (playerCount === 10) {
      // Replace HJ with CO for 10-max (CO is the position right before button)
      positions[positions.length - 1] = "CO";
    }

    // Map rotated seats to positions
    for (let i = 0; i < rotatedSeats.length; i++) {
      const seat = rotatedSeats[i];
      result[seat] = positions[i] || `UNKNOWN_${i}`;
    }

    return result;
  }
}
