/**
 * QueueManager - In-memory queue manager with Supabase backup
 * - Maintains an in-memory Map of queued players (per process)
 * - Uses MatchMakingService to decide when a game can start
 * - Creates games via GameManager and emits socket events when matches are found
 */

import { supabaseAdmin } from "../../../infrastructure/database/supabaseClient.js";
import { gameManager } from "./GameManager.js";
import { BotManager } from "../bots/BotManager.js";
import { MatchMakingService } from "./MatchMakingService.js";
import { Logger } from "../../../shared/utils/Logger.js";
import { variantRegistry } from "../config/VariantRegistry.js";

// Initialize global lock set if not exists
// This ensures a true singleton lock shared across all instances and module loads
if (!global.QUEUE_CREATION_LOCKS) {
  global.QUEUE_CREATION_LOCKS = new Set();
}

export class QueueManager {
  /**
   * In-memory queue state
   * Map<userId, { socketId, queueType, joinedAt, isBot? }>
   */
  queue = new Map();

  /**
   * Socket.io instance (set from server)
   */
  io = null;

  /**
   * Keep matchmaking interval reference so it can be cleared if needed
   */
  matchmakingInterval = null;

  /**
   * Keep timeout checker interval reference so it can be cleared if needed
   */
  timeoutCheckerInterval = null;

  /**
   * Optional: Realtime channel (no longer used for matchmaking, kept for future if needed)
   */
  queueChannel = null;

  /**
   * Initialize - load queues from database, start matchmaking & timeout checkers
   */
  async init() {
    await this.loadQueues(); // Restore queue entries from database on startup
    this.startMatchmakingLoop();
    this.startTimeoutChecker();
  }

  /**
   * Set Socket.io instance for emitting events
   */
  setIO(io) {
    this.io = io;
  }

  /**
   * Load existing queue entries from database on startup
   * Preserves queue position/timestamp for players waiting across restarts
   */
  async loadQueues() {
    try {
      const { data, error } = await supabaseAdmin
        .from("queue")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;

      if (data) {
        let restoredCount = 0;
        for (const entry of data) {
          // VALIDATION: Skip if queue type is not in registry (e.g. deactivated variant)
          if (!variantRegistry.getVariant(entry.queue_type)) {
            Logger.warn(
              `[QueueManager] Skipping stale queue entry for invalid type: ${entry.queue_type}`
            );
            // Optionally: Clean up invalid entry from DB here
            continue;
          }

          this.queue.set(entry.user_id, {
            socketId: null, // Will be updated on reconnect
            queueType: entry.queue_type,
            joinedAt: new Date(entry.created_at).getTime(),
            isBot: entry.user_id.startsWith("bot-"),
          });
          restoredCount++;
        }
        Logger.info(
          `[QueueManager] Restored ${restoredCount} players to matchmaking queues`
        );
      }
    } catch (error) {
      Logger.error("[QueueManager] Error loading queues:", error);
    }
  }

  /**
   * Start the matchmaking loop
   * Checks all active queues periodically to see if a game can be started
   * NOTE: This is a safety net - primary matchmaking is event-driven (on join_queue / bot fill)
   */
  startMatchmakingLoop() {
    if (this.matchmakingInterval) clearInterval(this.matchmakingInterval);

    Logger.info(
      "[QueueManager] Starting dynamic matchmaking loop (20s safety net)"
    );

    this.matchmakingInterval = setInterval(() => {
      // DYNAMIC: Iterate over all active variants from registry
      const variants = variantRegistry.getAllVariants();
      for (const variant of variants) {
        this.checkAndStartGame(variant.slug);
      }
    }, 20000); // 20 seconds - safety net only, primary matchmaking is event-driven
  }

