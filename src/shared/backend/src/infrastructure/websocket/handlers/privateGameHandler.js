/**
 * Private Game Socket Handlers
 * Registers socket event handlers for private/host game events
 */

import { Logger } from "../../../shared/utils/Logger.js";
import { supabaseAdmin } from "../../../infrastructure/database/supabaseClient.js";

/**
 * Register private game-related socket event handlers
 * @param {Server} io - Socket.io server instance
 * @param {Socket} socket - Socket.io socket instance
 * @param {GameManager} gameManager - GameManager instance
 */
export function registerPrivateGameHandlers(io, socket, gameManager) {
  // 1. Create Private Lobby
  socket.on("create_private_game", async (payload, callback) => {
    try {
      const { variantSlug, config } = payload;
      const gameId = await gameManager.createPrivateGame(
        socket.userId,
        variantSlug,
        config
      );
      callback({ gameId });
      Logger.info(`Private game created by ${socket.userId}: ${gameId}`);
    } catch (err) {
      Logger.error("Error creating private game:", err);
      callback({ error: err.message });
    }
  });

  // 2. Admin Actions (Pause, Kick, Edit Stack, etc.)
  socket.on("admin_action", async (payload) => {
    try {
      const { gameId, type, ...data } = payload;
      await gameManager.handleAdminAction(gameId, socket.userId, {
        type,
        ...data,
      });
    } catch (err) {
      Logger.error(`Admin action failed for ${socket.userId}:`, err);
      socket.emit("error", { message: err.message });
    }
  });

  // 3. Request Seat (Guest)
  socket.on("request_seat", async (payload) => {
    try {
      const { gameId } = payload;
      // We assume socket.user contains { id, username } from auth middleware
      // If not available, construct from socket.userId
      const user = socket.user || {
        id: socket.userId,
        username: socket.username || `User ${socket.userId}`,
      };
      await gameManager.handleRequestSeat(gameId, user);
    } catch (err) {
      Logger.error(`Request seat failed for ${socket.userId}:`, err);
      socket.emit("error", { message: err.message });
    }
  });

  // 4. Host Self-Seat
  socket.on("host_self_seat", async (payload) => {
    try {
      const { gameId, seatIndex } = payload;
      const engine = gameManager.games.get(gameId);

      if (!engine) {
        socket.emit("error", { message: "Game not found" });
        return;
      }

      // Verify host
      if (engine.context.hostId !== socket.userId) {
        socket.emit("error", { message: "Only host can seat themselves" });
        return;
      }

      // Verify host is not already in players
      if (engine.context.players.some((p) => p.id === socket.userId)) {
        socket.emit("error", { message: "Host already seated" });
        return;
      }

      // Get host name
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("username")
        .eq("id", socket.userId)
        .single();

      const hostName = profile?.username || "Host";

      // Guard: Check if table is already full
      if (engine.context.players.length >= engine.config.maxPlayers) {
        socket.emit("error", { message: "Table is full" });
        return;
      }

      // Find next available seat
      const takenSeats = engine.context.players.map((p) => p.seat);
      let targetSeat = seatIndex;
      if (!targetSeat) {
        for (let i = 1; i <= engine.config.maxPlayers; i++) {
          if (!takenSeats.includes(i)) {
            targetSeat = i;
            break;
          }
        }
      }

      if (!targetSeat || takenSeats.includes(targetSeat)) {
        socket.emit("error", { message: "No seats available" });
        return;
      }

      // Add host to players with WAITING_FOR_NEXT_HAND status
      const hostPlayer = {
        id: socket.userId,
        username: hostName,
        seat: targetSeat,
        chips: engine.config.startingStack || engine.config.buyIn || 1000,
        status: "WAITING_FOR_NEXT_HAND",
        isBot: false,
        isOffline: false,
        isGhost: false,
        currentBet: 0,
        totalBet: 0,
        holeCards: [],
        folded: false,
        allIn: false,
        eligibleToBet: true,
        hasActed: false,
        leaving: false,
        lastAction: null,
        revealedIndices: [],
      };

      engine.context.players.push(hostPlayer);

      // Update pot eligible players
      engine.context.pots[0].eligiblePlayers.push(socket.userId);

      // Process result
      await gameManager.processEngineResult(gameId, {
        success: true,
        state: engine.context,
        events: [
          {
            type: "PLAYER_STATUS_UPDATE",
            payload: {
              playerId: socket.userId,
              status: "WAITING_FOR_NEXT_HAND",
              message: "Host seated - waiting for next hand",
              seat: targetSeat,
              chips: hostPlayer.chips,
            },
          },
        ],
        effects: [{ type: "PERSIST" }],
      });

      Logger.info(
        `Host ${socket.userId} self-seated in game ${gameId} at seat ${targetSeat}`
      );
    } catch (err) {
      Logger.error(`Host self-seat failed for ${socket.userId}:`, err);
      socket.emit("error", { message: err.message });
    }
  });
}
