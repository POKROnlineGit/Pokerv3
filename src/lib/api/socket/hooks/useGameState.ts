"use client";

/**
 * Hook for managing normalized game state
 */

import { useState, useCallback, useRef } from "react";
import type { GameState, GameStateConfig } from "@/lib/types/poker";
import { normalizeGameState, normalizeGameStateForSync } from "../utils/normalizers";
import type { GameStateEvent } from "../types/game";

export interface UseGameStateOptions {
  gameId: string;
  defaultConfig?: Partial<GameStateConfig>;
}

export interface UseGameStateReturn {
  gameState: GameState | null;
  setGameState: (state: GameState | null) => void;
  setRawGameState: (serverState: GameStateEvent) => void;
  setRawGameStateForSync: (serverState: GameStateEvent) => void;
  updateCommunityCards: (cards: string[]) => void;
  updatePhase: (phase: GameState["currentPhase"]) => void;
  removePlayer: (seatIndex: number) => void;
  handNumber: number;
}

/**
 * Hook for managing normalized game state
 * Provides functions to update state from server events
 */
export function useGameState(options: UseGameStateOptions): UseGameStateReturn {
  const { gameId, defaultConfig } = options;
  const [gameState, setGameState] = useState<GameState | null>(null);
  const previousStateRef = useRef<GameState | null>(null);

  /**
   * Set game state from raw server event
   * Automatically normalizes the state
   */
  const setRawGameState = useCallback(
    (serverState: GameStateEvent) => {
      const normalized = normalizeGameState(serverState, {
        gameId,
        previousState: previousStateRef.current,
        defaultConfig,
      });

      previousStateRef.current = normalized;
      setGameState(normalized);
    },
    [gameId, defaultConfig]
  );

  /**
   * Set game state from sync event (after reconnection)
   * Clears disconnect statuses
   */
  const setRawGameStateForSync = useCallback(
    (serverState: GameStateEvent) => {
      const normalized = normalizeGameStateForSync(serverState, {
        gameId,
        previousState: previousStateRef.current,
        defaultConfig,
      });

      previousStateRef.current = normalized;
      setGameState(normalized);
    },
    [gameId, defaultConfig]
  );

  /**
   * Update community cards directly
   * Used for DEAL_STREET and HAND_RUNOUT events
   */
  const updateCommunityCards = useCallback((cards: string[]) => {
    setGameState((prevState) => {
      if (!prevState) return prevState;

      const updated = {
        ...prevState,
        communityCards: cards,
      };

      previousStateRef.current = updated;
      return updated;
    });
  }, []);

  /**
   * Update phase directly
   * Used for DEAL_STREET events
   */
  const updatePhase = useCallback((phase: GameState["currentPhase"]) => {
    setGameState((prevState) => {
      if (!prevState) return prevState;

      const updated = {
        ...prevState,
        currentPhase: phase,
      };

      previousStateRef.current = updated;
      return updated;
    });
  }, []);

  /**
   * Remove a player from the game state
   * Used for SEAT_VACATED events
   */
  const removePlayer = useCallback((seatIndex: number) => {
    setGameState((prevState) => {
      if (!prevState) return prevState;

      const updatedPlayers = prevState.players.filter(
        (player) => player.seat !== seatIndex
      );

      const updated = {
        ...prevState,
        players: updatedPlayers,
      };

      previousStateRef.current = updated;
      return updated;
    });
  }, []);

  return {
    gameState,
    setGameState,
    setRawGameState,
    setRawGameStateForSync,
    updateCommunityCards,
    updatePhase,
    removePlayer,
    handNumber: gameState?.handNumber ?? 0,
  };
}