  /**
   * Add player to matchmaking queue
   * @param {string} userId - Player User ID
   * @param {string} socketId - Player Socket ID
   * @param {string} queueType - Game variant slug (e.g. 'six_max')
   */
  async joinQueue(userId, socketId, queueType) {
    // 1. Validate Queue Type against Registry
    // DIAGNOSTIC LOG BEFORE LOOKUP (using INFO so it shows up):
    Logger.info(
      `[QueueManager] Looking up variant '${queueType}' in registry. Registry size: ${
        variantRegistry.getAllVariants().length
      }`
    );

    const variant = variantRegistry.getVariant(queueType);
    if (!variant) {
      const allVariants = variantRegistry.getAllVariants();
      const availableVariants = allVariants.map((v) => v.slug).join(", ");
      Logger.warn(
        `[QueueManager] Invalid queue type requested: '${queueType}'. Available variants: [${availableVariants}]. Registry size: ${allVariants.length}`
      );
      if (this.io) {
        this.io.to(socketId).emit("error", { message: "Invalid game mode" });
      }
      return;
    }

    // 2. VALIDATION: Check User Balance (skip for bots and free games)
    // We verify funds *before* queueing to prevent wasting time matching broke players
    // Only check balance if game costs money (buyIn > 0)
    const isBot = userId.startsWith("bot-");
    const buyIn = variant.config.buyIn || 0;

    if (!isBot && buyIn > 0) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("chips")
        .eq("id", userId)
        .single();

      if (profileError || !profile) {
        Logger.error(
          `[QueueManager] Failed to fetch profile for ${userId}:`,
          profileError
        );
        if (this.io) {
          this.io.to(socketId).emit("error", {
            message: "Failed to fetch profile. Please try again.",
          });
        }
        return;
      }

      if (profile.chips < buyIn) {
        Logger.warn(
          `[QueueManager] Player ${userId} rejected: Insufficient funds (${profile.chips} < ${buyIn})`
        );
        if (this.io) {
          this.io.to(socketId).emit("error", {
            message: `Insufficient chips. You need ${buyIn} chips to join this game.`,
          });
        }
        return;
      }
    }

    // 2.5. Check if user is already in an active game
    const activeGameId = await gameManager.getPlayerActiveGameId(userId);
    if (activeGameId) {
      Logger.warn(
        `[QueueManager] Player ${userId} rejected: Already in game ${activeGameId}`
      );
      if (this.io) {
        this.io.to(socketId).emit("error", {
          message: "You are already in a game.",
        });
      }
      return;
    }

    Logger.info(
      `[QueueManager] Player ${userId} joining queue ${queueType} (Socket: ${socketId})`
    );

    // 3. Check if already in queue
    const existing = this.queue.get(userId);
    let joinedAt = Date.now();

    if (existing) {
      if (existing.queueType === queueType) {
        Logger.debug(
          `[QueueManager] Player ${userId} re-joining same queue ${queueType}. Preserving position.`
        );
        joinedAt = existing.joinedAt; // Preserve priority
      } else {
        Logger.debug(
          `[QueueManager] Player ${userId} switching queues (${existing.queueType} -> ${queueType})`
        );
        // Switching queues resets priority
      }
    }

    // 4. Add/Update in-memory queue
    this.queue.set(userId, {
      socketId,
      queueType,
      joinedAt,
      isBot,
    });

    // 5. Update Database (Non-blocking backup)
    // We use upsert to handle both new joins and updates
    (async () => {
      try {
        const { error } = await supabaseAdmin.from("queue").upsert(
          {
            user_id: userId,
            queue_type: queueType,
            created_at: new Date(joinedAt).toISOString(),
          },
          {
            onConflict: "user_id",
          }
        );

        if (error) throw error;
        Logger.debug(
          `[QueueManager] Successfully persisted queue entry for ${userId} (${queueType})`
        );
      } catch (err) {
        Logger.error(
          `[QueueManager] Failed to persist queue entry for ${userId}:`,
          err
        );
      }
    })();

