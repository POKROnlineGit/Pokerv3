/**
 * BotManager - Manages bot players and their decision-making
 * Works with GameEngine context
 */

import { supabaseAdmin } from "../../../infrastructure/database/supabaseClient.js";
import { makeDecision } from "./botStrategies.js";
import { Logger } from "../../../shared/utils/Logger.js";

export class BotManager {
  static bots = [];

  /**
   * Load bots from database
   */
  static async loadBots() {
    try {
      const { data, error } = await supabaseAdmin.from("bots").select("*");

      if (error) {
        Logger.error("Error loading bots:", error);
        return;
      }

      if (data) {
        this.bots = data;
      }
    } catch (error) {
      Logger.error("Error in loadBots:", error);
    }
  }

  /**
   * Get random bots
   * @param {number} count - Number of bots needed
   * @returns {Array<string>} Array of bot IDs (format: "bot-{id}")
   */
  static getRandomBots(count) {
    const shuffled = [...this.bots].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map((bot) => `bot-${bot.id}`);
  }

  /**
   * Make decision for a bot player
   * @param {GameContext} ctx - Current game context
   * @param {string} botId - Bot player ID
   * @returns {Action} Action object
   */
  static makeDecision(ctx, botId) {
    const player = ctx.players.find((p) => p.id === botId);
    if (!player || player.folded || player.allIn) {
      return { type: "fold", seat: player?.seat || 0 };
    }

    // Get bot profile
    const botIdStr = botId.replace("bot-", "");
    const bot = this.bots.find((b) => {
      const idStr = typeof b.id === "string" ? b.id : b.id.toString();
      return idStr === botIdStr || `bot-${idStr}` === botId;
    });

    // Use strategy to make decision
    return makeDecision(ctx, player, bot);
  }

  /**
   * Check if it's a bot's turn
   * @param {GameContext} ctx - Current game context
   * @returns {boolean} True if current actor is a bot
   */
  static isBotTurn(ctx) {
    if (!ctx.currentActorSeat) return false;
    const actor = ctx.players.find((p) => p.seat === ctx.currentActorSeat);
    return actor && actor.isBot;
  }
}
