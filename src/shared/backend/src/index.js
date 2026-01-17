/**
 * Poker Server - Main entry point
 * Single source of truth for queues and active games
 * Uses Supabase for persistence and recovery
 */

// Environment variables are loaded via --require ./loadEnv.cjs in package.json
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { supabaseAdmin } from "./infrastructure/database/supabaseClient.js";
import authMiddleware from "./middleware/authMiddleware.js";
import { gameManager } from "./domain/game/managers/GameManager.js";
import { queueManager } from "./domain/game/managers/QueueManager.js";
import { BotManager } from "./domain/game/bots/BotManager.js";
import { registerGameHandlers } from "./infrastructure/websocket/handlers/gameHandler.js";
import { registerPrivateGameHandlers } from "./infrastructure/websocket/handlers/privateGameHandler.js";

const app = express();
const server = createServer(app);
const port = process.env.PORT || 4000;

// Configure CORS for Socket.io
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : [
      "http://localhost:3000",
      "https://pokronline.com",
      "https://www.pokronline.com",
    ];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Set IO instance for game and queue managers
gameManager.setIO(io);
queueManager.setIO(io);

// Middleware
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    activeGames: gameManager.games.size,
    uptime: process.uptime(),
  });
});

// Socket.io authentication middleware
io.use(authMiddleware);

// Socket.io connection handler
io.on("connection", async (socket) => {
  // Auto-reconnect to active game if player is in one
  (async () => {
    try {
      // Check for active game (status = "active" or "starting")
      // Queue operations are handled client-side via Realtime
      const activeGameId = await gameManager.getPlayerActiveGameId(
        socket.userId
      );
      if (activeGameId) {
        await gameManager.joinGame(socket, activeGameId);
        socket.emit("game-reconnected", {
          gameId: activeGameId,
          message: "Reconnected to your active game",
        });
      }
    } catch (error) {
      // Silent fail for reconnection attempts
    }
  })();

  // Register game & queue socket handlers
  registerGameHandlers(socket);
  registerPrivateGameHandlers(io, socket, gameManager);

  // Queue handlers
  socket.on("join_queue", async (payload) => {
    try {
      // Support both legacy string and object payloads
      const queueType =
        typeof payload === "string"
          ? payload
          : payload?.queueType || payload?.queue_type || payload?.type;

      if (!queueType) {
        socket.emit("error", { message: "queueType is required" });
        return;
      }

      await queueManager.joinQueue(socket.userId, socket.id, queueType);
      // QueueManager now emits 'queue_update' event, no need to emit here
    } catch (error) {
      socket.emit("error", {
        message: error.message || "Error joining queue",
      });
    }
  });

  socket.on("leave_queue", async (payload) => {
    try {
      const queueType =
        typeof payload === "string"
          ? payload
          : payload?.queueType || payload?.queue_type || payload?.type;

      await queueManager.leaveQueue(socket.userId, queueType);
      socket.emit("queue_left", { queueType });
    } catch (error) {
      socket.emit("error", {
        message: error.message || "Error leaving queue",
      });
    }
  });

  // Check queue status (for persistent queue state across navigation)
  socket.on("check_queue_status", () => {
    queueManager.handleCheckQueueStatus(socket);
  });

  // Disconnect handler
  socket.on("disconnect", () => {
    gameManager.handleSocketDisconnect(socket.userId);
    // Remove from in-memory queue on disconnect
    queueManager.handleDisconnect(socket.userId, socket.id);
  });

  // Error handler
  socket.on("error", () => {
    // Silent error handling
  });
});

// Startup: Initialize managers
async function startup() {
  try {
    // Load bots first
    await BotManager.loadBots();
    await gameManager.init();
    await queueManager.init();
    console.log("Poker Server initialized");
  } catch (error) {
    console.error("Error during startup:", error);
    process.exit(1);
  }
}

// Start server
server.listen(port, "0.0.0.0", async () => {
  console.log(`Server listening on port ${port}`);
  await startup();
});

// Handle server errors
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use`);
  } else {
    console.error("Server error:", error);
  }
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Shutdown] SIGTERM received, cleaning up...");

  // Stop QueueManager intervals
  queueManager.stop();

  // Stop GameManager timers
  for (const gameId of gameManager.games.keys()) {
    gameManager.stopGameTimers(gameId);
  }

  // Stop global ticker
  if (gameManager.globalTicker) {
    clearInterval(gameManager.globalTicker);
    gameManager.globalTicker = null;
    console.log("[GameManager] Stopped global ticker");
  }

  server.close(() => {
    console.log("[Shutdown] Server closed, exiting...");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("[Shutdown] SIGINT received, cleaning up...");

  // Stop QueueManager intervals
  queueManager.stop();

  // Stop GameManager timers
  for (const gameId of gameManager.games.keys()) {
    gameManager.stopGameTimers(gameId);
  }

  // Stop global ticker
  if (gameManager.globalTicker) {
    clearInterval(gameManager.globalTicker);
    gameManager.globalTicker = null;
    console.log("[GameManager] Stopped global ticker");
  }

  server.close(() => {
    console.log("[Shutdown] Server closed, exiting...");
    process.exit(0);
  });
});

// Error handlers
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});