    // 6. Confirm Join to Client
    if (this.io) {
      this.io.to(socketId).emit("queue_update", {
        queueType,
        status: "joined",
      });
      Logger.debug(
        `[QueueManager] Emitted queue_update to ${userId} (socket: ${socketId}) for ${queueType}`
      );
    } else {
      Logger.warn(
        `[QueueManager] Cannot emit queue_update: io instance is null`
      );
    }

    // 7. Broadcast Queue Status to this pool
    Logger.debug(`[QueueManager] Broadcasting queue status for ${queueType}`);
    this.broadcastQueueStatus(queueType);

    // 8. Trigger Matchmaking
    Logger.debug(`[QueueManager] Triggering matchmaking for ${queueType}`);
    this.checkAndStartGame(queueType).catch((err) => {
      Logger.error(
        `[QueueManager] Error in checkAndStartGame for ${queueType} after joinQueue:`,
        err
      );
    });
  }

  /**
   * Explicit leave queue (optional, not required by disconnect)
   */
  async leaveQueue(userId) {
    const entry = this.queue.get(userId);
    if (!entry) return;

    const queueType = entry.queueType;
    this.queue.delete(userId);

    // Broadcast updated queue status to all remaining waiting players
    this.broadcastQueueStatus(queueType);

    // Best-effort cleanup in Supabase backup
    try {
      const { error } = await supabaseAdmin
        .from("queue")
        .delete()
        .eq("user_id", userId);
      if (error) {
        Logger.error(
          `[QueueManager] Error removing user ${userId} from Supabase backup queue:`,
          error
        );
      }
    } catch (err) {
      Logger.error(
        `[QueueManager] Unexpected error removing user ${userId} from Supabase backup queue:`,
        err
      );
    }
  }

  /**
   * Get a snapshot of the in-memory queue for a given type
   * Returns array of { user_id, created_at }
   */
  getQueueSnapshot(type) {
    const snapshot = [];

    for (const [userId, entry] of this.queue.entries()) {
      if (entry.queueType === type) {
        snapshot.push({
          user_id: userId,
          created_at: new Date(entry.joinedAt).toISOString(),
        });
      }
    }

    // Order by created_at (joinedAt)
    snapshot.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    return snapshot;
  }

  /**
   * Broadcast queue status to all waiting players in a queue
   * Sends real-time updates on queue count and how many players are needed
   * @param {string} queueType - Queue type to broadcast status for
   */
  broadcastQueueStatus(queueType) {
    if (!this.io) {
      Logger.debug(
        `[QueueManager] Cannot broadcast queue status: io instance is null for ${queueType}`
      );
      return;
    }

    const snapshot = this.getQueueSnapshot(queueType);
    const count = snapshot.length;
    const config = this.getQueueConfig(queueType);

    // FIX: Add null check to prevent crash
    if (!config) {
      Logger.warn(
        `[QueueManager] Cannot broadcast status for invalid queue type: ${queueType}`
      );
      return;
    }

    const needed = Math.max(0, config.minPlayers - count);

    Logger.debug(
      `[QueueManager] Broadcasting queue status for ${queueType}: ${count}/${config.minPlayers} players, ${needed} needed`
    );

    // Iterate through queued users and send update
    let emittedCount = 0;
    for (const [userId, entry] of this.queue.entries()) {
      if (entry.queueType === queueType && entry.socketId) {
        this.io.to(entry.socketId).emit("queue_info", {
          queueType,
          count,
          needed,
          target: config.minPlayers,
        });
        emittedCount++;
        Logger.debug(
          `[QueueManager] Emitted queue_info to ${userId} (socket: ${entry.socketId}) for ${queueType}`
        );
      } else if (entry.queueType === queueType && !entry.socketId) {
        Logger.debug(
          `[QueueManager] Skipping ${userId} - no socketId for queue ${queueType}`
        );
      }
    }

    Logger.debug(
      `[QueueManager] Queue status broadcast complete for ${queueType}: ${emittedCount} event(s) emitted`
    );
  }

  /**
   * Check in-memory queue and start game if threshold reached
   * Uses MatchMakingService to decide if game can start
   * Uses a global synchronous Set-based lock to prevent concurrent
   * game creation across all instances and module loads in the Node process
   */
  async checkAndStartGame(type) {
    try {
      // Fast pre-check without lock to avoid unnecessary churn
      const queueSnapshot = this.getQueueSnapshot(type);
      if (!queueSnapshot || queueSnapshot.length === 0) {
        Logger.debug(
          `[QueueManager] checkAndStartGame: No players in queue for ${type}`
        );
        return;
      }

      // Get required player count from config
      const config = this.getQueueConfig(type);
      if (!config) {
        Logger.warn(
          `[QueueManager] checkAndStartGame: Invalid variant config for ${type}`
        );
        return; // Invalid variant
      }
      const requiredPlayers = config.minPlayers;

      Logger.debug(
        `[QueueManager] checkAndStartGame: ${queueSnapshot.length}/${requiredPlayers} players in ${type} queue`
      );

      if (queueSnapshot.length < requiredPlayers) {
        Logger.debug(
          `[QueueManager] checkAndStartGame: Not enough players (${queueSnapshot.length} < ${requiredPlayers}) for ${type}, waiting for more`
        );
        return;
      }

      // 1. GLOBAL Synchronous Lock Check (per-process only)
      if (global.QUEUE_CREATION_LOCKS.has(type)) {
        Logger.debug(
          `[QueueManager] Creation already in progress for ${type} (Global Lock), skipping.`
        );
        return;
      }

      // 2. Acquire Global Lock
      global.QUEUE_CREATION_LOCKS.add(type);
      Logger.debug(`[QueueManager] Acquired global lock for ${type}`);

      // Proceed with game creation
      await this._executeGameCreation(type, queueSnapshot);
    } catch (error) {
      Logger.error(`Error in checkAndStartGame for ${type}:`, error);
    } finally {
      // 3. Release Global Lock (Always)
      if (global.QUEUE_CREATION_LOCKS.has(type)) {
        global.QUEUE_CREATION_LOCKS.delete(type);
        Logger.debug(`[QueueManager] Released global lock for ${type}`);
      }
    }
  }

  /**
   * Internal method to execute game creation (protected by lock)
   * @param {string} type
   * @param {Array<{user_id: string, created_at: string}>} queueSnapshot
   */
  async _executeGameCreation(type, queueSnapshot) {
    try {
      if (!queueSnapshot || queueSnapshot.length === 0) {
        return;
      }

      Logger.debug(
        `🔍 Checking ${type} queue (in-memory): ${queueSnapshot.length} player(s) in queue`
      );

      // Check if any of these players are already in a game
      // This prevents creating duplicate games if players are already matched
      const playerIds = queueSnapshot.map((row) => row.user_id);
      for (const playerId of playerIds) {
        const activeGameId = await gameManager.getPlayerActiveGameId(playerId);
        if (activeGameId) {
          // Player is already in a game, skip game creation
          Logger.debug(
            `⏸️ Player ${playerId} is already in game ${activeGameId}, skipping game creation`
          );
          return;
        }
      }

      // Use MatchMakingService to decide if game can start
      const matchResult = MatchMakingService.canStartGame(type, queueSnapshot);

      Logger.debug(`🎯 Matchmaking result for ${type}:`, matchResult);

      if (matchResult && matchResult.canStart) {
        // Ensure all players are still present in in-memory queue
        for (const playerId of matchResult.playerIds) {
          const entry = this.queue.get(playerId);
          if (!entry || entry.queueType !== type) {
            Logger.warn(
              `⚠️ Player ${playerId} no longer in in-memory queue for ${type}, aborting game creation`
            );
            return;
          }
        }

        // Double-check in Supabase backup (best-effort, not used as source of truth)
        const { data: verifyQueue, error: verifyError } = await supabaseAdmin
          .from("queue")
          .select("user_id")
          .eq("queue_type", type)
          .in("user_id", matchResult.playerIds);

        if (
          verifyError ||
          !verifyQueue ||
          verifyQueue.length !== matchResult.playerIds.length
        ) {
          Logger.warn(
            `⚠️ Verification against Supabase backup failed: expected ${
              matchResult.playerIds.length
            } players, found ${verifyQueue?.length || 0}`
          );
          return;
        }

        // Final check: Verify players are not already in games (double-check after verification)
        // This handles the case where another process created a game between our checks
        for (const playerId of matchResult.playerIds) {
          const activeGameId = await gameManager.getPlayerActiveGameId(
            playerId
          );
          if (activeGameId) {
            // Player is already in a game, skip game creation
            Logger.debug(
              `⏸️ Player ${playerId} is already in game ${activeGameId} (final check), skipping game creation`
            );
            return;
          }
        }

        Logger.info(
          `✅ All checks passed, starting game from queue for ${type} with players:`,
          matchResult.playerIds
        );

        // Atomically lock queue, deduct chips, and get game ID via RPC
        // The RPC handles atomic operations but does NOT create the game record
        const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
          "start_game_from_queue",
          {
            p_queue_type: type,
            p_player_ids: matchResult.playerIds,
          }
        );

        if (rpcError || !rpcData) {
          Logger.error(
            "[QueueManager] start_game_from_queue RPC failed or returned NULL, releasing players locally:",
            rpcError
          );

          // If RPC returns NULL, another instance likely claimed these players.
          // Remove them from local in-memory queue to avoid stale entries.
          for (const playerId of matchResult.playerIds) {
            this.queue.delete(playerId);
          }

          return;
        }

        const newGameId = Array.isArray(rpcData) ? rpcData[0] : rpcData;

        // Now create the game properly with usernames (same pattern as private games)
        // This ensures usernames are fetched from profiles table
        try {
          Logger.info(
            `[QueueManager] Creating game ${newGameId} with usernames for players: ${matchResult.playerIds.join(
              ", "
            )}`
          );
          await gameManager.createGame(type, matchResult.playerIds, newGameId);
          Logger.info(
            `[QueueManager] Successfully created game ${newGameId} with proper usernames`
          );
        } catch (createError) {
          Logger.error(
            `[QueueManager] Error creating game ${newGameId} after RPC:`,
            createError
          );
          // If game creation fails, players are already removed from queue and chips deducted
          // This is a critical error - game ID was reserved but game creation failed
          // Players should be notified or refunded
          return;
        }

        // Emit match_found event to notify players
        if (newGameId && this.io) {
          for (const playerId of matchResult.playerIds) {
            const entry = this.queue.get(playerId);
            if (!entry || !entry.socketId) continue;

            // Notify client that a match was found
            this.io.to(entry.socketId).emit("match_found", {
              gameId: newGameId,
              queueType: type,
              players: matchResult.playerIds,
            });
          }

          // Remove players from in-memory queue AFTER successful game creation + match_found emitted
          for (const playerId of matchResult.playerIds) {
            this.queue.delete(playerId);
          }
        }
      }
    } catch (error) {
      Logger.error(`Error in _executeGameCreation for ${type}:`, error);
    }
  }

  /**
   * Start timeout checker for bot filling
   */
  startTimeoutChecker() {
    if (this.timeoutCheckerInterval) clearInterval(this.timeoutCheckerInterval);

    this.timeoutCheckerInterval = setInterval(async () => {
      await this.checkTimeouts();
    }, 5000); // Check every 5 seconds
  }

  /**
   * Cleanup method to stop all intervals
   * Call this during graceful shutdown
   */
  stop() {
    if (this.matchmakingInterval) {
      clearInterval(this.matchmakingInterval);
      this.matchmakingInterval = null;
      Logger.info("[QueueManager] Stopped matchmaking loop");
    }

    if (this.timeoutCheckerInterval) {
      clearInterval(this.timeoutCheckerInterval);
      this.timeoutCheckerInterval = null;
      Logger.info("[QueueManager] Stopped timeout checker");
    }
  }

  /**
   * Check in-memory queues and add bots if needed (configurable timeout per variant)
   */
  async checkTimeouts() {
    const enableBotFill = process.env.ENABLE_BOT_FILL !== "false";

    if (!enableBotFill) {
      return;
    }

    try {
      // DYNAMIC: Iterate over all active variants from registry
      const variants = variantRegistry.getAllVariants();

      for (const variant of variants) {
        const queueType = variant.slug;
        const config = this.getQueueConfig(queueType);

        if (!config) {
          continue; // Skip invalid variants
        }

        const queueSnapshot = this.getQueueSnapshot(queueType);
        if (!queueSnapshot || queueSnapshot.length === 0) {
          continue;
        }

        // If queue is not full and has been waiting
        if (
          queueSnapshot.length > 0 &&
          queueSnapshot.length < config.minPlayers
        ) {
          const oldest = new Date(queueSnapshot[0].created_at).getTime();
          const waited = Date.now() - oldest;

          // If waited long enough, add bots
          if (waited >= config.botFillAfter) {
            const needed = config.minPlayers - queueSnapshot.length;
            const botIds = BotManager.getRandomBots(needed);
            for (const botId of botIds) {
              await this.addBotToQueue(queueType, botId);
            }

            // Check and start game after adding bots
            await this.checkAndStartGame(queueType);
          }
        }
      }
    } catch (error) {
      Logger.error("Error in checkTimeouts:", error);
    }
  }

  /**
   * Add a bot to the queue
   * @param {string} queueType - Queue Type
   * @param {string} botId - Bot ID
   */
  async addBotToQueue(queueType, botId) {
    // VALIDATION: Ensure variant exists
    if (!variantRegistry.getVariant(queueType)) {
      Logger.error(
        `[QueueManager] Cannot add bot to invalid queue type: ${queueType}`
      );
      return;
    }

    const userId = `bot-${botId}`;
    this.queue.set(userId, {
      socketId: "bot",
      queueType,
      joinedAt: Date.now(),
      isBot: true,
    });

    // Trigger matchmaking immediately for bots
    this.checkAndStartGame(queueType);
  }

  /**
   * Handle disconnect
   */
  async handleDisconnect(userId, socketId) {
    const entry = this.queue.get(userId);
    if (!entry) return;

    // Only remove if the socketId matches the one we stored.
    // This prevents race conditions with reconnection.
    if (entry.socketId && entry.socketId === socketId) {
      await this.leaveQueue(userId);
    }
  }

  /**
   * Handle check queue status request
   * Allows frontend to query if user is currently in a queue
   * @param {Socket} socket - Socket.io socket instance
   */
  handleCheckQueueStatus(socket) {
    const userId = socket.userId;
    const entry = this.queue.get(userId);
    if (entry) {
      socket.emit("queue_status", {
        inQueue: true,
        queueType: entry.queueType,
      });
    } else {
      socket.emit("queue_status", {
        inQueue: false,
        queueType: null,
      });
    }
  }

  /**
   * Get configuration for a queue type
   * @param {string} type - Queue type
   */
  getQueueConfig(type) {
    const variant = variantRegistry.getVariant(type);
    if (!variant) return null;

    // All games wait for full table (maxPlayers) before starting
    const minPlayers = variant.max_players;

    return {
      minPlayers,
      maxPlayers: variant.max_players,
      botFillAfter: variant.config.botFillAfter || 30000, // Default 30 seconds if not specified
      ...variant.config,
    };
  }
}

export const queueManager = new QueueManager();
