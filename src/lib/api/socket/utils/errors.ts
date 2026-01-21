/**
 * Error handling utilities for socket operations
 */

import type { SocketErrorEvent } from "../types/game";

// ============================================
// ERROR TYPE DETECTION
// ============================================

/**
 * Check if error is a retryable "Game not found" error
 * This can happen during the brief window where DB record exists
 * but server is still initializing the game
 */
export function isGameNotFoundError(error: SocketErrorEvent | string): boolean {
  const message = typeof error === "string" ? error : error.error || error.message || "";
  return message.includes("Game not found");
}

/**
 * Check if error is an authorization error
 * User is not a player in this game
 */
export function isAuthError(error: SocketErrorEvent | string): boolean {
  const message = typeof error === "string" ? error : error.error || error.message || "";
  return message.includes("Not a player in this game");
}

/**
 * Check if error should trigger a retry
 */
export function isRetryableError(error: SocketErrorEvent | string): boolean {
  // Game not found is retryable (JIT hydration delay)
  if (isGameNotFoundError(error)) {
    return true;
  }
  // Add other retryable error patterns here if needed
  return false;
}

/**
 * Extract error message from various error formats
 */
export function getErrorMessage(error: unknown): string {
  if (!error) return "An error occurred";

  if (typeof error === "string") return error;

  if (typeof error === "object") {
    const errorObj = error as Record<string, unknown>;

    // Check for common error message patterns
    if (typeof errorObj.error === "string") return errorObj.error;
    if (typeof errorObj.message === "string") return errorObj.message;

    // Nested error object
    if (errorObj.error && typeof errorObj.error === "object") {
      const nested = errorObj.error as Record<string, unknown>;
      if (typeof nested.message === "string") return nested.message;
    }
  }

  return "An error occurred";
}

// ============================================
// RETRY HANDLER
// ============================================

export interface RetryConfig {
  maxRetries: number;
  retryDelay: number; // milliseconds
  onRetry?: (attempt: number) => void;
  onMaxRetriesExceeded?: () => void;
}

export interface RetryState {
  retryCount: number;
  timeoutId: NodeJS.Timeout | null;
}

/**
 * Create a retry handler for handling transient errors
 */
export function createRetryHandler(config: RetryConfig) {
  const state: RetryState = {
    retryCount: 0,
    timeoutId: null,
  };

  const reset = () => {
    state.retryCount = 0;
    if (state.timeoutId) {
      clearTimeout(state.timeoutId);
      state.timeoutId = null;
    }
  };

  const attempt = (action: () => void): boolean => {
    if (state.retryCount < config.maxRetries) {
      state.retryCount += 1;

      // Clear any existing retry timeout
      if (state.timeoutId) {
        clearTimeout(state.timeoutId);
      }

      // Schedule retry
      state.timeoutId = setTimeout(() => {
        config.onRetry?.(state.retryCount);
        action();
      }, config.retryDelay);

      return true; // Retry scheduled
    } else {
      // Max retries exceeded
      if (state.timeoutId) {
        clearTimeout(state.timeoutId);
        state.timeoutId = null;
      }
      state.retryCount = 0;
      config.onMaxRetriesExceeded?.();
      return false; // No more retries
    }
  };

  const cleanup = () => {
    reset();
  };

  return {
    state,
    reset,
    attempt,
    cleanup,
  };
}

// ============================================
// RESPONSE NORMALIZATION
// ============================================

/**
 * Get error message from socket response
 * Supports both new and old response formats
 */
export function getErrorMessageFromResponse(response: unknown): string | undefined {
  if (!response) return undefined;

  const res = response as Record<string, unknown>;

  // New standardized format: { success: false, error: { code, message } }
  if (res.success === false) {
    const errorField = res.error;
    if (typeof errorField === "string") return errorField;
    if (errorField && typeof errorField === "object") {
      const errorObj = errorField as Record<string, unknown>;
      if (typeof errorObj.message === "string") return errorObj.message;
      if (typeof errorObj.error === "string") return errorObj.error;
    }
    if (typeof res.message === "string") return res.message;
    return "An error occurred";
  }

  // Old format: { error: "..." }
  if (typeof res.error === "string") return res.error;
  if (res.error && typeof res.error === "object") {
    const errorObj = res.error as Record<string, unknown>;
    if (typeof errorObj.message === "string") return errorObj.message;
  }

  return undefined;
}

/**
 * Get data from socket response
 * Supports both new and old response formats
 */
export function getDataFromResponse<T>(response: unknown): T | undefined {
  if (!response) return undefined;

  const res = response as Record<string, unknown>;

  // New standardized format: { success: true, data: ... }
  if (res.data !== undefined) return res.data as T;

  // Old format: payload was top-level
  return response as T;
}
