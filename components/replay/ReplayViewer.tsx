"use client";

import { useMemo, useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PokerTable } from "@/components/game/PokerTable";
import { ReplayOrchestrator, type ReplayInput, type ReplayResult } from "@/lib/replay/ReplayOrchestrator";
import { useReplayController } from "@/lib/hooks";
import { createClientComponentClient } from "@/lib/supabaseClient";
import { Play, Pause, SkipForward, SkipBack, X, AlertCircle } from "lucide-react";
// @ts-ignore - Importing from shared backend
import { PokerCodec } from "@backend/domain/handHistory/PokerCodec";

interface HandSummary {
  id: string;
  game_id: string;
  hand_index: number;
  final_pot: number;
  winner_id: string | null;
  played_at: string;
  replay_data: string;
  player_manifest: Record<string, string>;
  config?: {
    gameType?: string;
    sb?: number;
    bb?: number;
    [key: string]: any;
  };
}

interface ReplayViewerProps {
  hand: HandSummary;
  onClose: () => void;
  currentUserId?: string; // Optional - will fetch if not provided
  playerNames?: Record<string, string>; // Optional - falls back to "Seat X"
}

/**
 * Speed preset options
 */
const SPEED_PRESETS = [
  { label: "0.25x", value: 4000 },
  { label: "0.5x", value: 2000 },
  { label: "1x", value: 1000 },
  { label: "2x", value: 500 },
  { label: "4x", value: 250 },
];

