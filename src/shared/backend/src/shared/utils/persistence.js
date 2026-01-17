import { supabaseAdmin } from "../../infrastructure/database/supabaseClient.js";
import redisClient from "../../infrastructure/cache/redisClient.js";
import { Logger } from "./Logger.js";

/**
 * Persist game state to Supabase and Redis
 */
export async function persistState(gameId, state) {
  try {
    const updateData = {
      state,
      status: state.status,
    };

    // Log when status is being set to finished
    if (state.status === "finished") {
      Logger.info(
        `[persistState] persisting finished game game=${gameId} status=${
          state.status
        } message=${state.message || "none"}`
      );
    }

    const { error } = await supabaseAdmin
      .from("games")
      .update(updateData)
      .eq("id", gameId);

    if (error) {
      Logger.error(`Error persisting state for game ${gameId}:`, error);
      throw error;
    }

    if (state.status === "finished") {
      Logger.info(
        `[persistState] successfully persisted finished game game=${gameId} status=${state.status}`
      );
    }

    // Cache in Redis if available
    if (redisClient) {
      try {
        await redisClient.setEx(`game:${gameId}`, 3600, JSON.stringify(state));
      } catch (redisError) {
        Logger.warn(
          `Redis cache failed for game ${gameId}:`,
          redisError.message
        );
      }
    }
  } catch (error) {
    Logger.error(`Error in persistState for game ${gameId}:`, error);
    throw error;
  }
}

/**
 * Load game state from Supabase or Redis cache
 */
export async function loadState(gameId) {
  try {
    // Try Redis cache first
    if (redisClient) {
      try {
        const cached = await redisClient.get(`game:${gameId}`);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (redisError) {
        Logger.warn(
          `Redis read failed for game ${gameId}:`,
          redisError.message
        );
      }
    }

    // Fallback to Supabase
    const { data, error } = await supabaseAdmin
      .from("games")
      .select("state")
      .eq("id", gameId)
      .single();

    if (error) {
      Logger.error(`Error loading state for game ${gameId}:`, error);
      throw error;
    }

    return data.state;
  } catch (error) {
    Logger.error(`Error in loadState for game ${gameId}:`, error);
    throw error;
  }
}
