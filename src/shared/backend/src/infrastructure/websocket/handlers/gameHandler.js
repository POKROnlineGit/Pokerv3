/**
 * Game Socket Handlers
 * Registers socket event handlers for game-related events
 */

import { gameManager } from "../../../domain/game/managers/GameManager.js";
import { Logger } from "../../../shared/utils/Logger.js";

/**
 * Register game-related socket event handlers
 * @param {Socket} socket - Socket.io socket instance
 */
export function registerGameHandlers(socket) {
  // Join game
  socket.on("joinGame", async (data) => {
    try {
      const gameId = typeof data === "string" ? data : data?.gameId;
      if (!gameId) {
        socket.emit("error", { message: "gameId is required" });
        return;
      }
      await gameManager.joinGame(socket, gameId);
    } catch (error) {
      socket.emit("error", {
        message: error.message || "Error joining game",
      });
    }
  });

  // Player action
  socket.on("action", async (data) => {
    try {
      await gameManager.handleAction(socket, data);
    } catch (error) {
      socket.emit("error", {
        message: error.message || "Error processing action",
      });
    }
  });

  // Request game state
  socket.on("request-state", async (data) => {
    try {
      const gameId = typeof data === "string" ? data : data?.gameId;
      if (!gameId) {
        socket.emit("error", { message: "gameId is required" });
        return;
      }
      await gameManager.requestState(socket, gameId);
    } catch (error) {
      socket.emit("error", {
        message: error.message || "Error requesting state",
      });
    }
  });

  // Check active session
  socket.on("check_active_session", (data) => {
    gameManager.handleCheckActiveSession(socket);
  });

  // Leave game
  socket.on("leaveGame", async (data) => {
    try {
      const gameId = typeof data === "string" ? data : data?.gameId;
      Logger.info(
        `[gameHandler] leaveGame event received: userId=${socket.userId} gameId=${gameId} socketId=${socket.id}`
      );
      if (!gameId) {
        Logger.warn(
          `[gameHandler] leaveGame: Missing gameId for userId=${socket.userId}`
        );
        socket.emit("error", { message: "gameId is required" });
        return;
      }
      Logger.debug(
        `[gameHandler] Calling handleLeaveGame: gameId=${gameId} userId=${socket.userId}`
      );
      await gameManager.handleLeaveGame(gameId, socket.userId);
      Logger.info(
        `[gameHandler] leaveGame completed: userId=${socket.userId} gameId=${gameId}`
      );
    } catch (error) {
      Logger.error(
        `[gameHandler] Error in leaveGame handler: userId=${socket.userId} gameId=${data?.gameId || data}`,
        error
      );
      socket.emit("error", {
        message: error.message || "Error leaving game",
      });
    }
  });
}