export function ReplayViewer({
  hand,
  onClose,
  currentUserId: propCurrentUserId,
  playerNames: propPlayerNames,
}: ReplayViewerProps) {
  const supabase = createClientComponentClient();
  const [currentUserId, setCurrentUserId] = useState<string | null>(
    propCurrentUserId || null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [orchestrationError, setOrchestrationError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState(false);

  // Decode hand data into ReplayInput
  const replayInput = useMemo<ReplayInput | null>(() => {
    try {
      if (!hand.replay_data) {
        console.error("[ReplayViewer] No replay_data found in hand object");
        setOrchestrationError("No replay data found for this hand");
        setIsLoading(false);
        return null;
      }

      // Validate variant - try config first, then infer from player count
      let variant: "six_max" | "heads_up" | "full_ring" | undefined = hand.config?.gameType as "six_max" | "heads_up" | "full_ring" | undefined;
      
      // If variant not in config, try to infer from player count
      if (!variant || !["six_max", "heads_up", "full_ring"].includes(variant)) {
        const playerCount = Object.keys(hand.player_manifest || {}).length;
        
        if (playerCount === 2) {
          variant = "heads_up";
        } else if (playerCount <= 6) {
          variant = "six_max";
        } else if (playerCount <= 9) {
          variant = "full_ring";
        }
      }
      
      if (!variant || !["six_max", "heads_up", "full_ring"].includes(variant)) {
        console.error("[ReplayViewer] Invalid or missing variant:", {
          variant,
          config: hand.config,
          playerCount: Object.keys(hand.player_manifest || {}).length,
          validVariants: ["six_max", "heads_up", "full_ring"],
        });
        setOrchestrationError(`Replay unavailable for this game type. Found: ${variant || "undefined"}, Players: ${Object.keys(hand.player_manifest || {}).length}`);
        setIsLoading(false);
        return null;
      }

      // Decode replay data
      let buffer: Uint8Array;
      try {
        buffer = PokerCodec.fromHex(hand.replay_data);
      } catch (hexError: any) {
        console.error("[ReplayViewer] Failed to convert hex to buffer:", hexError);
        throw new Error(`Failed to parse hex string: ${hexError?.message || "Unknown error"}`);
      }

      let decoded: any;
      try {
        decoded = PokerCodec.decode(buffer);
      } catch (decodeError: any) {
        console.error("[ReplayViewer] Failed to decode buffer:", decodeError);
        throw new Error(`Failed to decode replay data: ${decodeError?.message || "Unknown error"}`);
      }

      // Build config from hand history if available
      const config = hand.config
        ? {
            maxPlayers: variant === "heads_up" ? 2 : variant === "six_max" ? 6 : 9,
            blinds: {
              small: hand.config.sb || 1,
              big: hand.config.bb || 2,
            },
            buyIn: hand.config.buyIn || 0,
            variantSlug: variant,
          }
        : undefined;

      // Build ReplayInput
      const input: ReplayInput = {
        gameId: hand.game_id,
        variant: variant,
        manifest: hand.player_manifest,
        startingStacks: decoded.startingStacks || [],
        actions: decoded.actions || [],
        board: decoded.board || [],
        holeCards: decoded.holeCards || [],
        config: config,
      };

      return input;
    } catch (error: any) {
      console.error("[ReplayViewer] Error in decode process:", error);
      console.error("[ReplayViewer] Error stack:", error?.stack);
      setOrchestrationError(`Failed to decode hand data: ${error?.message || "Unknown error"}`);
      setIsLoading(false);
      return null;
    }
  }, [hand]);

  // Fetch currentUserId if not provided
  useEffect(() => {
    if (propCurrentUserId) {
      setCurrentUserId(propCurrentUserId);
      return;
    }

    const fetchUserId = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          setCurrentUserId(user.id);
        } else {
          // Fallback to first player in manifest
          const firstSeat = Object.keys(hand.player_manifest).sort(
            (a, b) => parseInt(a, 10) - parseInt(b, 10)
          )[0];
          if (firstSeat) {
            setCurrentUserId(hand.player_manifest[firstSeat]);
          }
        }
      } catch (error) {
        console.error("Error fetching user:", error);
        // Fallback to first player in manifest
        const firstSeat = Object.keys(hand.player_manifest).sort(
          (a, b) => parseInt(a, 10) - parseInt(b, 10)
        )[0];
        if (firstSeat) {
          setCurrentUserId(hand.player_manifest[firstSeat]);
        }
      }
    };

    fetchUserId();
  }, [propCurrentUserId, supabase, hand.player_manifest]);

  // Basic validation
  const isValidInput = useMemo(() => {
    if (!replayInput) return false;
    if (!replayInput.gameId || !replayInput.variant) {
      return false;
    }
    if (!replayInput.manifest || Object.keys(replayInput.manifest).length === 0) {
      return false;
    }
    if (!replayInput.startingStacks || replayInput.startingStacks.length === 0) {
      return false;
    }
    if (
      replayInput.startingStacks.length !== Object.keys(replayInput.manifest).length
    ) {
      return false;
    }
    return true;
  }, [replayInput]);

  // --- Client-Side Hydration: Fetch Names ---
  const [playerNames, setPlayerNames] = useState<Record<string, string>>(
    propPlayerNames || {}
  );

  // Generate replay timeline
  const replayResult = useMemo<ReplayResult | null>(() => {
    if (!replayInput || !isValidInput) {
      if (!replayInput) setIsLoading(false);
      return null;
    }

    try {
      setIsLoading(true);
      setOrchestrationError(null);
      // Inject the fetched names and currentUserId here
      const orchestrator = new ReplayOrchestrator(
        replayInput,
        playerNames,
        currentUserId || undefined
      );
      const result = orchestrator.generateReplay();
      setIsLoading(false);
      return result;
    } catch (error: any) {
      setOrchestrationError(error?.message || "Failed to generate replay");
      setIsLoading(false);
      return null;
    }
  }, [replayInput, isValidInput, playerNames]);

  // Use replay controller hook
  const { state, controls, error: controllerError } = useReplayController(
    replayResult,
    1000 // Default 1x speed
  );

  // Derive isHeadsUp from variant
  const isHeadsUp = replayInput?.variant === "heads_up";

  useEffect(() => {
    if (!hand.player_manifest) return;

    const fetchNames = async () => {
      const allPlayerIds = Object.values(hand.player_manifest);
      // Only fetch what we don't have
      const missingIds = allPlayerIds.filter(id => !playerNames[id]);
      
      if (missingIds.length === 0) return;

      // DIRECT DB CALL: Fetch usernames from profiles
      const { data } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', missingIds);

      if (data) {
        const newNames: Record<string, string> = {};
        data.forEach((p: any) => {
          if (p.username) newNames[p.id] = p.username;
        });
        setPlayerNames(prev => ({ ...prev, ...newNames }));
      }
    };

    fetchNames();
  }, [hand.player_manifest, supabase, playerNames]);

  // Handle close - pause playback
  const handleClose = useCallback(() => {
    controls.pause();
    onClose();
  }, [controls, onClose]);

  // Hotkeys: Spacebar for play/pause, Arrow keys for stepping
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if modal is open and not typing in an input/select
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      // Prevent default for arrow keys and spacebar to avoid scrolling/page jumping
      if (["ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }

      switch (e.key) {
        case " ":
          // Spacebar: toggle play/pause
          controls.togglePlayPause();
          break;
        case "ArrowLeft":
          // Left arrow: previous frame
          controls.prevFrame();
          break;
        case "ArrowRight":
          // Right arrow: next frame
          controls.nextFrame();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [controls]);

  // Find current speed preset label
  const currentSpeedLabel = useMemo(() => {
    const preset = SPEED_PRESETS.find((p) => p.value === state.playbackSpeed);
    return preset?.label || "1x";
  }, [state.playbackSpeed]);

  // Handle speed change
  const handleSpeedChange = useCallback(
    (value: string) => {
      const speedMs = parseInt(value, 10);
      if (!isNaN(speedMs)) {
        controls.setSpeed(speedMs);
      }
    },
    [controls]
  );

  // Show error if orchestration failed
  const showError = orchestrationError || controllerError;
  const displayError = showError && !dismissedError;

  return (
    <Dialog open={true} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] w-full h-[95vh] p-0 flex flex-col">
        <DialogTitle className="sr-only">Hand Replay</DialogTitle>
        <DialogDescription className="sr-only">
          Interactive replay viewer for poker hand {hand.hand_index} from game {hand.game_id.slice(0, 8)}
        </DialogDescription>
        
        {/* Header */}
        <div className="flex items-center p-4 border-b">
          <div>
            <h2 className="text-xl font-semibold">Hand Replay</h2>
            <p className="text-sm text-muted-foreground">
              Game: {hand.game_id.slice(0, 8)} • Hand #{hand.hand_index} • {replayInput?.variant?.replace("_", " ") || "Unknown"}
            </p>
          </div>
        </div>

        {/* Error Banner */}
        {displayError && (
          <div className="mx-4 mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">
                Replay Error
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {showError}
                {replayResult?.stoppedAtActionIndex !== undefined && (
                  <span className="ml-2">
                    (Stopped at action index: {replayResult.stoppedAtActionIndex})
                  </span>
                )}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setDismissedError(true)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 relative overflow-hidden">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Generating replay timeline...</p>
              </div>
            </div>
          ) : state.activeState && currentUserId && replayInput ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <PokerTable
                gameState={state.activeState}
                currentUserId={currentUserId}
                playerNames={playerNames}
                isHeadsUp={isHeadsUp}
                isLocalGame={false} // Replay should NOT use local game animation logic
              />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-muted-foreground">
                {!replayInput
                  ? "Failed to decode replay data"
                  : !currentUserId
                  ? "Loading user information..."
                  : "No replay data available"}
              </p>
            </div>
          )}
        </div>

        {/* Playback Control Bar */}
        <div className="border-t p-4 bg-card">
          <div className="flex items-center gap-4">
            {/* Play/Pause Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={controls.togglePlayPause}
              disabled={state.totalFrames === 0}
            >
              {state.isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>

            {/* Step Controls */}
            <Button
              variant="outline"
              size="icon"
              onClick={controls.prevFrame}
              disabled={state.totalFrames === 0 || state.currentFrameIndex === 0}
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={controls.nextFrame}
              disabled={
                state.totalFrames === 0 ||
                state.currentFrameIndex >= state.totalFrames - 1
              }
            >
              <SkipForward className="h-4 w-4" />
            </Button>

            {/* Frame Counter */}
            <div className="text-sm text-muted-foreground min-w-[100px] text-center">
              {state.currentFrameIndex + 1} / {state.totalFrames}
            </div>

            {/* Scrubber */}
            <div className="flex-1 flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={Math.max(0, state.totalFrames - 1)}
                value={state.currentFrameIndex}
                onChange={(e) => {
                  const index = parseInt(e.target.value, 10);
                  if (!isNaN(index)) {
                    controls.goToFrame(index);
                  }
                }}
                disabled={state.totalFrames === 0}
                className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${
                    state.totalFrames > 0
                      ? (state.currentFrameIndex / (state.totalFrames - 1)) * 100
                      : 0
                  }%, var(--secondary) ${
                    state.totalFrames > 0
                      ? (state.currentFrameIndex / (state.totalFrames - 1)) * 100
                      : 0
                  }%, var(--secondary) 100%)`,
                }}
              />
            </div>

            {/* Speed Control */}
            <Select
              value={state.playbackSpeed.toString()}
              onValueChange={handleSpeedChange}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue>{currentSpeedLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SPEED_PRESETS.map((preset) => (
                  <SelectItem key={preset.value} value={preset.value.toString()}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Hotkey Hint */}
          <div className="mt-2 text-xs text-muted-foreground text-center">
            <kbd className="px-2 py-1 bg-muted rounded text-xs">Space</kbd> Play/Pause •{" "}
            <kbd className="px-2 py-1 bg-muted rounded text-xs">←</kbd>{" "}
            <kbd className="px-2 py-1 bg-muted rounded text-xs">→</kbd> Step
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

