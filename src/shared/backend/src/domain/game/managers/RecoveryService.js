/**
 * RecoveryService - Loads active games on server startup
 * Recreates GameEngine instances from database
 */

import { supabaseAdmin } from "../../../infrastructure/database/supabaseClient.js";
import { variantRegistry } from "../config/VariantRegistry.js";
import { EngineFactory } from "../engine/EngineFactory.js";
import { Logger } from "../../../shared/utils/Logger.js";

/**
f * Recover all active/starting/waiting games from database
 * Called once at server startup
 * @returns {Promise<Array>} Array of {gameId, game} objects
 */
export async function recoverActiveGames() {
  try {
    const { data: games, error } = await supabaseAdmin
      .from("games")
      .select("*")
      .in("status", ["waiting", "starting", "active"]);

    if (error) {
      Logger.error("Error loading active games:", error);
      return [];
    }

    if (!games || games.length === 0) {
      return [];
    }

    const recoveredGames = [];

    for (const gameData of games) {
      try {
        // 1. Resolve Variant from Registry
        const variantSlug = gameData.game_type || gameData.type || "six_max";
        const variant = variantRegistry.getVariant(variantSlug);

        if (!variant) {
          Logger.warn(
            `[RecoveryService] Unknown variant '${variantSlug}' for game ${gameData.id}. Skipping recovery.`
          );
          continue;
        }

        // 2. Load state from database
        const state = gameData.state;

        // 3. Use EngineFactory to create engine (consistent with rest of codebase)
        const engine = EngineFactory.create(gameData.id, variant, state);

        // CRUCIAL: Ensure revealedIndices is initialized for each player
        if (engine.context?.players) {
          engine.context.players.forEach((p) => {
            if (!p.revealedIndices) {
              p.revealedIndices = [];
            }
          });
        }

        recoveredGames.push({ gameId: gameData.id, game: engine });
      } catch (error) {
        Logger.error(`Error recovering game ${gameData.id}:`, error);
      }
    }

    if (recoveredGames.length > 0) {
      Logger.info(`Recovered ${recoveredGames.length} game(s) from database`);
    }

    return recoveredGames;
  } catch (error) {
    Logger.error("Error in recoverActiveGames:", error);
    return [];
  }
}
