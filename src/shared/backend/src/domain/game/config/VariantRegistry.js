import { supabaseAdmin } from "../../../infrastructure/database/supabaseClient.js";
import { Logger } from "../../../shared/utils/Logger.js";

// Fallback defaults to prevent engine crashes if DB config is incomplete
const SAFE_DEFAULTS = {
  blinds: { small: 1, big: 2 },
  buyIn: 100,
  startingStack: 200, // Default stack if not defined
  actionTimeoutMs: 30000,
  phaseTransitionDelayMs: 2000, // Delay for regular phase transitions
  runoutPhaseDelayMs: 2000, // Delay for runout scenarios (all-in, player left)
};

class VariantRegistry {
  constructor() {
    this.variants = new Map(); // slug -> variant object
  }

  /**
   * Load all active game variants from DB into memory
   * Call this during server startup (GameManager.init)
   */
  async loadVariants() {
    try {
      const { data, error } = await supabaseAdmin
        .from("available_games")
        .select("*")
        .eq("active", true);

      if (error) {
        throw error;
      }

      this.variants.clear();

      data.forEach((v) => {
        const dbConfig = v.config || {};

        // Logic: startingStack defaults to buyIn (cash game legacy) or SAFE_DEFAULT
        const resolvedStartingStack =
          dbConfig.startingStack !== undefined
            ? dbConfig.startingStack
            : dbConfig.buyIn || SAFE_DEFAULTS.startingStack;

        // 1. Merge DB config with Safety Defaults
        // 2. Inject top-level 'max_players' into config (Engine expects it inside config)
        // 3. Inject variant slug for hand history tracking
        // 4. Inject category for payout logic (cash vs casual)
        // 5. Ensure startingStack is properly resolved
        const mergedConfig = {
          ...SAFE_DEFAULTS,
          ...dbConfig,
          maxPlayers: v.max_players, // Source of truth is the column
          variantSlug: v.slug, // Store slug for hand history and logging
          category: v.category, // Store category for payout logic
          startingStack: resolvedStartingStack,
        };

        // Update the variant object with the robust config
        v.config = mergedConfig;

        this.variants.set(v.slug, v);
      });

      Logger.info(
        `[VariantRegistry] Loaded ${this.variants.size} game variants`
      );
      Logger.info(
        `[VariantRegistry] Loaded variants: ${Array.from(
          this.variants.keys()
        ).join(", ")}`
      );
    } catch (error) {
      Logger.error("[VariantRegistry] Failed to load game variants", error);
      throw error;
    }
  }

  /**
   * Get a specific variant by slug
   * @param {string} slug - The unique identifier (e.g. 'six_max')
   * @returns {Object|undefined} The variant configuration
   */
  getVariant(slug) {
    const variant = this.variants.get(slug);
    if (!variant) {
      // Change to WARN to ensure it shows up
      const available = Array.from(this.variants.keys()).join(", ");
      Logger.warn(
        `[VariantRegistry] Variant '${slug}' not found. Available: [${available}]. Map size: ${this.variants.size}`
      );
    }
    return variant;
  }

  /**
   * Get all loaded variants
   * @returns {Array} List of all variant objects
   */
  getAllVariants() {
    return Array.from(this.variants.values());
  }
}

export const variantRegistry = new VariantRegistry();
