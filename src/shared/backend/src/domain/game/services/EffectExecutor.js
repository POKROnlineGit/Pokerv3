import { EffectType } from "../types.js";
import { Logger } from "../../../shared/utils/Logger.js";
import { BotManager } from "../bots/BotManager.js";

export class EffectExecutor {
  /**
   * @param {GameManager} manager - Reference to GameManager for accessing games, timers, etc.
   */
  constructor(manager) {
    this.manager = manager;
  }

  /**
   * Execute a list of effects
   * @param {string} gameId
   * @param {Object} result - GameResult { effects, state, events }
   */
  async execute(gameId, result) {
    if (!result || !result.effects) return;

    const engine = this.manager.getGame(gameId);
    if (!engine) return;

    for (const effect of result.effects) {
      try {
        switch (effect.type) {
          case EffectType.PERSIST:
            // Non-blocking persistence: enqueue DB update and broadcast immediately.
            // Do NOT await Supabase before continuing game flow.
            this.manager.handlePersistEffect(gameId, result.state);
            break;

          case EffectType.SCHEDULE_TRANSITION:
            await this.handleScheduleTransition(gameId, effect);
            break;

          case EffectType.START_TIMER:
            await this.handleStartTimer(gameId, effect, engine.context);
            break;

          case EffectType.START_RECONNECT_TIMER:
            this.handleStartReconnectTimer(gameId, effect);
            break;

          case EffectType.CANCEL_RECONNECT_TIMER:
            this.handleCancelReconnectTimer(effect);
            break;

          case EffectType.GAME_END:
            await this.handleGameEnd(gameId, effect, result.state);
            break;

          default:
            Logger.warn(`[EffectExecutor] Unknown effect type: ${effect.type}`);
        }
      } catch (error) {
        Logger.error(`[EffectExecutor] Error executing ${effect.type}:`, error);
      }
    }
  }

  async handleScheduleTransition(gameId, effect) {
    // Clear existing transition timer using public method
    this.manager.clearTransitionTimer(gameId);

    Logger.debug(
      `[EffectExecutor] Scheduling transition to ${effect.targetPhase} in ${
        effect.delayMs || 0
      }ms for game ${gameId}`
    );

    // Schedule transition - delegate completion to GameManager
    // This eliminates recursive processEngineResult() calls
    const timeout = setTimeout(async () => {
      // Delegate all transition handling to GameManager
      // This ensures proper orchestration and eliminates recursion
      await this.manager.handleTransitionComplete(gameId, effect.targetPhase);
    }, effect.delayMs || 0);

    // Store timer using public method
    this.manager.setTransitionTimer(gameId, timeout);
  }

  async handleStartTimer(gameId, effect, context) {
    // 1. Setup Timer Info
    const playerId =
      effect.playerId ||
      context.players.find((p) => p.seat === context.currentActorSeat)?.id;

    // 2. Broadcast Timer Start Event
    // The Engine sets the actionDeadline in context. We just notify the frontend.
    if (context.currentActorSeat) {
      const now = Date.now();
      let deadlineMs = context.actionDeadline
        ? new Date(context.actionDeadline).getTime()
        : now + effect.duration;

      // Fix past deadlines (sanity check)
      if (deadlineMs <= now) {
        deadlineMs = now + effect.duration;
        Logger.warn(
          `[EffectExecutor] Recalculated past deadline for game=${gameId} newDeadline=${deadlineMs}`
        );
      }

      // Use public method instead of direct broadcaster access
      this.manager.emitEvents(gameId, [
        {
          type: "turn_timer_started",
          payload: {
            seat: context.currentActorSeat,
            activeSeat: context.currentActorSeat,
            playerId,
            deadline: deadlineMs,
            duration: effect.duration,
            timestamp: new Date().toISOString(),
          },
        },
      ]);

      Logger.debug(
        `[EffectExecutor] Emitted turn_timer_started event: seat=${
          context.currentActorSeat
        } playerId=${playerId} deadline=${deadlineMs} (${new Date(
          deadlineMs
        ).toISOString()}) duration=${effect.duration}ms remaining=${
          deadlineMs - now
        }ms game=${gameId}`
      );
    } else {
      Logger.warn(
        `[EffectExecutor] Cannot emit turn_timer_started: currentActorSeat is null/undefined game=${gameId}`
      );
    }

    // PHASE 2 CHANGE: Removed setTimeout logic.
    // We do NOT set a local timeout here anymore.
    // The GameManager's Global Ticker will check context.actionDeadline every second.
    // This prevents zombie timers and simplifies memory management.
  }

  handleStartReconnectTimer(gameId, effect) {
    // Schedule reconnect timer expiration
    // Delegate business logic to GameManager when timer expires
    const timeout = setTimeout(async () => {
      await this.manager.handleReconnectTimerExpired(gameId, effect.playerId);
    }, effect.duration);
    // Use public method to set reconnect timer
    this.manager.setReconnectTimer(effect.playerId, { gameId, timeout });
  }

  handleCancelReconnectTimer(effect) {
    // Use public method to clear reconnect timer
    this.manager.clearReconnectTimer(effect.playerId);
  }

  async handleGameEnd(gameId, effect, state) {
    // Delegate all business logic to GameManager
    // EffectExecutor focuses on effect execution only
    await this.manager.finalizeGameEnd(gameId, effect, state);
  }
}
