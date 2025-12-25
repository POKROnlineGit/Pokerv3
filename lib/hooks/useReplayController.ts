/**
 * useReplayController
 * 
 * A React hook that manages the playback state of a poker game replay.
 * Provides video player-like controls to navigate through a timeline of game states.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { GameState } from '@/lib/types/poker';
import type { ReplayResult, ReplayFrame } from '@/lib/replay/ReplayOrchestrator';

interface ReplayState {
  activeState: GameState | null;
  currentFrameIndex: number;
  totalFrames: number;
  isPlaying: boolean;
  playbackSpeed: number;
}

interface ReplayControls {
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  nextFrame: () => void;
  prevFrame: () => void;
  goToFrame: (index: number) => void;
  setSpeed: (ms: number) => void;
}

interface UseReplayControllerReturn {
  state: ReplayState;
  controls: ReplayControls;
  error?: string; // Expose error from replayData if present
}

/**
 * Hook to control replay playback
 * @param replayData - The replay result containing frames and optional error
 * @param initialSpeed - Default playback speed in milliseconds per frame (default: 1000ms)
 * @returns State, controls, and optional error
 */
export function useReplayController(
  replayData: ReplayResult | null,
  initialSpeed: number = 1000
): UseReplayControllerReturn {
  // State
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(initialSpeed);

  // Ref to store interval ID for cleanup
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Derived values
  const totalFrames = useMemo(() => {
    return replayData?.frames?.length ?? 0;
  }, [replayData]);

  const activeState = useMemo<GameState | null>(() => {
    if (!replayData?.frames || totalFrames === 0) {
      return null;
    }

    // Bounds check
    if (
      currentFrameIndex < 0 ||
      currentFrameIndex >= totalFrames ||
      !replayData.frames[currentFrameIndex]
    ) {
      return null;
    }

    return replayData.frames[currentFrameIndex]?.state ?? null;
  }, [replayData, currentFrameIndex, totalFrames]);

  // Reset state when replayData changes
  useEffect(() => {
    setCurrentFrameIndex(0);
    setIsPlaying(false);
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [replayData]);

  // Manage playback interval
  useEffect(() => {
    // Clear existing interval if any
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Only start interval if playing and we have frames
    if (!isPlaying || totalFrames === 0) {
      return;
    }

    // Start interval
    intervalRef.current = setInterval(() => {
      setCurrentFrameIndex((prevIndex) => {
        const nextIndex = prevIndex + 1;

        // Check if we've reached the end
        if (nextIndex >= totalFrames) {
          // Auto-pause at end
          setIsPlaying(false);
          // Clear interval
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          // Return last valid index
          return totalFrames - 1;
        }

        return nextIndex;
      });
    }, playbackSpeed);

    // Cleanup function
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, playbackSpeed, totalFrames]);

  // Control functions (wrapped in useCallback for stable references)
  const play = useCallback(() => {
    if (totalFrames === 0) {
      return; // No-op if no frames
    }

    // Auto-restart: if at end, reset to beginning
    setCurrentFrameIndex((prevIndex) => {
      if (prevIndex >= totalFrames - 1) {
        return 0;
      }
      return prevIndex;
    });

    setIsPlaying(true);
  }, [totalFrames]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    // Interval will be cleared by useEffect cleanup
  }, []);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  const nextFrame = useCallback(() => {
    if (totalFrames === 0) {
      return; // No-op if no frames
    }

    setCurrentFrameIndex((prevIndex) => {
      const nextIndex = prevIndex + 1;
      // Clamp to [0, totalFrames - 1]
      return Math.min(nextIndex, totalFrames - 1);
    });
  }, [totalFrames]);

  const prevFrame = useCallback(() => {
    if (totalFrames === 0) {
      return; // No-op if no frames
    }

    setCurrentFrameIndex((prevIndex) => {
      const prevIndexValue = prevIndex - 1;
      // Clamp to [0, totalFrames - 1]
      return Math.max(prevIndexValue, 0);
    });
  }, [totalFrames]);

  const goToFrame = useCallback(
    (index: number) => {
      if (totalFrames === 0) {
        return; // No-op if no frames
      }

      // Clamp to [0, totalFrames - 1]
      const clampedIndex = Math.max(0, Math.min(index, totalFrames - 1));
      setCurrentFrameIndex(clampedIndex);
    },
    [totalFrames]
  );

  const setSpeed = useCallback((ms: number) => {
    // Ensure positive value
    const validSpeed = Math.max(1, ms);
    setPlaybackSpeed(validSpeed);
    // Interval will be restarted automatically by useEffect when playbackSpeed changes
  }, []);

  return {
    state: {
      activeState,
      currentFrameIndex,
      totalFrames,
      isPlaying,
      playbackSpeed,
    },
    controls: {
      play,
      pause,
      togglePlayPause,
      nextFrame,
      prevFrame,
      goToFrame,
      setSpeed,
    },
    error: replayData?.error, // Expose error for UI display
  };
}

