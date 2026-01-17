import { variantRegistry } from "../config/VariantRegistry.js";
import { Logger } from "../../../shared/utils/Logger.js";

export const MatchMakingService = {
  /**
   * Check if a game can be started from the queue
   * @param {string} queueType - The queue variant slug
   * @param {Array} queueSnapshot - Array of queued players
   * @returns {Object|null} Match result or null
   */
  canStartGame(queueType, queueSnapshot) {
    const variant = variantRegistry.getVariant(queueType);
    if (!variant) {
      // Logger.warn(`[MatchMaking] Unknown variant: ${queueType}`);
      return null;
    }

    // Determine requirements
    // All games wait for full table (maxPlayers) before starting
    const maxPlayers = variant.max_players;
    const minPlayers = maxPlayers;

    const count = queueSnapshot.length;

    if (count >= minPlayers) {
      // Take up to maxPlayers
      const playersToMatch = queueSnapshot.slice(0, maxPlayers);
      
      return {
        canStart: true,
        playerIds: playersToMatch.map(p => p.user_id),
        queueType
      };
    }

    return null;
  },

  /**
   * Get status of a queue (needed/total)
   * @param {string} queueType
   * @param {Array} queueSnapshot
   */
  getQueueStatus(queueType, queueSnapshot) {
    const variant = variantRegistry.getVariant(queueType);
    if (!variant) return null;

    // All games wait for full table (maxPlayers) before starting
    const minPlayers = variant.max_players;
      
    const count = queueSnapshot.length;
    const needed = Math.max(0, minPlayers - count);
    
    return {
      count,
      needed,
      target: minPlayers
    };
  }
};
