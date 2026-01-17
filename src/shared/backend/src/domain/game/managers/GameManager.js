/**
 * GameManager - In-memory map of active games
 * Manages GameEngine instances - create/destroy
 */

import {
  supabaseAdmin,
  supabaseRealtime,
} from "../../../infrastructure/database/supabaseClient.js";
import { persistState } from "../../../shared/utils/persistence.js";
import { BotManager } from "../bots/BotManager.js";
import { variantRegistry } from "../config/VariantRegistry.js";
import { EngineFactory } from "../engine/EngineFactory.js";
import { recoverActiveGames } from "./RecoveryService.js";
import { v4 as uuidv4 } from "uuid";
import { SocketBroadcaster } from "../services/SocketBroadcaster.js";
import { EffectExecutor } from "../services/EffectExecutor.js";
import { Mutex } from "../../../shared/utils/Mutex.js";
import { Logger } from "../../../shared/utils/Logger.js";
import { EffectType, EventType } from "../types.js";
import { HandHistoryService } from "../../handHistory/HandHistoryService.js";

export class GameManager {
  games = new Map(); // gameId -> game instance
  timeoutIntervals = new Map(); // Only used for transitions now
  botActionTimeouts = new Map(); // gameId -> timeout
  gamesChannel = null; // Keep channel reference alive
  playerConnections = new Map(); // gameId -> Set of connected player IDs
  reconnectTimers = new Map(); // userId -> {gameId, timeout} - 60s reconnect timers for disconnected players
  globalTicker = null; // Global interval for checking action deadlines
  persistenceQueue = []; // Simple retry queue for background persistence
  persistenceWorker = null;
  loadingPromises = new Map(); // gameId -> Promise<GameEngine|null> - Request locking for concurrent joins
  historyServices = new Map(); // gameId -> HandHistoryService - One service instance per game

  constructor() {
    // Initialize Services
    this.broadcaster = new SocketBroadcaster();
    this.executor = new EffectExecutor(this);
    this.mutex = new Mutex();
  }

  /**
   * Set Socket.io instance
   */
  setIO(socketIO) {
    this.broadcaster.setIO(socketIO);
  }

  // ========== HELPER METHODS ==========

  /**
   * Get engine or throw error if not found
   * @private
   * @param {string} gameId - Game ID
   * @param {string} methodName - Name of calling method for logging
   * @returns {GameEngine} Engine instance
   * @throws {Error} If engine not found
   */
  _getEngineOrFail(gameId, methodName = "unknown") {
    const engine = this.games.get(gameId);
    if (!engine) {
      Logger.warn(`[${methodName}] Engine not found for game ${gameId}`);
      throw new Error(`Game ${gameId} not found`);
    }
    return engine;
  }

  /**
   * Fetch username for a single user
   * @private
   * @param {string} userId - User ID
   * @param {string} fallback - Fallback username if not found (default: "Unknown")
   * @returns {Promise<string>} Username
   */
  async _fetchUsername(userId, fallback = "Unknown") {
    try {
      const { data: profile, error } = await supabaseAdmin
        .from("profiles")
        .select("username")
        .eq("id", userId)
        .single();

      if (error) {
        Logger.error(
          `[_fetchUsername] Error fetching profile for ${userId}:`,
          error
        );
      }

      return profile?.username || fallback;
    } catch (error) {
      Logger.error(
        `[_fetchUsername] Exception fetching username for ${userId}:`,
        error
      );
      return fallback;
    }
  }

  /**
   * Fetch usernames for multiple users
   * @private
   * @param {Array<string>} userIds - Array of user IDs
   * @returns {Promise<Array>} Array of profile objects with id and username
   */
  async _fetchUsernames(userIds) {
    if (userIds.length === 0) return [];

    try {
      const { data: profiles, error } = await supabaseAdmin
        .from("profiles")
        .select("id, username")
        .in("id", userIds);

      if (error) {
        Logger.error(`[_fetchUsernames] Error fetching profiles:`, error);
        return [];
      }

      return profiles || [];
    } catch (error) {
      Logger.error(`[_fetchUsernames] Exception fetching usernames:`, error);
      return [];
    }
  }

  /**
   * Emit error to socket (with optional action_error)
   * @private
   * @param {Object} socket - Socket.io socket instance
   * @param {string} message - Error message
   * @param {boolean} includeActionError - Whether to also emit action_error (default: false)
   */
  _emitError(socket, message, includeActionError = false) {
    socket.emit("error", { message });
    if (includeActionError) {
      socket.emit("action_error", { message });
    }
  }

  /**
   * Generate a unique 5-character join code
   * Excludes ambiguous characters (I, O, 0, 1) to prevent confusion
   * @private
   * @returns {string} 5-character uppercase code
   */
  _generateJoinCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Initialize - load active games, start global ticker, and subscribe
   */
  async init() {
    // 1. Load Game Variants (Rules)
    await variantRegistry.loadVariants();
    // 2. Load Active Games
    await this.loadActiveGames();
    this.startGlobalTicker(); // Start the single heartbeat
    this.startPersistenceWorker(); // Start background persistence worker
    this.subscribeToChanges();
  }

  /**
   * Start the Global Ticker (Heartbeat)
   * Replaces thousands of individual setTimeout calls for action timeouts.
   * Checks every 1s for expired deadlines.
   */
  startGlobalTicker() {
    if (this.globalTicker) clearInterval(this.globalTicker);

    Logger.info("[GameManager] Starting Global Ticker (1000ms heartbeat)");
    this.ticks = 0;

    this.globalTicker = setInterval(() => {
      const now = Date.now();
      this.ticks++;

      // --- WATCHDOG (Run every 60 seconds) ---
      if (this.ticks % 60 === 0) {
        // Use for...of to properly handle async cleanup
        // Fire-and-forget async cleanup (don't block ticker)
        (async () => {
          for (const [gameId, engine] of this.games.entries()) {
            const lastActivity = engine.lastActivity || engine.createdAt || 0;
            const inactiveMs = now - lastActivity;

            // 0. Generic inactivity guard: close games with no activity for 10 minutes
            if (inactiveMs > 10 * 60 * 1000) {
              Logger.info(
                `[Watchdog] Closing stale game ${gameId} due to ${Math.round(
                  inactiveMs / 1000
                )}s of inactivity`
              );
              await this.closeInactiveGame(gameId).catch((err) =>
                Logger.error(
                  `[Watchdog] Error closing stale game ${gameId}:`,
                  err
                )
              );
              continue;
            }

            // 1. Cleanup Abandoned Creations (> 5 mins)
            // Game created but players never connected/started
            if (
              engine.context.status === "starting" &&
              now - (engine.createdAt || 0) > 5 * 60 * 1000
            ) {
              Logger.info(
                `[Watchdog] Cleaning up abandoned STARTING game ${gameId}`
              );
              await this.handleGameEnded(gameId).catch((err) =>
                Logger.error(
                  `[Watchdog] Error cleaning up game ${gameId}:`,
                  err
                )
              );
            }
            // 2. Cleanup Stale Waiting Lobbies (> 30 mins inactivity)
            // Players sat in lobby but never started
            else if (
              engine.context.status === "waiting" &&
              now - (engine.lastActivity || 0) > 30 * 60 * 1000
            ) {
              Logger.info(
                `[Watchdog] Cleaning up stale WAITING lobby ${gameId}`
              );
              await this.handleGameEnded(gameId).catch((err) =>
                Logger.error(
                  `[Watchdog] Error cleaning up game ${gameId}:`,
                  err
                )
              );
            }
            // 3. Cleanup Stuck Active Games (> 2 hours inactivity)
            // Safety net for zombie games that got stuck in a loop or lost state
            else if (
              engine.context.status === "active" &&
              now - (engine.lastActivity || 0) > 2 * 60 * 60 * 1000
            ) {
              Logger.warn(
                `[Watchdog] Force-closing stuck ACTIVE game ${gameId}`
              );
              await this.handleGameEnded(gameId).catch((err) =>
                Logger.error(
                  `[Watchdog] Error cleaning up game ${gameId}:`,
                  err
                )
              );
            }
          }
        })();
      }

      // --- ACTION TIMEOUTS (Run every second) ---
      // NOTE: Timeout system applies to BOTH humans and bots identically
      // Bots have 1-3s delays, but if they somehow don't act within the deadline,
      // they will be timed out and auto-folded just like humans
      this.games.forEach((engine, gameId) => {
        // Skip if game is finished
        if (
          engine.context.status === "finished" ||
          engine.context.status === "complete"
        )
          return;

        // Skip if game is paused (timers should not trigger when paused)
        if (engine.context.isPaused) {
          return;
        }

        // Check Action Deadline
        if (engine.context.actionDeadline) {
          const deadline = new Date(engine.context.actionDeadline).getTime();

          // Buffer: Allow 1s grace period to prevent race with nearly-simultaneous actions
          if (now > deadline + 1000) {
            // LOCK: Ensure we don't process expiry while a player is acting
            this.mutex.runExclusive(gameId, async () => {
              // Re-check condition inside lock (state might have changed while waiting)
              const currentCtx = engine.context;
              if (currentCtx.actionDeadline) {
                const currentDeadline = new Date(
                  currentCtx.actionDeadline
                ).getTime();
                if (now > currentDeadline + 1000) {
                  const player = currentCtx.players.find(
                    (p) => p.seat === currentCtx.currentActorSeat
                  );

                  Logger.info(
                    `[GlobalTicker] Deadline expired for game ${gameId} player=${
                      player?.id || "unknown"
                    } isBot=${player?.isBot || false}`
                  );

                  try {
                    const playerId = player?.id;

                    if (playerId) {
                      // Clear any pending bot action timeout for this game
                      // (bot may have been scheduled but didn't execute in time)
                      const botTimeout = this.botActionTimeouts.get(gameId);
                      if (botTimeout) {
                        clearTimeout(botTimeout);
                        this.botActionTimeouts.delete(gameId);
                        Logger.debug(
                          `[GlobalTicker] Cleared pending bot action timeout for game ${gameId}`
                        );
                      }

                      const result = engine.handleTimeExpiry(playerId);
                      // Critical: Update context and process result
                      engine.context = result.state;
                      await this.processEngineResult(gameId, result);
                    }
                  } catch (err) {
                    Logger.error(
                      `[GlobalTicker] Error handling expiry for game ${gameId}:`,
                      err
                    );
                  }
                }
              }
            });
          }
        }
      });
    }, 1000);
  }

