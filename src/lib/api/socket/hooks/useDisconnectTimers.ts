"use client";

/**
 * Hook for managing player disconnect countdown timers
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { calculateDisconnectEndTime, cleanExpiredDisconnectTimers } from "../utils/timer";

export interface UseDisconnectTimersReturn {
  timers: Record<string, number>;
  startTimer: (playerId: string, disconnectTimestamp: number) => void;
  clearTimer: (playerId: string) => void;
  clearAllTimers: () => void;
}

/**
 * Hook for managing player disconnect countdown timers
 * Updates every second to remove expired timers
 */
export function useDisconnectTimers(): UseDisconnectTimersReturn {
  const [timers, setTimers] = useState<Record<string, number>>({});
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Start a disconnect countdown timer for a player
   */
  const startTimer = useCallback(
    (playerId: string, disconnectTimestamp: number) => {
      const endTime = calculateDisconnectEndTime(disconnectTimestamp);

      setTimers((prev) => ({
        ...prev,
        [playerId]: endTime,
      }));

      // Start interval to clean expired timers if not already running
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          setTimers((prev) => cleanExpiredDisconnectTimers(prev));
        }, 1000);
      }
    },
    []
  );

  /**
   * Clear timer for a specific player
   */
  const clearTimer = useCallback((playerId: string) => {
    setTimers((prev) => {
      const updated = { ...prev };
      delete updated[playerId];
      return updated;
    });
  }, []);

  /**
   * Clear all disconnect timers
   */
  const clearAllTimers = useCallback(() => {
    setTimers({});
  }, []);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // Stop interval when all timers are cleared
  useEffect(() => {
    if (Object.keys(timers).length === 0 && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [timers]);

  return {
    timers,
    startTimer,
    clearTimer,
    clearAllTimers,
  };
}
