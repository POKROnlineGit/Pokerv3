import { TexasHoldemEngine } from "./TexasHoldemEngine.js";

export class EngineFactory {
  /**
   * Create an engine instance based on the variant config
   * @param {string} gameId - Unique Game ID
   * @param {Object} variant - Full variant object from Registry (includes .config and .engine_type)
   * @param {Object} [savedState=null] - Optional state to restore
   * @returns {TexasHoldemEngine} Instantiated engine
   */
  static create(gameId, variant, savedState = null) {
    switch (variant.engine_type) {
      case "holdem":
        // Inject the JSON config directly into the engine
        // Note: Requires TexasHoldemEngine to be refactored to accept config object (Phase 2 Step 4)
        return new TexasHoldemEngine(gameId, variant.config, savedState);

      default:
        throw new Error(`Unknown engine type: ${variant.engine_type}`);
    }
  }
}