  /**
   * Start background worker to process persistence queue
   * Retries failed jobs without impacting live game flow.
   */
  startPersistenceWorker() {
    if (this.persistenceWorker) {
      clearInterval(this.persistenceWorker);
    }

    const MAX_ATTEMPTS = 3;

    this.persistenceWorker = setInterval(() => {
      if (this.persistenceQueue.length === 0) return;

      const job = this.persistenceQueue.shift();
      if (!job) return;

      (async () => {
        try {
          await persistState(job.gameId, job.state);
        } catch (error) {
          Logger.error(
            `[PersistenceWorker] Error persisting game ${job.gameId} attempt=${
              job.attempts + 1
            }:`,
            error
          );

          // Simple retry with capped attempts
          if (job.attempts + 1 < MAX_ATTEMPTS) {
            this.persistenceQueue.push({
              ...job,
              attempts: job.attempts + 1,
            });
          }
        }
      })();
    }, 1000);
  }

  /**
   * Load active games from database on startup
   * Uses RecoveryService
   */
  async loadActiveGames() {
    try {
      const recoveredGames = await recoverActiveGames();

      for (const { gameId, game } of recoveredGames) {
        // Validation: Check if recovered engine has invalid state/players
        // This handles "Zombie" or "Fresh" games that were recovered incorrectly
        if (!game.context || !Array.isArray(game.context.players)) {
          Logger.warn(
            `[GameManager] Recovered game ${gameId} has invalid state/players. Attempting JIT re-hydration...`
          );
          // Use loadGameFromDatabase to correctly re-hydrate with player data
          // This will fetch the correct data, fix the players, and set it in 'this.games'
          await this.loadGameFromDatabase(gameId);
          // Skip the rest of the loop for this iteration so we don't overwrite the good engine with the bad one
          continue;
        }

        // Engine is valid, proceed with recovery
        this.games.set(gameId, game);

        // Initialize playerConnections map for recovered games
        const context = game.context || {};
        const realPlayers = Array.isArray(context.players)
          ? context.players.filter((p) => !p.isBot)
          : [];
        this.playerConnections.set(gameId, new Set());

        Logger.info(
          `[GameManager] Recovered game ${gameId} with ${realPlayers.length} player(s)`
        );
      }
    } catch (error) {
      Logger.error("Error loading active games:", error);
    }
  }

  /**
   * Subscribe to Supabase Realtime for game changes
   */
  subscribeToChanges() {
    const channel = supabaseRealtime
      .channel("games_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
        },
        async (payload) => {
          if (payload.eventType === "INSERT") {
            await this.handleGameCreated(payload.new);
          } else if (payload.eventType === "UPDATE") {
            // UPDATE events are ignored - engine manages state in memory
            // Reloading would overwrite pending transitions and break delayed transitions
          } else if (payload.eventType === "DELETE") {
            this.handleGameEnded(payload.old.id);
          }
        }
      )
      .subscribe((status, err) => {
        if (status === "TIMED_OUT") {
          Logger.warn("Games subscription TIMED_OUT:", err);
        } else if (status === "CHANNEL_ERROR") {
          Logger.error("Games subscription error:", err);
        }
      });

