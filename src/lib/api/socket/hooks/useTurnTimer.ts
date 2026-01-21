"use client";

/**
 * Hook for managing turn timer state
 */

import { useState, useCallback } from "react";
import { updateTimerForGameState, logTimerDebug } from "../utils/timer";
import type { TurnTimer } from "../utils/timer";
import type { TurnTimerStartedEvent } from "../types/game";

// Re-export TurnTimer for convenience
export type { TurnTimer } from "../utils/timer";

export interface UseTurnTimerReturn {
  turnTimer: TurnTimer | null;
  setTurnTimer: (timer: TurnTimer | null) => void;
  handleTurnTimerStarted: (data: TurnTimerStartedEvent) => void;
  clearTimerIfActorChanged: (newActorSeat: number | null | undefined) => void;
  clearTimerIfPaused: (isPaused: boolean) => void;
}

/**
 * Hook for managing turn timer state
 * Provides handlers for timer events and game state changes
 */
export function useTurnTimer(): UseTurnTimerReturn {
  const [turnTimer, setTurnTimer] = useState<TurnTimer | null>(null);

  /**
   * Handle turn_timer_started event from server
   */
  const handleTurnTimerStarted = useCallback((data: TurnTimerStartedEvent) => {
    const timerData: TurnTimer = {
      deadline: data.deadline,
      duration: data.duration,
      activeSeat: data.activeSeat,
    };

    // Log debug info in development
    if (process.env.NODE_ENV === "development") {
      logTimerDebug("useTurnTimer", timerData);
    }

    setTurnTimer(timerData);
  }, []);

  /**
   * Clear timer if the current actor has changed
   * Called when new game state is received
   */
  const clearTimerIfActorChanged = useCallback(
    (newActorSeat: number | null | undefined) => {
      setTurnTimer((prevTimer) => {
        return updateTimerForGameState(prevTimer, newActorSeat);
      });
    },
    []
  );

  /**
   * Clear timer if game is paused
   * Backend doesn't process timers when paused
   */
  const clearTimerIfPaused = useCallback((isPaused: boolean) => {
    if (isPaused) {
      setTurnTimer(null);
    }
  }, []);

  return {
    turnTimer,
    setTurnTimer,
    handleTurnTimerStarted,
    clearTimerIfActorChanged,
    clearTimerIfPaused,
  };
}
