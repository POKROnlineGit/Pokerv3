/**
 * Turn timer utilities
 * Helpers for managing and validating turn timers
 */

export interface TurnTimer {
  deadline: number; // Unix timestamp in milliseconds
  duration: number; // Duration in seconds
  activeSeat: number; // Seat number of the player whose turn it is
}

// ============================================
// TIMER VALIDATION
// ============================================

/**
 * Check if a turn timer is valid for the current actor
 * Timer is valid if the seat matches and deadline is in the future
 */
export function isValidTimer(
  timer: TurnTimer | null,
  currentActorSeat: number | null | undefined
): boolean {
  if (!timer) return false;
  if (currentActorSeat === null || currentActorSeat === undefined) return false;
  if (timer.activeSeat !== currentActorSeat) return false;

  const now = Date.now();
  return timer.deadline > now;
}

/**
 * Check if timer should be cleared when actor changes
 * Returns true if:
 * - There's no new actor (no one is acting)
 * - The new actor is different from the timer's seat
 */
export function shouldClearTimer(
  prevTimer: TurnTimer | null,
  newActorSeat: number | null | undefined
): boolean {
  if (!prevTimer) return false; // No timer to clear

  // If currentActorSeat is null, no one is acting - clear timer
  if (newActorSeat === null || newActorSeat === undefined) {
    return true;
  }

  // If currentActorSeat changed to a different seat, clear the old timer
  if (newActorSeat !== prevTimer.activeSeat) {
    return true;
  }

  return false;
}

/**
 * Update timer based on new game state
 * Returns the timer to set (null if should be cleared, prev if still valid)
 */
export function updateTimerForGameState(
  prevTimer: TurnTimer | null,
  newActorSeat: number | null | undefined
): TurnTimer | null {
  if (shouldClearTimer(prevTimer, newActorSeat)) {
    return null;
  }
  return prevTimer;
}

// ============================================
// TIME CALCULATIONS
// ============================================

/**
 * Get remaining time in milliseconds until deadline
 * Returns 0 if deadline has passed
 */
export function getRemainingTime(deadline: number): number {
  const now = Date.now();
  const remaining = deadline - now;
  return remaining > 0 ? remaining : 0;
}

/**
 * Get remaining time in seconds until deadline
 * Returns 0 if deadline has passed
 */
export function getRemainingSeconds(deadline: number): number {
  return Math.ceil(getRemainingTime(deadline) / 1000);
}

/**
 * Calculate progress percentage (0-100) for a timer
 * 100 = full time remaining, 0 = time expired
 */
export function getTimerProgress(timer: TurnTimer): number {
  const remaining = getRemainingTime(timer.deadline);
  const totalMs = timer.duration * 1000;
  if (totalMs <= 0) return 0;
  return Math.min(100, Math.max(0, (remaining / totalMs) * 100));
}

/**
 * Check if deadline is in the past (timer expired)
 */
export function isTimerExpired(deadline: number): boolean {
  return Date.now() >= deadline;
}

/**
 * Validate that a deadline is reasonable (not too far in the past)
 * Returns true if the deadline is within the last minute or in the future
 */
export function isReasonableDeadline(deadline: number): boolean {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  return deadline > oneMinuteAgo;
}

/**
 * Log timer debug info (for development)
 */
export function logTimerDebug(
  prefix: string,
  timer: TurnTimer
): void {
  const now = Date.now();
  const timeUntilDeadline = timer.deadline - now;

  if (timeUntilDeadline < 0) {
    console.error(`[${prefix}] Timer deadline is in the past!`, {
      deadline: timer.deadline,
      now,
      difference: timeUntilDeadline,
      deadlineDate: new Date(timer.deadline).toISOString(),
      nowDate: new Date(now).toISOString(),
    });
  }
}

// ============================================
// DISCONNECT TIMER HELPERS
// ============================================

export interface DisconnectTimer {
  playerId: string;
  endTime: number; // Unix timestamp when countdown ends
}

/**
 * Calculate end time for disconnect countdown
 * Default countdown is 60 seconds from disconnect timestamp
 */
export function calculateDisconnectEndTime(
  disconnectTimestamp: number,
  countdownDuration: number = 60000
): number {
  return disconnectTimestamp + countdownDuration;
}

/**
 * Check if disconnect timer has expired
 */
export function isDisconnectTimerExpired(endTime: number): boolean {
  return Date.now() >= endTime;
}

/**
 * Update disconnect timers, removing expired ones
 */
export function cleanExpiredDisconnectTimers(
  timers: Record<string, number>
): Record<string, number> {
  const now = Date.now();
  const updated: Record<string, number> = {};

  Object.keys(timers).forEach((playerId) => {
    if (timers[playerId] > now) {
      updated[playerId] = timers[playerId];
    }
  });

  return updated;
}