    this.gamesChannel = channel;
  }

  /**
   * Handle new game created
   */
  async handleGameCreated(gameData) {
    // Ignore if we already have this game in memory
    if (this.games.has(gameData.id)) {
      Logger.debug(
        `[GameManager] Game ${gameData.id} already exists in memory, skipping initialization.`
      );
      return;
    }

    Logger.info(
      `[GameManager] Handling external game creation for ${gameData.id}`
    );

    try {
      const variantSlug = gameData.game_type || gameData.type || "six_max";
      const variant = variantRegistry.getVariant(variantSlug);

      if (!variant) {
        Logger.error(
          `[handleGameCreated] Unknown variant '${variantSlug}' for game ${gameData.id}`
        );
        return;
      }

      const state = gameData.state;
      const engine = EngineFactory.create(gameData.id, variant, state);

      this.games.set(gameData.id, engine);
    } catch (error) {
      Logger.error(`Error handling game creation ${gameData.id}:`, error);
    }
  }

  /**
   * Handle explicit LEAVE_GAME event - Permanent leave
   * Player cannot rejoin, marked as LEFT
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID of leaving player
   */
  async handleLeaveGame(gameId, userId) {
    Logger.info(`[handleLeaveGame] Called: gameId=${gameId} userId=${userId}`);
    const engine = this.games.get(gameId);
    if (!engine) {
      Logger.warn(
        `[handleLeaveGame] Engine not found in memory: gameId=${gameId} userId=${userId}`
      );
      return;
    }
    Logger.debug(
      `[handleLeaveGame] Engine found, proceeding with leave logic: gameId=${gameId} userId=${userId}`
    );

    // 1. Cancel Reconnect Timer
    this.cancelReconnectTimer(userId);

    // 2. Delegate logic to Engine
    // This handles status updates, folding, actor advancement, and event generation
    Logger.debug(
      `[handleLeaveGame] Calling engine.handleLeave: userId=${userId} gameId=${gameId}`
    );
    const result = engine.handleLeave(userId);
    Logger.debug(
      `[handleLeaveGame] Engine returned result: success=${result.success} events=${result.events.length} effects=${result.effects.length} gameId=${gameId}`
    );

    // 3. Update Master Context
    engine.context = result.state;
    Logger.debug(
      `[handleLeaveGame] Updated engine context: gameId=${gameId} userId=${userId}`
    );

    // 4. PAYOUT LOGIC (Cash Games Only, skip for private games)
    const isCashGame = engine.config.category === "cash";
    const isPrivateGame = engine.context.isPrivate || false;
    const player = engine.context.players.find((p) => p.id === userId);

    if (player && !player.isBot && player.chips > 0) {
      if (isCashGame && !isPrivateGame) {
        await this._payoutPlayer(userId, player.chips);
      } else {
        Logger.info(
          `[Payout] ${
            isPrivateGame ? "Private" : "Casual"
          } game - no payout for ${userId}`
        );
      }
      player.chips = 0; // Prevent double-dipping
    }

    // 5. Execute Side Effects (History, Persistence, Timers)
    Logger.debug(
      `[handleLeaveGame] Processing result: gameId=${gameId} userId=${userId}`
    );
    // Process result (history + effects + broadcasting)
    await this.processEngineResult(gameId, result);

    // Note: Events are already broadcast by processEngineResult
    // Additional event handling can be done here if needed
    if (result.events.length > 0) {
      Logger.debug(
        `[handleLeaveGame] Processed ${result.events.length} events: gameId=${gameId} userId=${userId}`
      );
    }

    // 7. Broadcast New State
    // Note: State is already broadcast by processEngineResult above

    // 8. Cleanup Socket Rooms
    if (this.broadcaster.io) {
      try {
        const sockets = await this.broadcaster.io
          .in(`${gameId}-${userId}`)
          .fetchSockets();

        for (const socket of sockets) {
          socket.leave(gameId);
          socket.leave(`${gameId}-${userId}`);
        }
      } catch (error) {
        Logger.error(`[handleLeaveGame] Error cleaning up sockets:`, error);
      }
    }

    // 9. Remove from tracking
    this.playerConnections.get(gameId)?.delete(userId);
  }

  /**
   * Finalize game end - handles payouts, stats, cleanup
   * Called by both EffectExecutor (natural end) and watchdog (forced end)
   * @param {string} gameId - Game ID
   * @param {Object} effect - Effect object with reason and winnerId
   * @param {Object} state - Game state
   */
  async finalizeGameEnd(gameId, effect, state) {
    const engine = this.games.get(gameId);
    if (!engine) return;

    // 1. Calculate final stacks BEFORE payout (chips are zeroed after payout)
    const finalStacks = state.players.reduce((acc, p) => {
      if (p.id) acc[p.id] = p.chips || 0;
      return acc;
    }, {});

    // 2. PAYOUT: Return chips to all remaining players (cash games only, skip for private games)
    const isCashGame = engine.config.category === "cash";
    const isPrivateGame = engine.context.isPrivate || false;
    if (isCashGame && !isPrivateGame && state.players) {
      for (const p of state.players) {
        if (!p.isBot && p.chips > 0) {
          await this._payoutPlayer(p.id, p.chips);
          p.chips = 0; // Prevent double payout
        }
      }
    } else if (isPrivateGame) {
      Logger.info(
        `[finalizeGameEnd] Private game - skipping chip payout for game ${gameId}`
      );
    }

    // 3. Update state
    state.status = "finished";
    state.message = effect?.reason || "Game ended";

    // 4. Persist state
    this.handlePersistEffect(gameId, state);

    // 5. Fetch and transform game statistics from unified hand_histories table (fault-tolerant)
    let gameStats = null;
    try {
      // Read stack history from hand_histories.stats column
      // Also get replay_data and player_manifest from first hand for starting stacks
      const { data, error } = await supabaseAdmin
        .from("hand_histories")
        .select("hand_index, stats, replay_data, player_manifest")
        .eq("game_id", gameId)
        .order("hand_index", { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        // Get starting stacks from first hand's replay data
        let handZeroStacks = null;
        const firstHandData = data[0];
        if (firstHandData.replay_data && firstHandData.player_manifest) {
          try {
            const { PokerCodec } = await import(
              "../../handHistory/PokerCodec.js"
            );
            const hexString = firstHandData.replay_data.replace(/^\\x/, "");
            const buffer = new Uint8Array(
              hexString.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
            );
            const decoded = PokerCodec.decode(buffer);

            if (decoded.startingStacks && decoded.startingStacks.length > 0) {
              const manifest = firstHandData.player_manifest;
              const sortedSeats = Object.keys(manifest)
                .map(Number)
                .sort((a, b) => a - b);

              handZeroStacks = {};
              sortedSeats.forEach((seat, index) => {
                const playerId = manifest[seat];
                if (playerId && index < decoded.startingStacks.length) {
                  handZeroStacks[playerId] = {
                    chips: decoded.startingStacks[index],
                    vpip: false,
                    pfr: false,
                  };
                }
              });
            }
          } catch (decodeError) {
            // Silently fail - hand 0 is optional
            Logger.debug(
              `[GameManager] Failed to decode first hand for hand 0 stacks:`,
              decodeError
            );
          }
        }

        // Transform data from hand_histories format to stack history format
        const stackHistory = data
          .filter((row) => row.stats && row.stats.stats)
          .map((row) => ({
            hand: row.hand_index,
            stacks: row.stats.stats || {},
          }));

        // Prepend hand 0 with starting stacks
        if (handZeroStacks && Object.keys(handZeroStacks).length > 0) {
          stackHistory.unshift({
            hand: 0,
            stacks: handZeroStacks,
          });
        }

        if (stackHistory.length > 0) {
          const firstHandEntry = stackHistory[0];

          // Transform stack history from hand-centric to player-centric for graphing
          // Input: [{ hand: 0, stacks: {...} }, { hand: 1, stacks: {...} }, ...]
          // Output: { 'uuid1': { 0: 1000, 1: 1200, ... }, 'uuid2': { 0: 2000, 1: 1800, ... } }
          const stackHistoryByPlayer = stackHistory.reduce(
            (acc, { hand, stacks }) => {
              Object.entries(stacks).forEach(([playerId, stack]) => {
                acc[playerId] = acc[playerId] || {};
                acc[playerId][hand] = stack.chips || 0;
              });
              return acc;
            },
            {}
          );

          // Calculate chip changes using hand 0 if available, otherwise first hand
          const startingStacksForCalc = handZeroStacks || firstHandEntry.stacks;
          const chipChanges = Object.keys(startingStacksForCalc).reduce(
            (acc, playerId) => {
              const stackValue = startingStacksForCalc[playerId];
              const starting = stackValue.chips || 0;
              const final = finalStacks[playerId] || 0;
              acc[playerId] = final - starting;
              return acc;
            },
            {}
          );

          gameStats = {
            totalHands: stackHistory.length - (handZeroStacks ? 1 : 0), // Exclude hand 0 from count
            startingStacks: startingStacksForCalc, // Use hand 0 stacks if available
            finalStacks,
            chipChanges,
            stackHistoryByPlayer, // Player-centric format for graphing (includes hand 0)
          };
        }
      }
    } catch (err) {
      Logger.warn(
        `[GameManager] Failed to fetch game stats for ${gameId}, sending basic message:`,
        err
      );
    }

    // 6. Emit GAME_FINISHED event
    this.broadcaster.emitEvents(gameId, [
      {
        type: "GAME_FINISHED",
        payload: {
          reason: effect?.reason || "Game ended",
          winnerId: effect?.winnerId || null,
          returnUrl: "/lobby",
          timestamp: new Date().toISOString(),
          // Add stats if available
          ...(gameStats && { stats: gameStats }),
        },
      },
    ]);

    // 7. Cleanup
    this.stopGameTimers(gameId);
    setTimeout(() => {
      this.games.delete(gameId);
      this.historyServices.delete(gameId);
      Logger.info(
        `[GameManager] Cleaned up finished game from memory game=${gameId}`
      );
    }, 5000);
  }

  /**
   * Handle game ended (deleted from database or cleaned up by watchdog)
   */
  async handleGameEnded(gameId) {
    const engine = this.games.get(gameId);
    if (!engine) return;

    const context = engine.context;

    // FREE UP CODE FOR REUSE: Set join_code to NULL explicitly
    // This ensures immediate recycling, not dependent on persistence queue
    await supabaseAdmin
      .from("games")
      .update({ 
        status: "finished",
        join_code: null // <--- FREE UP CODE FOR REUSE
      })
      .eq("id", gameId);

    // Use unified finalize method
    await this.finalizeGameEnd(
      gameId,
      {
        reason: "Game cleaned up by watchdog",
        winnerId: null,
      },
      context
    );

    // Additional cleanup specific to watchdog
    const playerIds = context.players.filter((p) => !p.isBot).map((p) => p.id);

    if (playerIds.length > 0) {
      this.broadcaster.emitGameDeleted(gameId, playerIds);
    }
  }

  /**
   * Create a new game from queue
   * Server-side authority - all game creation happens here
   * @param {string} variantSlug - The game variant slug (e.g. 'six_max', 'heads_up')
   * @param {Array<string>} playerIds - List of player UUIDs
   * @param {string} [providedGameId] - Optional game ID (used when RPC has already generated it atomically)
   */
  async createGame(variantSlug, playerIds, providedGameId = null) {
    try {
      // 1. Validate Variant & Get Config
      const variant = variantRegistry.getVariant(variantSlug);
      if (!variant) {
        throw new Error(`Invalid game variant: ${variantSlug}`);
      }
      const config = variant.config;

      // Use provided gameId (from RPC) or generate new one
      const gameId = providedGameId || uuidv4();

      // Separate real players from bots
      const realPlayers = playerIds.filter((id) => !id.startsWith("bot-"));

      // 2. FINANCIALS: Chip deduction is handled by RPC function for queue games
      // For queue games (providedGameId exists), chips are already deducted atomically by RPC
      // For direct game creation (no providedGameId), we still need to deduct chips
      const buyInCost = config.buyIn || 0;
      if (!providedGameId && variant.category === "cash" && buyInCost > 0) {
        // Only deduct if this is NOT a queue game (queue games handled by RPC)
        if (realPlayers.length > 0) {
          const { error: deductError } = await supabaseAdmin.rpc(
            "deduct_chips",
            {
              user_ids: realPlayers,
              amount: buyInCost,
            }
          );

          if (deductError) {
            Logger.error("Error deducting chips:", deductError);
            // In production, consider aborting game creation here
          }
        }
      }

      // 2.5. Fetch usernames for all real players from profiles
      // Match private game pattern: fetch profiles, then find and extract username directly
      let profiles = [];
      if (realPlayers.length > 0) {
        Logger.debug(
          `[createGame] Fetching profiles for ${
            realPlayers.length
          } players: ${realPlayers.join(", ")}`
        );
        profiles = await this._fetchUsernames(realPlayers);
        if (profiles.length > 0) {
          Logger.info(
            `[createGame] Fetched ${
              profiles.length
            } profiles from database: ${profiles
              .map((p) => `id=${p.id} username=${p.username || "null"}`)
              .join(", ")}`
          );
        } else {
          Logger.warn(
            `[createGame] No profiles data returned for players: ${realPlayers.join(
              ", "
            )}`
          );
        }
      }

      // 3. Create Engine
      const engine = EngineFactory.create(gameId, variant);

      // 4. Initialize Players with Starting Stack
      const startChips = config.startingStack || 200;

      const playersData = playerIds.map((userId, index) => {
        const isBot = userId.startsWith("bot-");
        if (isBot) {
          const botId = userId.replace("bot-", "");
          const bot = BotManager.bots.find((b) => {
            const botIdStr = typeof b.id === "string" ? b.id : b.id.toString();
            return botIdStr === botId || `bot-${botIdStr}` === userId;
          });
          return {
            id: userId,
            username: bot?.name || `Bot-${botId.slice(0, 8)}`,
            chips: startChips, // Using startingStack, NOT buyIn
            isBot: true,
          };
        } else {
          // Match private game pattern: find profile directly, then extract username
          const profile = profiles.find((p) => p.id === userId);
          const username = profile?.username || `Player ${index + 1}`; // Match private game pattern exactly

          if (profile) {
            Logger.debug(
              `[createGame] Found profile for userId=${userId}: username=${
                profile.username || "null"
              }`
            );
          } else {
            Logger.warn(
              `[createGame] No profile found for userId=${userId} (type=${typeof userId}), using fallback username: ${username}. Available profile IDs: ${profiles
                .map((p) => `${p.id} (type=${typeof p.id})`)
                .join(", ")}`
            );
          }

          Logger.info(
            `[createGame] Assigning username to player: userId=${userId}, username=${username}`
          );

          return {
            id: userId,
            username: username, // Direct assignment like private games
            chips: startChips, // Using startingStack, NOT buyIn
            isBot: false,
          };
        }
      });

      // Add players to engine
      engine.addPlayers(playersData);

      // 5. Persist to DB with join code retry loop
      const context = engine.context;

      // VITAL: Include full players array for RLS/Frontend triggers
      const dbPayloadBase = {
        id: gameId,
        game_type: variantSlug, // Store the variant slug
        status: "starting", // Game is created but waiting for all players to connect
        small_blind: config.blinds.small,
        big_blind: config.blinds.big,
        buy_in: buyInCost,
        state: context, // Full engine state
        players: context.players, // VITAL: Full players array for RLS/Frontend triggers
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      // Retry loop to handle potential join_code collisions
      const maxRetries = 3;
      let attempt = 0;
      let createdGame = null;
      let joinCode = '';

      while (attempt < maxRetries && !createdGame) {
        try {
          joinCode = this._generateJoinCode();
          
          const dbPayload = {
            ...dbPayloadBase,
            join_code: joinCode, // Insert generated code
          };

          const { data, error } = await supabaseAdmin
            .from("games")
            .insert(dbPayload)
            .select()
            .single();

          if (error) {
            // Postgres error 23505 is unique_violation
            // Only retry if it's specifically a join_code collision
            if (error.code === '23505' && error.message.includes('join_code')) {
              Logger.warn(`Join Code collision: ${joinCode}. Retrying... (attempt ${attempt + 1}/${maxRetries})`);
              attempt++;
              continue;
            }
            // For other errors (including other unique violations), throw immediately
            throw error;
          }
          
          createdGame = data;
        } catch (err) {
          // If we've exhausted retries, handle refund and throw
          if (attempt >= maxRetries - 1) {
            // CRITICAL: Refund chips if game creation failed after all retries
            // Only refund if we deducted chips (non-queue games with cash variant)
            if (!providedGameId && variant.category === "cash" && buyInCost > 0 && realPlayers.length > 0) {
              Logger.error(
                `[createGame] Failed to create game after ${maxRetries} attempts. Refunding ${buyInCost} chips to ${realPlayers.length} player(s)...`
              );
              // payout_chips accepts single user_id, so we must loop
              for (const userId of realPlayers) {
                try {
                  const { error: refundError } = await supabaseAdmin.rpc("payout_chips", {
                    user_id: userId,
                    amount: buyInCost,
                  });
                  if (refundError) {
                    Logger.error(
                      `[createGame] CRITICAL: Failed to refund ${buyInCost} chips to player ${userId}:`,
                      refundError
                    );
                    // Continue with other players even if one fails
                  } else {
                    Logger.info(
                      `[createGame] Successfully refunded ${buyInCost} chips to player ${userId}`
                    );
                  }
                } catch (refundErr) {
                  Logger.error(
                    `[createGame] CRITICAL: Exception during chip refund for player ${userId}:`,
                    refundErr
                  );
                }
              }
            }
            throw err;
          }
          attempt++;
        }
      }

      if (!createdGame) {
        // This should never happen (would have thrown above), but safety check
        throw new Error("Failed to generate a unique join code after multiple attempts.");
      }

      // Inject code into engine context so it appears in the frontend state
      engine.context.joinCode = joinCode;

      // Add to in-memory games
      this.games.set(gameId, engine);
      this.playerConnections.set(gameId, new Set());

      Logger.info(`🎮 Game ${gameId} created (${variantSlug}) with join code: ${joinCode}`);

      return gameId;
    } catch (error) {
      Logger.error("Error creating game:", error);
      throw error;
    }
  }

  /**
   * Create a private game (host game)
   * @param {string} hostId - Host user ID
   * @param {string} variantSlug - Game variant slug
   * @param {Object} config - User-provided config (blinds, startingStack, etc.)
   * @returns {Promise<string>} Game ID
   */
  async createPrivateGame(hostId, variantSlug, config = {}) {
    try {
      // 1. Get variant from VariantRegistry
      const variant = variantRegistry.getVariant(variantSlug);
      if (!variant) {
        throw new Error(`Invalid game variant: ${variantSlug}`);
      }

      // 2. Construct game options: merge variant.config with user config
      const gameOptions = {
        ...variant.config,
        ...config,
        isPrivate: true,
        hostId: hostId,
      };

      // Ensure blinds and startingStack are properly set
      if (config.blinds) {
        gameOptions.blinds = config.blinds;
      }
      if (config.startingStack !== undefined) {
        gameOptions.startingStack = config.startingStack;
      }

      const gameId = uuidv4();

      // 2.5. Fetch host username from profiles
      const hostUsername = await this._fetchUsername(hostId, "Host");

      // 3. Initialize engine via EngineFactory.create()
      // Create a modified variant with merged config that includes private game settings
      const modifiedVariant = {
        ...variant,
        config: gameOptions,
      };
      const engine = EngineFactory.create(gameId, modifiedVariant, null);

      // 3.5. Auto-seat the host
      const startingStack =
        gameOptions.startingStack || gameOptions.buyIn || 200;
      const hostPlayer = {
        id: hostId,
        username: hostUsername,
        chips: startingStack,
        seat: 1, // Auto-assign first seat
        isHost: true,
        isBot: false,
      };
      engine.addPlayers([hostPlayer]);

      // 4. Insert into 'games' table with host player included and join code retry loop
      const dbPayloadBase = {
        id: gameId,
        game_type: variantSlug,
        status: "waiting",
        is_private: true,
        host_id: hostId,
        small_blind: gameOptions.blinds.small,
        big_blind: gameOptions.blinds.big,
        buy_in: gameOptions.buyIn || 0,
        state: engine.context, // Include full engine state with host player
        players: engine.context.players, // Include host player in players array
        pending_requests: [],
        is_paused: false,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      // Retry loop to handle potential join_code collisions
      const maxRetries = 3;
      let attempt = 0;
      let createdGame = null;
      let joinCode = '';

      while (attempt < maxRetries && !createdGame) {
        try {
          joinCode = this._generateJoinCode();
          
          const dbPayload = {
            ...dbPayloadBase,
            join_code: joinCode, // Insert generated code
          };

          const { data, error } = await supabaseAdmin
            .from("games")
            .insert(dbPayload)
            .select()
            .single();

          if (error) {
            // Postgres error 23505 is unique_violation
            // Only retry if it's specifically a join_code collision
            if (error.code === '23505' && error.message.includes('join_code')) {
              Logger.warn(`Join Code collision: ${joinCode}. Retrying... (attempt ${attempt + 1}/${maxRetries})`);
              attempt++;
              continue;
            }
            // For other errors (including other unique violations), throw immediately
            throw error;
          }
          
          createdGame = data;
        } catch (err) {
          // If we've exhausted retries, throw
          if (attempt >= maxRetries - 1) {
            throw err;
          }
          attempt++;
        }
      }

      if (!createdGame) {
        // This should never happen (would have thrown above), but safety check
        throw new Error("Failed to generate a unique join code after multiple attempts.");
      }

      // Inject code into engine context so it appears in the frontend state
      engine.context.joinCode = joinCode;

      // 5. Store in this.games map
      this.games.set(gameId, engine);
      this.playerConnections.set(gameId, new Set());

      Logger.info(
        `🎮 Private game ${gameId} created by host ${hostId} (${variantSlug}) with join code: ${joinCode}`
      );

      // 6. Return gameId
      return gameId;
    } catch (error) {
      Logger.error("Error creating private game:", error);
      throw error;
    }
  }

  /**
   * Handle admin action (host controls)
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID attempting the action
   * @param {Object} payload - Admin action payload
   * @returns {Promise<boolean>} Success status
   */
  async handleAdminAction(gameId, userId, payload) {
    try {
      // 1. Get engine
      const engine = this._getEngineOrFail(gameId, "handleAdminAction");

      // 2. Verify engine.context.hostId === userId
      if (engine.context.hostId !== userId) {
        throw new Error(
          "Unauthorized: Only the host can perform admin actions"
        );
      }

      // 3. Call engine.processAdminAction(payload)
      const result = engine.processAdminAction(payload);

      // 4. Call this.processEngineResult(gameId, result)
      await this.processEngineResult(gameId, result);

      // 5. Return result.success
      return result.success;
    } catch (error) {
      Logger.error(`Error handling admin action for game ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Handle seat request from guest
   * @param {string} gameId - Game ID
   * @param {Object} user - User object {id, username}
   * @returns {Promise<void>}
   */
  async handleRequestSeat(gameId, user) {
    try {
      // 1. Get engine
      const engine = this._getEngineOrFail(gameId, "handleRequestSeat");

      // 1.5. Fetch guest username from profiles
      const guestUsername = await this._fetchUsername(user.id, "Unknown");

      // 2. Call engine.requestSeat with user info
      const result = engine.requestSeat({
        id: user.id,
        userId: user.id,
        username: guestUsername,
        chips: 0, // Will be set when approved
      });

      // 3. Call this.processEngineResult(gameId, result)
      await this.processEngineResult(gameId, result);
    } catch (error) {
      Logger.error(`Error handling seat request for game ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a player is in any active game
   */
  async isPlayerInGame(userId) {
    const gameId = await this.getPlayerActiveGameId(userId);
    return gameId !== null;
  }

  /**
   * Get the game ID for a player's active game (checks in-memory games only)
   * Used for session status checks that should only reflect current server instance state
   * @param {string} userId - Player user ID
   * @returns {string|null} Game ID or null if not found
   */
  getPlayerActiveGameIdInMemory(userId) {
    // Check in-memory games only (strictly in-memory, no database fallback)
    for (const [gameId, engine] of this.games.entries()) {
      const context = engine?.context;
      if (!context || !Array.isArray(context.players)) {
        continue;
      }
      const player = context.players.find(
        (p) =>
          p.id === userId &&
          !p.isBot &&
          p.status !== "LEFT" &&
          p.status !== "REMOVED"
      );
      if (player) {
        return gameId;
      }
    }
    return null;
  }

  /**
   * Get the game ID for a player's active game
   */
  async getPlayerActiveGameId(userId) {
    // Check in-memory games first
    for (const [gameId, engine] of this.games.entries()) {
      const context = engine?.context;
      if (!context || !Array.isArray(context.players)) {
        continue;
      }

      // FIX: Only return games that are waiting, starting, or active (not finished/complete)
      // This prevents players from being redirected to completed games
      // Includes 'waiting' for private games
      if (
        context.status !== "waiting" &&
        context.status !== "active" &&
        context.status !== "starting"
      ) {
        continue;
      }

      // Exclude LEFT and REMOVED players - they cannot reconnect immediately
      const player = context.players.find(
        (p) =>
          p.id === userId &&
          !p.isBot &&
          p.status !== "LEFT" &&
          p.status !== "REMOVED"
      );
      if (player) {
        return gameId;
      }
    }

    // Also check database for active games (in case of server restart)
    try {
      const { data: games, error } = await supabaseAdmin
        .from("games")
        .select("id, players, status")
        .in("status", ["waiting", "starting", "active"]);

      if (error) {
        Logger.error("Error checking active games:", error);
        return null;
      }

      if (games) {
        for (const game of games) {
          if (game.players && Array.isArray(game.players)) {
            const playerInGame = game.players.some(
              (p) =>
                (p.id === userId || p.id?.toString() === userId) &&
                p.status !== "LEFT" &&
                p.status !== "REMOVED"
            );
            if (playerInGame) {
              return game.id;
            }
          }
        }
      }
    } catch (error) {
      Logger.error("Error checking database for active games:", error);
    }

    return null;
  }

  /**
   * Check if a player is in a specific game
   */
  isPlayerInSpecificGame(userId, gameId) {
    const engine = this.games.get(gameId);
    if (!engine) {
      return false;
    }

    const context = engine.context;
    const player = context.players.find((p) => p.id === userId && !p.isBot);
    return !!player;
  }

  /**
   * Load a single game from database if not in memory (Just-In-Time Hydration with Retry)
   * @param {string} gameId - Game ID
   * @returns {Promise<GameEngine|null>} GameEngine instance or null if not found
   */
  async loadGameFromDatabase(gameId) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 500; // milliseconds

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Query Supabase for games with status 'waiting', 'starting', or 'active'
        const { data: gameData, error } = await supabaseAdmin
          .from("games")
          .select("*")
          .eq("id", gameId)
          .in("status", ["waiting", "starting", "active"])
          .single();

        if (gameData && !error) {
          Logger.info(
            `[loadGameFromDatabase] Lazy rehydrating game ${gameId} from database (status: ${gameData.status}) - Attempt ${attempt}/${MAX_RETRIES}`
          );

          // 1. Resolve Variant
          const variantSlug = gameData.game_type || "six_max";
          const variant = variantRegistry.getVariant(variantSlug);

          if (!variant) {
            Logger.error(
              `[loadGameFromDatabase] Unknown variant '${variantSlug}' for game ${gameId}. Cannot rehydrate.`
            );
            return null;
          }

          // Load state from database
          const state = gameData.state;
          const isEmptyState =
            !state ||
            (typeof state === "object" &&
              Object.keys(state).length === 0 &&
              !state.players);

          // 2. Use Factory to rehydrate Engine
          // Pass null if state is empty to trigger _createInitialContext() inside engine
          const engine = EngineFactory.create(
            gameData.id,
            variant,
            isEmptyState ? null : state
          );

          // Handle Fresh Games: If state is missing/empty, initialize engine with players from DB
          if (
            isEmptyState &&
            gameData.players &&
            Array.isArray(gameData.players) &&
            gameData.players.length > 0
          ) {
            Logger.info(
              `[loadGameFromDatabase] Initializing fresh game ${gameId} with players from DB`
            );
            engine.addPlayers(gameData.players);
            engine.context.status = gameData.status;

            if (
              !engine.context.players ||
              !Array.isArray(engine.context.players)
            ) {
              Logger.error(
                `[loadGameFromDatabase] Failed to initialize players for fresh game ${gameId}`
              );
              engine.context.players = [];
            } else {
              Logger.info(
                `[loadGameFromDatabase] Successfully added ${engine.context.players.length} player(s) to fresh game ${gameId}`
              );
            }
          }

          this.games.set(gameId, engine);

          if (!this.playerConnections.has(gameId)) {
            this.playerConnections.set(gameId, new Set());
          }

          Logger.info(
            `[loadGameFromDatabase] Successfully rehydrated game ${gameId} into memory (Attempt ${attempt}/${MAX_RETRIES})`
          );

          return engine;
        }

        // Handle errors other than "row not found"
        if (error && error.code !== "PGRST116") {
          Logger.error(
            `[loadGameFromDatabase] Error querying game ${gameId} (Attempt ${attempt}/${MAX_RETRIES}):`,
            error
          );
        }

        // Game not found
        if (!gameData || error?.code === "PGRST116") {
          Logger.debug(
            `[loadGameFromDatabase] Game ${gameId} not found or not in 'waiting'/'starting'/'active' status. Retrying...`
          );
          if (attempt < MAX_RETRIES) {
            await this.delay(RETRY_DELAY);
          }
        }
      } catch (error) {
        Logger.error(
          `[loadGameFromDatabase] Unexpected error loading game ${gameId}:`,
          error
        );
        if (attempt < MAX_RETRIES) {
          await this.delay(RETRY_DELAY);
        }
      }
    }

    Logger.warn(
      `[loadGameFromDatabase] Game ${gameId} not found after ${MAX_RETRIES} attempts. Returning null.`
    );
    return null;
  }

  /**
   * Join game room - called when player connects via socket
   * Tracks player connections and starts game when all players are connected
   *
   * Lazy Rehydration: If the game is not in the local 'games' Map,
   * immediately query Supabase for games with status 'starting' or 'active'.
   * If found, instantiate the TexasHoldemEngine in memory right now and proceed.
   * This ensures that no matter which Render instance a player hits,
   * the server 'pulls' the game into memory on demand.
   */
  async joinGame(socket, gameId) {
    try {
      Logger.info(`[joinGame] Player ${socket.userId} joining game ${gameId}`);

      // 1. Check in-memory Map first (primary source)
      let engine = this.games.get(gameId);

      // 2. Lazy Rehydration with Request Locking: If game not in memory, pull from database
      // Use mutex pattern to prevent concurrent duplicate database queries
      if (!engine) {
        if (this.loadingPromises.has(gameId)) {
          // Load already in progress, attach to existing promise
          Logger.debug(
            `[joinGame] Game ${gameId} is currently loading, attaching to existing promise...`
          );
          engine = await this.loadingPromises.get(gameId);
        } else {
          // No active load, initiate JIT hydration
          Logger.debug(
            `[joinGame] Game ${gameId} not in memory, initiating JIT hydration...`
          );
          const loadPromise = this.loadGameFromDatabase(gameId);
          this.loadingPromises.set(gameId, loadPromise);

          try {
            engine = await loadPromise;
          } finally {
            // Clean up the map entry regardless of success/failure
            this.loadingPromises.delete(gameId);
          }
        }

        // Check if engine was successfully loaded
        if (!engine) {
          Logger.warn(
            `[joinGame] Failed to find game ${gameId} after JIT attempt`
          );
          this._emitError(socket, "Game not found");
          return;
        }
        // Engine is now in memory, proceed with join
      }

      // WATCHDOG: Keep lobby alive on join
      engine.lastActivity = Date.now();

      const context = engine?.context;
      if (!context) {
        Logger.error(
          `[joinGame] Engine context is undefined for game ${gameId}`
        );
        this._emitError(socket, "Game state is invalid");
        return;
      }

      // Verify player is in this game (compare as strings to handle type mismatches)
      // Safety check: ensure context.players exists and is an array
      if (!context.players || !Array.isArray(context.players)) {
        Logger.error(
          `[joinGame] Engine context.players is invalid for game ${gameId} (type: ${typeof context.players})`
        );
        this._emitError(socket, "Game players data is invalid");
        return;
      }

      const player = context.players.find((p) => {
        const playerId = String(p.id || "");
        const socketUserId = String(socket.userId || "");
        return playerId === socketUserId && !p.isBot;
      });

      // For private games, allow spectators (non-seated users) to join
      const isPrivate = context.isPrivate || false;
      const isSpectator = !player && isPrivate;

      if (!player && !isSpectator) {
        this._emitError(socket, "Not a player in this game");
        return;
      }

      // Handle zero-chip rejoins for private games
      if (isPrivate && player && player.chips === 0) {
        // Remove from players (if still there)
        context.players = context.players.filter((p) => p.id !== socket.userId);

        // Add to spectators
        if (!context.spectators.some((s) => s.userId === socket.userId)) {
          context.spectators.push({
            userId: socket.userId,
            username: player.username || "Unknown",
            joinedAt: new Date().toISOString(),
          });
        }

        // Persist the change
        await this.enqueuePersistence(gameId, engine.context);

        // Send spectator context
        socket.join(gameId);
        socket.join(`${gameId}-${socket.userId}`);
        const spectatorContext = this._getSpectatorContext(
          engine.context,
          gameId,
          engine
        );
        socket.emit("gameState", spectatorContext);

        Logger.info(
          `[joinGame] Player ${socket.userId} with zero chips rejoined private game ${gameId} as spectator`
        );
        return;
      }

      // Handle spectators for private games
      if (isSpectator) {
        // Add to spectators array if not already there (for broadcastState to find them)
        if (!context.spectators.some((s) => s.userId === socket.userId)) {
          // Fetch spectator username from profiles for consistency
          const spectatorName = await this._fetchUsername(
            socket.userId,
            "Unknown"
          );

          context.spectators.push({
            userId: socket.userId,
            username: spectatorName,
            joinedAt: new Date().toISOString(),
          });

          // Process result to broadcast state update to all players (including host)
          await this.processEngineResult(gameId, {
            success: true,
            state: engine.context,
            events: [
              {
                type: "SPECTATOR_JOINED",
                payload: {
                  spectatorId: socket.userId,
                  username: spectatorName,
                  gameId: gameId,
                },
              },
            ],
            effects: [{ type: "PERSIST" }],
          });
        }

        // Join socket room to receive broadcasts
        socket.join(gameId);
        socket.join(`${gameId}-${socket.userId}`);

        // Send sanitized public state (spectator view)
        // Create a public view of the game state without private information
        const spectatorContext = this._getSpectatorContext(
          engine.context,
          gameId,
          engine
        );
        socket.emit("gameState", spectatorContext);

        Logger.info(
          `[joinGame] Spectator ${socket.userId} joined private game ${gameId}`
        );
        return;
      }

      // Handle reconnection: Use engine's handleReconnect method
      if (player.status === "DISCONNECTED") {
        Logger.info(
          `[joinGame] Player ${socket.userId} reconnected to game ${gameId}, restoring ACTIVE status`
        );

        // Use engine's handleReconnect (returns GameResult)
        const result = engine.handleReconnect(socket.userId);

        // Update engine context
        engine.context = result.state;

        // Process result (history + effects + broadcasting)
        // Process result (history + effects + broadcasting)
        await this.processEngineResult(gameId, result);
      }

      // Check if game is in "waiting" state (not yet started)
      if (context.currentPhase !== "waiting") {
        // Game already started, just join normally
        socket.join(gameId);
        socket.join(`${gameId}-${socket.userId}`);
        const playerContext = engine.getPlayerContext(socket.userId);
        socket.emit("gameState", playerContext);
        return;
      }

      // Track player connection
      // Ensure connection set is initialized if missing (safety)
      if (!this.playerConnections.has(gameId)) {
        this.playerConnections.set(gameId, new Set());
      }
      const connections = this.playerConnections.get(gameId);
      connections.add(socket.userId);

      socket.join(gameId);
      socket.join(`${gameId}-${socket.userId}`);

      // Send current state to player
      const playerContext = engine.getPlayerContext(socket.userId);
      socket.emit("gameState", playerContext);

      // Notify others that player connected
      socket.to(gameId).emit("player-joined", {
        gameId,
        playerId: socket.userId,
      });

      // Check if all real players are connected
      const realPlayers = context.players.filter((p) => !p.isBot);
      const connectedCount = connections.size;
      const totalCount = realPlayers.length;

      // Log the correct count
      Logger.info(
        `[joinGame] Game ${gameId}: ${connectedCount}/${engine.config.maxPlayers} connected`
      );
      const allConnected =
        realPlayers.every((p) => connections.has(p.id)) &&
        realPlayers.length === engine.config.maxPlayers;

      if (allConnected) {
        // GUARD: Check if game is already starting or active
        // This prevents race condition when multiple players connect concurrently
        if (
          engine.startInProgress ||
          engine.context.currentPhase !== "waiting"
        ) {
          Logger.debug(
            `[joinGame] Game already starting/started, skipping duplicate start game=${gameId} phase=${engine.context.currentPhase} startInProgress=${engine.startInProgress}`
          );
          return;
        }

        // Set synchronous flag immediately to prevent concurrent starts
        engine.startInProgress = true;

        Logger.info(
          `[joinGame] All players connected. Starting game... game=${gameId} connected=${connectedCount}/${totalCount}`
        );

        try {
          // Transition from "waiting" to "preflop" using effect-based system
          // Note: No need to import PreflopBetting - engine handles phase transitions internally
          const result = engine.executeTransition("preflop");

          // CRITICAL: Update engine context immediately
          engine.context = result.state;

          // Update game status to "active" in database (non-blocking)
          this.enqueuePersistence(gameId, {
            ...engine.context,
            status: "active",
          });

          // Process result (history + effects + broadcasting)
          await this.processEngineResult(gameId, result);

          // Note: State is already broadcast by processEngineResult above

          // Handle first bot turn if needed
          if (BotManager.isBotTurn(result.state)) {
            this.handleBotTurn(gameId);
          }
        } finally {
          // Cleanup flag after transition completes (or fails)
          engine.startInProgress = false;
        }
      } else {
        Logger.debug(
          `[joinGame] Game ${gameId}: ${connectedCount}/${totalCount} players connected, waiting for more...`
        );
      }
    } catch (error) {
      Logger.error("Error in joinGame:", error);
      this._emitError(socket, "Error joining game");
    }
  }

  /**
   * Get spectator context (sanitized public view of game state)
   * Uses engine's getSpectatorContext method for consistency with player context
   * @private
   * @param {Object} context - Engine context
   * @param {string} [gameId] - Optional game ID to get engine instance
   * @param {TexasHoldemEngine} [engine] - Optional engine instance
   * @returns {Object} Sanitized context for spectators
   */
  _getSpectatorContext(context, gameId = null, engine = null) {
    // Try to get engine instance if not provided
    if (!engine && gameId) {
      engine = this.games.get(gameId);
    }

    // If we have engine, use its method for consistency
    if (engine && typeof engine.getSpectatorContext === "function") {
      return engine.getSpectatorContext();
    }

    // Fallback: use simplified logic (shouldn't happen in normal flow)
    const spectatorContext = JSON.parse(JSON.stringify(context));
    delete spectatorContext.deck;

    if (spectatorContext.players) {
      spectatorContext.players = spectatorContext.players.map((p) => {
        const playerCopy = { ...p };
        if (playerCopy.holeCards) {
          playerCopy.holeCards = playerCopy.holeCards.map(() => "HIDDEN");
          // Handle folded players (empty array if all hidden)
          if (
            playerCopy.folded &&
            playerCopy.holeCards.every((c) => c === "HIDDEN")
          ) {
            playerCopy.holeCards = [];
          }
        }
        return playerCopy;
      });
    }

    if (spectatorContext.communityCards) {
      spectatorContext.communityCards = spectatorContext.communityCards.map(
        (c) => (typeof c === "string" ? c : c.display || c)
      );
    }

    return spectatorContext;
  }

  /**
   * Process engine result - orchestrates the complete flow
   *
   * This is the main entry point for processing engine results in GameManager.
   * It handles the complete flow in a consistent order:
   * 1. Record history (observability - non-blocking)
   * 2. Broadcast events immediately (responsive UI - events sent before effects)
   * 3. Execute effects (core game flow - blocking)
   * 4. Broadcast state after effects (reflects any state changes from effects)
   *
   * @param {string} gameId - Game ID
   * @param {GameResult} result - Result from engine method
   * @param {Object} options - Processing options
   * @param {boolean} options.skipBroadcast - If true, skip broadcasting (default: false)
   */
  async processEngineResult(gameId, result, options = {}) {
    const { skipBroadcast = false } = options;
    let engine;
    try {
      engine = this._getEngineOrFail(gameId, "processEngineResult");
    } catch (error) {
      Logger.warn(
        `[GameManager] Cannot process result: game ${gameId} not found in memory`
      );
      return;
    }

    // 1. Record History (observability - fire-and-forget, non-blocking)
    // Process before effects to capture all events in their original state
    this._recordHistory(gameId, result.events, result.state, engine);

    // 1.5. Handle special events (HOST_CHANGED, PLAYER_MOVED_TO_SPECTATOR, REMOVED players)
    // Check for REMOVED players and send spectator context immediately (before end of hand)
    if (result.state.isPrivate && result.state.players) {
      const removedPlayers = result.state.players.filter(
        (p) => p.status === "REMOVED" && !p.isBot
      );
      for (const player of removedPlayers) {
        // Send spectator context immediately to REMOVED players
        if (this.broadcaster.io) {
          const spectatorContext = this._getSpectatorContext(
            result.state,
            gameId,
            engine
          );
          this.broadcaster.io
            .to(`${gameId}-${player.id}`)
            .emit("gameState", spectatorContext);
          Logger.debug(
            `[GameManager] Sent immediate spectator context to REMOVED player ${player.id} in game ${gameId}`
          );
        }
      }
    }

    if (result.events && result.events.length > 0) {
      for (const event of result.events) {
        if (event.type === "HOST_CHANGED") {
          const newHost = event.payload?.newHost;
          if (newHost) {
            try {
              await supabaseAdmin
                .from("games")
                .update({ host_id: newHost })
                .eq("id", gameId);

              Logger.info(
                `[GameManager] Updated DB host_id for game ${gameId} to ${newHost}`
              );
            } catch (error) {
              Logger.error(
                `[GameManager] Error updating host_id for game ${gameId}:`,
                error
              );
            }
          }
        } else if (event.type === "PLAYER_MOVED_TO_SPECTATOR") {
          // Immediately send spectator context to the moved player
          const playerId = event.payload?.playerId;
          if (playerId && engine && this.broadcaster.io) {
            const spectatorContext = this._getSpectatorContext(
              engine.context,
              gameId,
              engine
            );
            this.broadcaster.io
              .to(`${gameId}-${playerId}`)
              .emit("gameState", spectatorContext);
            Logger.debug(
              `[GameManager] Sent spectator context to moved player ${playerId} in game ${gameId}`
            );

            // Clean up playerConnections if flag is set
            if (event.payload?.shouldRemoveFromConnections) {
              this.playerConnections.get(gameId)?.delete(playerId);
              Logger.debug(
                `[GameManager] Removed ${playerId} from playerConnections for game ${gameId}`
              );
            }
          }
        }
      }
    }

    // 2. Broadcast events IMMEDIATELY (client communication - responsive UI)
    // Events represent what just happened and should be sent to clients right away
    // This ensures UI gets immediate feedback before effects execute
    if (!skipBroadcast) {
      if (result.events && result.events.length > 0) {
        this.broadcaster.emitEvents(gameId, result.events);
      }
      // Note: State broadcast happens after effects in case effects modify state
    }

    // 3. Execute effects (core game flow - blocking, must complete)
    // Effects may modify state, schedule transitions, start timers, etc.
    await this.executor.execute(gameId, result);

    // 4. Broadcast state AFTER effects (in case effects modified state)
    if (!skipBroadcast) {
      this.broadcaster.broadcastState(gameId, engine);
    }
  }

  /**
   * Record game history (fire-and-forget for observability)
   * Errors are logged but do not block game flow
   * @private
   * @param {string} gameId - Game ID
   * @param {Array} events - Events to record
   * @param {Object} state - Current game state
   * @param {TexasHoldemEngine} engine - Engine instance
   */
  _recordHistory(gameId, events, state, engine) {
    this._processHistoryEvents(gameId, events, state, engine).catch((e) =>
      Logger.error(
        `[GameManager] Error processing history events for game ${gameId}:`,
        e
      )
    );
  }

  /**
   * Emit events to Socket.io
   * @param {string} gameId - Game ID
   * @param {Array<GameEvent>} events - Events to emit
   */
  async emitEvents(gameId, events) {
    // Delegate to dedicated broadcaster
    this.broadcaster.emitEvents(gameId, events);
  }

  /**
   * Broadcast game state to all players
   * @param {string} gameId - Game ID
   */
  async broadcastState(gameId) {
    const engine = this.games.get(gameId);
    // Delegate to dedicated broadcaster
    this.broadcaster.broadcastState(gameId, engine);
  }

  /**
   * Handle player action
   * Server-side authority - all actions validated and applied here
   */
  async handleAction(socket, action) {
    // CRITICAL: First line - Log incoming request immediately
    // This proves if the socket event reached the server
    const userId = socket.userId || "unknown";
    Logger.debug(
      `[handleAction] Received action from ${userId}: ${action.type} gameId=${
        action.gameId || "unset"
      } seat=${action.seat || "unset"}`
    );

    let gameId = action.gameId;
    if (!gameId) {
      const rooms = Array.from(socket.rooms);
      gameId = rooms.find((room) => this.games.has(room));
    }

    if (!gameId) {
      Logger.debug(
        `[handleAction] REJECTED: No gameId found for userId=${userId}`
      );
      this._emitError(socket, "Not in a game", true);
      return;
    }

    // PHASE 2 FIX: Wrap logic in Mutex to prevent race conditions
    await this.mutex.runExclusive(gameId, async () => {
      let engine;
      try {
        engine = this._getEngineOrFail(gameId, "handleAction");
      } catch (error) {
        this._emitError(socket, "Game not found", true);
        return;
      }

      const context = engine.context;

      // Step 2: REMOVED activePlayers < 2 guard
      // Trust GameEngine.processAction() to validate actions
      // Players may need to "Check" to trigger end of round or collect pot

      const player = context.players.find((p) => p.id === socket.userId);
      if (!player) {
        Logger.debug(
          `[handleAction] REJECTED: Player not found game=${gameId} userId=${userId}`
        );
        this._emitError(socket, "Not a player in this game", true);
        return;
      }

      if (!action.seat) {
        action.seat = player.seat;
      }

      Logger.debug(
        `[handleAction] Processing action game=${gameId} userId=${userId} action=${action.type} seat=${action.seat} phase=${context.currentPhase}`
      );

      try {
        // Process action - returns GameResult with { state, events, effects }
        const result = engine.processAction(action);

        // CRITICAL: Update the engine's context immediately with the new state
        // This ensures the master reference is updated before any effects are executed
        engine.context = result.state;
        Logger.debug(
          `[handleAction] Updated engine context game=${gameId} newActorSeat=${result.state.currentActorSeat} phase=${result.state.currentPhase}`
        );

        // Handle errors from engine
        const errorEvent = result.events.find((e) => e.type === "ERROR");
        if (errorEvent) {
          const errorMessage =
            errorEvent.payload?.message ||
            errorEvent.data?.message ||
            "Unknown error";
          Logger.debug(
            `[handleAction] Engine returned error game=${gameId} userId=${userId} error=${errorMessage}`
          );
          this._emitError(socket, errorMessage, true);
          return;
        }

        Logger.debug(
          `[handleAction] Action processed successfully game=${gameId} userId=${userId} action=${action.type} effects=${result.effects.length} events=${result.events.length} newActorSeat=${result.state.currentActorSeat}`
        );

        // Process result (history + effects + broadcasting)
        // Note: Broadcasting is handled by processEngineResult
        await this.processEngineResult(gameId, result);

        // Handle bot turn if needed
        const newContext = result.state;
        if (
          newContext.currentPhase !== "showdown" &&
          newContext.currentPhase !== "complete" &&
          BotManager.isBotTurn(newContext)
        ) {
          this.handleBotTurn(gameId);
        }
      } catch (error) {
        // Step 3: Ensure response is sent to client
        Logger.error(
          `[handleAction] ERROR handling action game=${gameId} userId=${userId} action=${action.type}:`,
          error
        );
        this._emitError(
          socket,
          error.message || "Error processing action",
          true
        );
      }
    });
  }

  /**
   * Handle check active session request
   * Checks if player is in an active game and responds immediately
   * Prevents client-side timeouts and crash loops
   * @param {Socket} socket - Socket.io socket instance
   */
  async handleCheckActiveSession(socket) {
    try {
      const userId = socket.userId;
      if (!userId) {
        socket.emit("session_status", { inGame: false, gameId: null });
        return;
      }

      // Check if player is in an active game (in-memory + database fallback)
      const gameId = await this.getPlayerActiveGameId(userId);

      // Emit response immediately
      socket.emit("session_status", {
        inGame: !!gameId,
        gameId: gameId,
      });

      Logger.debug(
        `[CheckSession] User ${userId} active game: ${gameId || "none"}`
      );
    } catch (error) {
      Logger.error(
        `[CheckSession] Error checking active session for user ${socket.userId}:`,
        error
      );
      socket.emit("session_status", { inGame: false, gameId: null });
    }
  }

  /**
   * Handle bot turn
   */
  /**
   * Handle bot turn - Step 1: Detection & Scheduling
   * Triggered after state changes (human action or phase transition)
   * Schedules bot action with tracked timeout to prevent zombies
   */
  handleBotTurn(gameId) {
    const engine = this.games.get(gameId);
    if (!engine) return;

    const context = engine.context;
    if (!BotManager.isBotTurn(context)) return;

    const currentPlayer = context.players.find(
      (p) => p.seat === context.currentActorSeat
    );
    if (!currentPlayer || !currentPlayer.isBot) return;

    // Step A: Schedule & Track
    // Generate bot delay (1-3 seconds)
    const delay = 1000 + Math.random() * 2000;

    // Create the timeout
    const timerId = setTimeout(() => {
      this.executeBotMove(gameId);
    }, delay);

    // Crucial Fix: Store this ID immediately to prevent zombies
    this.botActionTimeouts.set(gameId, timerId);

    Logger.debug(
      `[handleBotTurn] Scheduled bot action for game ${gameId} in ${Math.round(
        delay
      )}ms`
    );
  }

  /**
   * Execute bot move - Step 2: Safe Execution Cycle
   * Called by the scheduled timeout, handles the actual bot action
   * Includes iterative chaining for consecutive bots
   */
  async executeBotMove(gameId) {
    // Cleanup Map: Remove timeout ID first (prevents double execution)
    const timerId = this.botActionTimeouts.get(gameId);
    if (timerId) {
      this.botActionTimeouts.delete(gameId);
    }

    // Mutex Lock: Acquire mutex to ensure thread safety
    await this.mutex.runExclusive(gameId, async () => {
      // Validation: Re-verify game exists and it's still bot's turn
      const engine = this.games.get(gameId);
      if (!engine) return;

      const context = engine.context;
      if (!BotManager.isBotTurn(context)) return;

      const currentPlayer = context.players.find(
        (p) => p.seat === context.currentActorSeat
      );
      if (!currentPlayer || !currentPlayer.isBot) return;

      // CRITICAL: Check if action deadline has expired
      // Bots are subject to the same timeout system as humans
      // If the deadline expired while the bot was waiting, the timeout handler
      // may have already folded the bot. Check deadline before acting.
      if (context.actionDeadline) {
        const deadline = new Date(context.actionDeadline).getTime();
        const now = Date.now();
        if (now > deadline + 1000) {
          // Deadline expired - timeout handler should have already processed this
          // but if we somehow got here, don't act (timeout will handle it)
          Logger.warn(
            `[executeBotMove] Bot action attempted after deadline expired game=${gameId} botId=${
              currentPlayer.id
            } deadline=${new Date(deadline).toISOString()} now=${new Date(
              now
            ).toISOString()}`
          );
          return;
        }
      }

      // Action: Get bot decision and process
      const action = BotManager.makeDecision(context, currentPlayer.id);
      action.seat = currentPlayer.seat;
      action.gameId = gameId;

      Logger.debug(
        `[executeBotMove] Bot ${currentPlayer.id} (Seat ${
          action.seat
        }) decided: ${action.type}${
          action.amount ? ` ${action.amount}` : ""
        } game=${gameId}`
      );

      try {
        // Process action - returns GameResult with { state, events, effects }
        const result = engine.processAction(action);

        // CRITICAL: Update the engine's context immediately with the new state
        engine.context = result.state;

        // Handle errors from engine
        const errorEvent = result.events.find((e) => e.type === "ERROR");
        if (errorEvent) {
          const errorMessage =
            errorEvent.payload?.message ||
            errorEvent.data?.message ||
            "Unknown error";
          Logger.warn(
            `[executeBotMove] Engine returned error for bot action game=${gameId} botId=${currentPlayer.id} error=${errorMessage}`
          );
          return;
        }

        Logger.debug(
          `[executeBotMove] Bot action processed successfully game=${gameId} botId=${currentPlayer.id} action=${action.type} effects=${result.effects.length} events=${result.events.length} newActorSeat=${result.state.currentActorSeat}`
        );

        // Process result (history + effects + broadcasting)
        // Note: Broadcasting is handled by processEngineResult
        await this.processEngineResult(gameId, result);

        // Step C: Iterative Chaining (Handling Consecutive Bots)
        // After bot action is processed, check if next player is also a bot
        const newContext = result.state;
        if (
          newContext.currentPhase !== "showdown" &&
          newContext.currentPhase !== "complete" &&
          BotManager.isBotTurn(newContext)
        ) {
          // Trigger Step A again immediately (creates robust loop)
          this.handleBotTurn(gameId);
        }
      } catch (error) {
        Logger.error(
          `[executeBotMove] Error handling bot action game=${gameId} botId=${currentPlayer.id}:`,
          error
        );
      }
    });
  }

  /**
   * Handle socket disconnect - Temporary disconnect with 60s reconnect window
   * Starts a 60-second timer. If player reconnects, timer is cancelled.
   * If timer expires, executes LEAVE_GAME logic (permanent leave).
   * Also handles spectator disconnects (removes them immediately).
   * @param {string} userId - User ID of disconnected player
   */
  async handleSocketDisconnect(userId) {
    for (const [gameId, engine] of this.games) {
      const context = engine?.context;
      if (!context || !Array.isArray(context.players)) {
        continue;
      }

      // Guard clause: If game is already finished, just return silently
      // Do NOT trigger any disconnect logic
      if (context.status === "finished" || context.status === "complete") {
        Logger.debug(
          `[disconnect] Game already finished, ignoring disconnect game=${gameId} user=${userId} status=${context.status}`
        );
        continue;
      }

      const player = context.players.find((p) => p.id === userId && !p.isBot);

      // Handle spectator disconnect (for private games)
      if (!player && context.isPrivate && context.spectators) {
        const isSpectator = context.spectators.some((s) => s.userId === userId);
        if (isSpectator) {
          Logger.info(
            `[disconnect] Spectator ${userId} disconnected from private game ${gameId}, removing from spectators`
          );
          // Call engine's handleDisconnect which will remove the spectator
          const result = engine.handleDisconnect(userId);
          engine.context = result.state;
          await this.processEngineResult(gameId, result);
          continue; // Skip player disconnect logic
        }
      }

      if (!player) continue;

      // Skip if player is already LEFT or REMOVED (explicitly left/removed, cannot reconnect)
      if (player.status === "LEFT" || player.status === "REMOVED") {
        continue;
      }

      Logger.info(
        `[disconnect] Player ${userId} socket disconnected in game ${gameId}, starting 60s reconnect timer`
      );

      // Use engine's handleDisconnect method (returns GameResult)
      const result = engine.handleDisconnect(userId);

      // Update engine context
      engine.context = result.state;

      // Process result (history + effects + broadcasting)
      await this.processEngineResult(gameId, result);

      // Broadcast updated state
      // Note: State is already broadcast by processEngineResult above
    }
  }

  /**
   * Cancel reconnect timer for a player (called when they reconnect)
   * @param {string} userId - User ID
   */
  cancelReconnectTimer(userId) {
    const timerData = this.reconnectTimers.get(userId);
    if (timerData) {
      clearTimeout(timerData.timeout);
      this.reconnectTimers.delete(userId);
      Logger.info(
        `[reconnect] Cancelled reconnect timer for player ${userId} in game ${timerData.gameId}`
      );
    }
  }

  /**
   * Delay helper function
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise}
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Helper: Payout chips to a player via RPC
   * @private
   * @param {string} userId - User ID
   * @param {number} amount - Amount to payout
   */
  async _payoutPlayer(userId, amount) {
    if (amount <= 0) return;

    try {
      const { error } = await supabaseAdmin.rpc("payout_chips", {
        user_id: userId,
        amount: amount,
      });

      if (error) throw error;

      Logger.info(`[Payout] Returned ${amount} chips to player ${userId}`);
    } catch (err) {
      Logger.error(`[Payout] Failed to return chips to ${userId}:`, err);
      // CRITICAL: In production, this should likely enqueue a retry job
    }
  }

  /**
   * Evaluate game state after player disconnect
   * Handles hand runout logic when only 1 active player remains
   * @param {string} gameId - Game ID
   */
  async evaluateGameState(gameId) {
    const engine = this.games.get(gameId);
    if (!engine) return;

    // Use engine's evaluateGame method to handle all game flow logic
    const effects = engine.evaluateGame(true);

    // Execute effects and broadcast state
    const result = {
      state: engine.context,
      effects,
      events: [],
    };

    // Process result (history + effects + broadcasting)
    // Note: Broadcasting is handled by processEngineResult
    await this.processEngineResult(gameId, result);
  }

  /**
   * Force fold for timed-out player
   */
  async forceFold(gameId, userId) {
    try {
      const engine = this._getEngineOrFail(gameId, "forceFold");

      Logger.info(
        `[GameManager] Forcing fold for player ${userId} in game ${gameId}`
      );
      // 1. Find player seat
      const player = engine.context.players.find((p) => p.id === userId);
      if (!player) {
        Logger.error(`[forceFold] Player ${userId} not found`);
        return;
      }

      // 2. Create & Process Action
      const action = { type: "fold", seat: player.seat };
      const result = engine.processAction(action);

      // 3. Update State & Execute Effects
      engine.context = result.state;

      // Process result (history + effects + broadcasting)
      // Note: Broadcasting is handled by processEngineResult
      await this.processEngineResult(gameId, result);
    } catch (error) {
      Logger.error(`Error forcing fold in game ${gameId}:`, error);
    }
  }

  /**
   * Enqueue a persistence job (non-blocking)
   */
  enqueuePersistence(gameId, state) {
    this.persistenceQueue.push({
      gameId,
      state,
      attempts: 0,
    });
  }

  /**
   * Handle a PERSIST effect from the engine:
   * - Immediately broadcast latest state
   * - Enqueue Supabase update in background
   */
  handlePersistEffect(gameId, state) {
    const engine = this.games.get(gameId);
    if (engine) {
      // Ensure engine.context is in sync
      engine.context = state;
      // Fire-and-forget broadcast (do not await)
      this.broadcastState(gameId);
    }

    this.enqueuePersistence(gameId, state);
  }

  /**
   * Get game engine instance
   * Public method for EffectExecutor to access games
   * @param {string} gameId - Game ID
   * @returns {GameEngine|null} Engine instance or null
   */
  getGame(gameId) {
    return this.games.get(gameId) || null;
  }

  /**
   * Set transition timer for a game
   * Public method for EffectExecutor to manage timers
   * @param {string} gameId - Game ID
   * @param {NodeJS.Timeout} timeout - Timeout object
   */
  setTransitionTimer(gameId, timeout) {
    const timerKey = `transition_${gameId}`;
    this.timeoutIntervals.set(timerKey, timeout);
  }

  /**
   * Clear transition timer for a game
   * Public method for EffectExecutor to manage timers
   * @param {string} gameId - Game ID
   * @returns {boolean} True if timer was cleared
   */
  clearTransitionTimer(gameId) {
    const timerKey = `transition_${gameId}`;
    const existing = this.timeoutIntervals.get(timerKey);
    if (existing) {
      clearTimeout(existing);
      this.timeoutIntervals.delete(timerKey);
      Logger.debug(`[GameManager] Cleared transition timer for game ${gameId}`);
      return true;
    }
    return false;
  }

  /**
   * Set reconnect timer for a player
   * Public method for EffectExecutor to manage reconnect timers
   * @param {string} userId - User ID
   * @param {Object} timerData - Timer data { gameId, timeout }
   */
  setReconnectTimer(userId, timerData) {
    this.reconnectTimers.set(userId, timerData);
  }

  /**
   * Get reconnect timer for a player
   * Public method for EffectExecutor to access reconnect timers
   * @param {string} userId - User ID
   * @returns {Object|null} Timer data or null
   */
  getReconnectTimer(userId) {
    return this.reconnectTimers.get(userId) || null;
  }

  /**
   * Clear reconnect timer for a player
   * Public method for EffectExecutor to manage reconnect timers
   * @param {string} userId - User ID
   * @returns {boolean} True if timer was cleared
   */
  clearReconnectTimer(userId) {
    const timerData = this.reconnectTimers.get(userId);
    if (timerData) {
      clearTimeout(timerData.timeout);
      this.reconnectTimers.delete(userId);
      return true;
    }
    return false;
  }

  /**
   * Handle reconnect timer expiration
   * Called when a player's reconnect timer expires
   * This encapsulates the business logic of handling player leave
   * @param {string} gameId - Game ID
   * @param {string} userId - User ID
   */
  async handleReconnectTimerExpired(gameId, userId) {
    // Delegate to handleLeaveGame which contains all the business logic
    await this.handleLeaveGame(gameId, userId);
  }

  /**
   * Handle transition completion - executes transition and processes results
   * Called by EffectExecutor when a scheduled transition fires
   * This eliminates recursive processEngineResult() calls
   * @param {string} gameId - Game ID
   * @param {string} targetPhase - Target phase to transition to
   */
  async handleTransitionComplete(gameId, targetPhase) {
    const engine = this._getEngineOrFail(gameId, "handleTransitionCompletion");

    Logger.debug(
      `[GameManager] Handling transition completion to ${targetPhase} for game ${gameId}`
    );

    try {
      // Execute transition via engine
      const result = engine.executeTransition(targetPhase);
      engine.context = result.state;

      // Process result (history + effects + broadcasting)
      // This handles history recording, effect execution, and client broadcasting
      // This is the ONLY place processEngineResult should be called for transitions
      // Note: Engine controls timing via SCHEDULE_TRANSITION effect's delayMs property
      await this.processEngineResult(gameId, result);

      // Check for bot turn after transition
      const newContext = result.state;
      if (
        newContext.currentPhase !== "showdown" &&
        newContext.currentPhase !== "complete" &&
        BotManager.isBotTurn(newContext)
      ) {
        this.handleBotTurn(gameId);
      }
    } catch (err) {
      Logger.error(
        `[GameManager] Error handling transition completion for game ${gameId}:`,
        err
      );
    }
  }

  /**
   * Stop game timers
   * Only clears transition timers (timeouts), not the global ticker
   */
  stopGameTimers(gameId) {
    // Only clear transition timers (timeouts), not the global ticker
    const transitionTimer = this.timeoutIntervals.get(`transition_${gameId}`);
    if (transitionTimer) {
      clearTimeout(transitionTimer);
      this.timeoutIntervals.delete(`transition_${gameId}`);
      Logger.debug(`[GameManager] Cleared transition timer for game ${gameId}`);
    }

    // Action timers are handled by global ticker, no specific interval to clear

    // Step 3: The Cleanup Guard - Clear bot action timeout
    // NEW: Cleanup for bot timers (prevents zombie actions)
    if (this.botActionTimeouts.has(gameId)) {
      clearTimeout(this.botActionTimeouts.get(gameId));
      this.botActionTimeouts.delete(gameId);
      Logger.debug(
        `[stopGameTimers] Cleared bot action timeout for game ${gameId}`
      );
    }

    // Clear reconnect timers for all players in this game
    const engine = this.games.get(gameId);
    if (engine) {
      for (const player of engine.context.players) {
        if (!player.isBot) {
          this.cancelReconnectTimer(player.id);
        }
      }
    }
  }

  /**
   * Close a stale game due to inactivity:
   * - Mark as finished in database (via async persistence)
   * - Emit "game_closed" event to any idle sockets
   * - Clear from memory and stop timers
   * - FREE UP join_code for reuse
   */
  async closeInactiveGame(gameId, reason = "Game closed due to inactivity") {
    const engine = this.games.get(gameId);
    if (!engine) return;

    const context = engine.context;

    // FREE UP CODE FOR REUSE: Set join_code to NULL explicitly
    // This ensures immediate recycling, not dependent on persistence queue
    await supabaseAdmin
      .from("games")
      .update({ 
        status: "finished",
        join_code: null // <--- FREE UP CODE FOR REUSE
      })
      .eq("id", gameId);

    // Use unified finalize method
    await this.finalizeGameEnd(
      gameId,
      {
        reason,
        winnerId: null,
      },
      context
    );

    // Additional cleanup specific to inactive game closure
    this.playerConnections.delete(gameId);
  }

  /**
   * Process game events for Hand History recording
   * Fire-and-forget (non-blocking)
   * @param {string} gameId - Game ID
   * @param {Array} events - Events from engine
   * @param {Object} state - Current game state
   * @param {TexasHoldemEngine} engine - Engine instance (for variantType)
   */
  async _processHistoryEvents(gameId, events, state, engine) {
    if (!events || events.length === 0) return;

    let service = this.historyServices.get(gameId);
    // Lazy Init: Create service if missing
    if (!service) {
      service = new HandHistoryService();
      // Use engine.variantType (e.g., 'six_max', 'heads_up') instead of state.type ('holdem')
      const gameType = engine?.variantType || state.type || "six_max";
      service.setGame(gameId, gameType);
      this.historyServices.set(gameId, service);
    }

    let handEnded = false;
    let roundPot = 0;
    let primaryWinnerId = null;

    for (const event of events) {
      try {
        switch (event.type) {
          case "DEAL_STREET":
            if (event.payload.street === "preflop") {
              // Start New Hand
              const historyPlayers = state.players
                .filter(
                  (p) =>
                    !p.folded && p.status !== "LEFT" && p.status !== "REMOVED"
                )
                .map((p) => ({
                  id: p.id,
                  seat: p.seat,
                  holeCards: p.holeCards || [],
                }));

              // Skip hand recording if fewer than 2 players (game ending scenario)
              if (historyPlayers.length < 2) {
                Logger.debug(
                  `[History] Skipping hand recording: only ${historyPlayers.length} player(s) remaining (game likely ending)`
                );
                break;
              }

              // Construct config from state (sb, bb, ante, buyIn, buttonSeat)
              const handConfig = {
                sb: state.smallBlind || state.config?.blinds?.small || 0,
                bb: state.bigBlind || state.config?.blinds?.big || 0,
                ante: 0, // Antes not currently supported, but can be added
                buyIn: state.buyIn || state.config?.buyIn || 0,
                buttonSeat: state.buttonSeat, // Explicitly track dealer button
              };

              const gameType = engine?.variantType || state.type || "six_max";
              service.startHand(
                state.handNumber || 0,
                historyPlayers,
                handConfig,
                gameType
              );

              // Record starting stacks if provided in event payload
              if (
                event.payload.startingStacks &&
                event.payload.startingStacks.length > 0
              ) {
                service.recordStartingStacks(event.payload.startingStacks);
              }
            } else {
              // Street Change & Board
              service.recordStreetChange(event.payload.street);
              if (event.payload.cards && event.payload.cards.length > 0) {
                service.recordBoard(event.payload.cards);
              }
            }
            break;

          case "PLAYER_ACTION":
            const { seat, action, amount, index } = event.payload;
            if (action === "post_small_blind") {
              service.recordSmallBlind(seat, amount);
            } else if (action === "post_big_blind") {
              service.recordBigBlind(seat, amount);
            } else if (action === "reveal") {
              // Handle card reveal (showdown)
              const player = state.players.find((p) => p.seat === seat);
              if (player && player.holeCards) {
                // If index is provided, reveal specific card; otherwise reveal all
                if (index !== undefined && player.holeCards[index]) {
                  service.recordShowdown(seat, [player.holeCards[index]]);
                } else {
                  // Reveal all hole cards
                  service.recordShowdown(seat, player.holeCards);
                }
              }
            } else {
              // Regular action (fold, check, call, bet, raise, allin)
              // Only pass amount for monetary actions (call, bet, raise, allin)
              // Non-monetary actions (fold, check) should not have amount
              const isMonetaryAction = [
                "call",
                "bet",
                "raise",
                "allin",
              ].includes(action.toLowerCase());
              service.recordAction(
                seat,
                action,
                isMonetaryAction ? amount : undefined
              );
            }
            break;

          case "WIN_POT":
            // 1. FIX: Explicitly record showdown cards for the winner
            const winner = state.players.find(
              (p) => p.seat === event.payload.seat
            );

            // Only force reveal if it's a contested showdown (>1 active player)
            // This prevents revealing mucked cards in uncontested wins
            const activePlayerCount = state.players.filter(
              (p) => !p.folded && p.status !== "LEFT" && p.status !== "REMOVED"
            ).length;
            if (
              activePlayerCount > 1 &&
              winner &&
              winner.holeCards &&
              winner.holeCards.length > 0
            ) {
              service.recordShowdown(event.payload.seat, winner.holeCards);
            }

            service.recordWin(
              event.payload.seat,
              event.payload.amount,
              event.payload.potIndex || 0
            );

            // Track pot totals
            handEnded = true;
            roundPot += event.payload.amount || 0;

            // 2. FIX: Handle Split Pots correctly
            // If this is the main pot (0)
            if (
              event.payload.potIndex === 0 ||
              event.payload.potIndex === undefined
            ) {
              if (!primaryWinnerId) {
                // First winner found for main pot
                if (winner) primaryWinnerId = winner.id;
              } else if (winner && primaryWinnerId !== winner.id) {
                // Second DIFFERENT winner found for main pot -> It's a SPLIT pot
                primaryWinnerId = null;
              }
            }
            break;
        }
      } catch (err) {
        Logger.error(
          `[History] Error processing event ${event.type} for game ${gameId}:`,
          err
        );
      }
    }

    // If we detected payouts, close the hand immediately
    // This ensures we save the record before the 'complete' phase wipes the state
    if (handEnded && service.isRecording()) {
      // Calculate total pot from all pots if roundPot seems incomplete
      // (This handles cases where WIN_POT events might not capture all pots)
      const totalPot =
        state.pots?.reduce((sum, pot) => sum + (pot.amount || 0), 0) ||
        roundPot;

      // Get VPIP/PFR stats from the recorder
      const actionStats = service.getHandStats();

      // Calculate hand stats from state.players (final stacks after showdown distribution)
      const handStats = {
        stats: state.players.reduce((acc, p) => {
          if (p.id && !p.isBot) {
            // Only record real players, exclude bots
            const pStats = actionStats[p.id] || { vpip: false, pfr: false };
            acc[p.id] = {
              chips: p.chips || 0,
              vpip: pStats.vpip,
              pfr: pStats.pfr,
            };
          }
          return acc;
        }, {}),
      };

      await service.endHand(primaryWinnerId, totalPot || roundPot, handStats);
    }
  }
}

export const gameManager = new GameManager();
