import { Logger } from "../../../shared/utils/Logger.js";

export class SocketBroadcaster {
  constructor() {
    this.io = null;
  }

  setIO(io) {
    this.io = io;
  }

  /**
   * Emit a list of events to the game room or specific players
   * @param {string} gameId
   * @param {Array} events
   */
  emitEvents(gameId, events) {
    if (!this.io || !events) return;

    for (const event of events) {
      try {
        switch (event.type) {
          case "PLAYER_ACTION":
            this.io.to(gameId).emit("action-processed", {
              gameId,
              ...event.payload,
            });
            break;

          case "PLAYER_STATUS_UPDATE":
            this.io.to(gameId).emit("PLAYER_STATUS_UPDATE", {
              gameId,
              ...event.payload,
            });
            break;

          case "DEAL_STREET":
            this.io.to(gameId).emit("DEAL_STREET", {
              gameId,
              ...event.payload,
            });
            break;

          case "turn_timer_started":
            this.io.to(gameId).emit("turn_timer_started", {
              gameId,
              ...event.payload,
            });
            break;

          case "GAME_FINISHED":
            this.io.to(gameId).emit("GAME_FINISHED", {
              gameId,
              ...event.payload,
            });
            break;

          case "ERROR":
            // Errors are typically sent directly to the socket in the handler,
            // but we can support broadcasting errors if needed.
            break;

          default:
            // Generic emit for other events
            this.io.to(gameId).emit(event.type, {
              gameId,
              ...(event.payload || event.data || {}),
            });
        }
      } catch (error) {
        Logger.error(
          `[SocketBroadcaster] Error emitting event ${event.type}:`,
          error
        );
      }
    }
  }

  /**
   * Broadcast the full game state to all players
   * @param {string} gameId
   * @param {TexasHoldemEngine} engine
   */
  broadcastState(gameId, engine) {
    if (!engine || !this.io) {
      Logger.warn(
        `[SocketBroadcaster] Cannot broadcast state: engine=${!!engine} io=${!!this
          .io} game=${gameId}`
      );
      return;
    }

    const context = engine.context;
    const players = context.players;
    const phase = context.currentPhase;
    const cards = context.communityCards;

    Logger.debug(
      `[SocketBroadcaster] Broadcasting state: game=${gameId} phase=${phase} cards=${cards.length} players=${players.length}`
    );

    // 1. Broadcast Showdown Events if applicable
    if (context.currentPhase === "showdown" && context.showdownResults) {
      this.io.to(gameId).emit("showdown", {
        gameId,
        winners: context.showdownResults.winners,
        distributions: context.showdownResults.distributions,
        rankings: context.showdownResults.rankings,
      });
      Logger.debug(
        `[SocketBroadcaster] Broadcasted showdown event game=${gameId}`
      );
    }

    // 2. Broadcast Individual Game States (Private Views) to players
    // Skip players who have left the game to prevent broadcasts to disconnected clients
    let broadcastCount = 0;
    for (const p of context.players) {
      if (!p.isBot) {
        // Skip players who have permanently left the game or been removed
        if (p.status === "LEFT" || p.status === "REMOVED") {
          Logger.debug(
            `[SocketBroadcaster] Skipping broadcast to left/removed player ${p.id} in game ${gameId}`
          );
          continue;
        }

        const playerContext = engine.getPlayerContext(p.id);
        this.io.to(`${gameId}-${p.id}`).emit("gameState", playerContext);
        broadcastCount++;
      }
    }

    // 3. Broadcast Spectator Context to spectators (for private games)
    if (context.isPrivate && context.spectators && context.spectators.length > 0) {
      // Use engine's getSpectatorContext method for consistency with player context
      const spectatorContext = engine.getSpectatorContext();
      
      // Send to each spectator
      for (const spectator of context.spectators) {
        this.io.to(`${gameId}-${spectator.userId}`).emit("gameState", spectatorContext);
        broadcastCount++;
      }
      
      Logger.debug(
        `[SocketBroadcaster] Broadcasted spectator context to ${context.spectators.length} spectator(s) game=${gameId}`
      );
    }

    Logger.debug(
      `[SocketBroadcaster] Broadcasted gameState to ${broadcastCount} player(s) game=${gameId}`
    );
  }

  /**
   * Emit game-deleted event to all players in a game
   * @param {string} gameId
   * @param {Array<string>} playerIds
   */
  emitGameDeleted(gameId, playerIds) {
    if (!this.io || !playerIds || playerIds.length === 0) return;

    const message = {
      type: "game-deleted",
      gameId,
      message: "This game has been deleted.",
      timestamp: new Date().toISOString(),
    };

    this.io.to(gameId).emit("game-deleted", message);

    for (const playerId of playerIds) {
      this.io.to(`${gameId}-${playerId}`).emit("game-deleted", message);
    }
  }
}
