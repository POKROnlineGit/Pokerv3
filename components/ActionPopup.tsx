"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { GameState } from "@/lib/poker-game/ui/legacyTypes";
import { ActionType } from "@/lib/poker-game/engine/core/types";
import { cn } from "@/lib/utils";

interface ActionPopupProps {
  gameState: GameState | null;
  currentUserId: string | null;
  onAction: (action: ActionType, amount?: number) => void;
  isLocalGame?: boolean;
}

export function ActionPopup({
  gameState,
  currentUserId,
  onAction,
  isLocalGame = false,
}: ActionPopupProps) {
  const [betAmount, setBetAmount] = useState(0);
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [queuedAction, setQueuedAction] = useState<ActionType | null>(null);

  // Find current player
  const currentPlayer = useMemo(() => {
    if (!gameState || !currentUserId) return null;
    return gameState.players.find((p) => p.id === currentUserId);
  }, [gameState, currentUserId]);

  // Check if player is in hand
  const isInHand = useMemo(() => {
    return currentPlayer && !currentPlayer.folded && currentPlayer.chips > 0;
  }, [currentPlayer]);

  // Check if it's player's turn
  const isMyTurn = useMemo(() => {
    if (!gameState || !currentPlayer) return false;
    return gameState.currentActorSeat === currentPlayer.seat;
  }, [gameState, currentPlayer]);

  // Calculate chips to call
  const chipsToCall = useMemo(() => {
    if (!gameState || !currentPlayer) return 0;

    // Calculate max bet from all players (more reliable than betsThisRound array)
    const maxBet = gameState.players
      ? Math.max(...gameState.players.map((p) => p.betThisRound || 0), 0)
      : 0;

    const myBet = currentPlayer.betThisRound || 0;
    return Math.max(0, maxBet - myBet);
  }, [gameState, currentPlayer]);

  // Check if can check
  const canCheck = useMemo(() => {
    return chipsToCall === 0;
  }, [chipsToCall]);

  // Check if someone has bet/raised this round
  const hasSomeoneActed = useMemo(() => {
    if (!gameState || !gameState.players) return false;
    // Check if any player has bet more than 0
    return gameState.players.some((p) => (p.betThisRound || 0) > 0);
  }, [gameState]);

  // Get min raise amount
  const minRaise = useMemo(() => {
    return gameState?.minRaise || 0;
  }, [gameState]);

  // Get player stack
  const myStack = useMemo(() => {
    return currentPlayer?.chips || 0;
  }, [currentPlayer]);

  // Calculate bet/raise limits
  const betLimits = useMemo(() => {
    if (!currentPlayer || !gameState)
      return { min: 0, max: 0, canBet: false, canRaise: false };

    // Ensure minRaise is at least 2 (big blind fallback if not provided)
    const effectiveMinRaise = minRaise > 0 ? minRaise : 2;

    if (canCheck) {
      // Can bet (no one has bet yet)
      const canBet = myStack >= effectiveMinRaise;
      return {
        min: effectiveMinRaise,
        max: myStack,
        canBet,
        canRaise: false,
      };
    } else {
      // Can raise (someone has bet, need to call first, then raise)
      const remainingChips = myStack - chipsToCall;
      const canRaise = remainingChips >= effectiveMinRaise;
      return {
        min: effectiveMinRaise,
        max: Math.max(0, remainingChips),
        canBet: false,
        canRaise,
      };
    }
  }, [canCheck, minRaise, myStack, chipsToCall, currentPlayer, gameState]);

  // Initialize bet/raise amounts
  useEffect(() => {
    if (canCheck && betLimits.min > 0) {
      setBetAmount(betLimits.min);
    } else if (!canCheck && betLimits.min > 0) {
      setRaiseAmount(betLimits.min);
    }
  }, [canCheck, betLimits.min]);

  // Reset amounts when turn changes
  useEffect(() => {
    setBetAmount(0);
    setRaiseAmount(0);
  }, [isMyTurn]);

  // Track chipsToCall when action was queued to detect raises
  const [chipsToCallWhenQueued, setChipsToCallWhenQueued] = useState<
    number | null
  >(null);

  // When action is queued, store the current chipsToCall
  useEffect(() => {
    if (queuedAction === "check" || queuedAction === "call") {
      setChipsToCallWhenQueued(chipsToCall);
    } else if (queuedAction === null || queuedAction === "fold") {
      setChipsToCallWhenQueued(null);
    }
  }, [queuedAction, chipsToCall]);

  // If a raise occurs after queuing check/call, automatically change to fold
  // This must run BEFORE the auto-execute effect
  useEffect(() => {
    if (queuedAction && (queuedAction === "check" || queuedAction === "call")) {
      // If queued check and someone bet (chipsToCall > 0), change to fold
      if (queuedAction === "check" && chipsToCall > 0) {
        setQueuedAction("fold");
        setChipsToCallWhenQueued(null);
        return;
      }

      // If chipsToCall increased from when it was queued (someone raised), change to fold
      if (
        chipsToCallWhenQueued !== null &&
        chipsToCall > chipsToCallWhenQueued
      ) {
        setQueuedAction("fold");
        setChipsToCallWhenQueued(null);
      }
    }
  }, [chipsToCall, chipsToCallWhenQueued, queuedAction]);

  // Auto-execute queued action when it becomes player's turn
  // Validate the action before executing to prevent invalid actions
  useEffect(() => {
    if (isMyTurn && queuedAction) {
      // Validate the action is still valid before executing
      let actionToExecute = queuedAction;

      // If queued check but chipsToCall > 0, must fold instead (safety check)
      if (queuedAction === "check" && chipsToCall > 0) {
        actionToExecute = "fold";
      }
      // If queued call but chipsToCall increased significantly, fold instead
      // (This is a safety check - the conversion should have happened above)
      else if (
        queuedAction === "call" &&
        chipsToCallWhenQueued !== null &&
        chipsToCall > chipsToCallWhenQueued
      ) {
        actionToExecute = "fold";
      }

      // Execute the validated action
      onAction(actionToExecute);
      setQueuedAction(null);
      setChipsToCallWhenQueued(null);
    }
  }, [isMyTurn, queuedAction, chipsToCall, chipsToCallWhenQueued, onAction]);

  // Track previous phase and hand number to detect resets
  const prevPhaseRef = useRef<string | null>(null);
  const prevHandNumberRef = useRef<number | null>(null);

  // CRITICAL: Clear queued actions when phase changes OR hand number increments
  // This prevents stale queued actions from executing after a hand reset
  // (e.g., if player leaves and hand resets from Flop → Preflop)
  useEffect(() => {
    if (!gameState) return;

    const currentPhase = gameState.currentRound;
    const currentHandNumber = gameState.handNumber;

    // Detect phase change (including reversals like Flop → Preflop)
    const phaseChanged =
      prevPhaseRef.current !== null &&
      prevPhaseRef.current !== currentPhase;

    // Detect hand number increment (new hand started)
    const handIncremented =
      prevHandNumberRef.current !== null &&
      currentHandNumber > prevHandNumberRef.current;

    // Clear queued actions if phase changed OR hand incremented
    if (phaseChanged || handIncremented) {
      console.log(
        "[ActionPopup] Clearing queued action due to:",
        phaseChanged ? `phase change (${prevPhaseRef.current} → ${currentPhase})` : "",
        handIncremented ? `hand increment (${prevHandNumberRef.current} → ${currentHandNumber})` : ""
      );
      setQueuedAction(null);
      setChipsToCallWhenQueued(null);
    }

    // Update refs for next comparison
    prevPhaseRef.current = currentPhase;
    prevHandNumberRef.current = currentHandNumber;
  }, [gameState?.currentRound, gameState?.handNumber]);

  // Show popup conditions
  const shouldShow = useMemo(() => {
    if (!isInHand || !gameState) return false;

    // Show if it's my turn
    if (isMyTurn) return true;

    // Show pre-emptively if not my turn but I'm still in the hand
    // Only show if we're in a betting round (not waiting, showdown, or complete)
    const isBettingRound = ["preflop", "flop", "turn", "river"].includes(
      gameState.currentRound
    );
    return isBettingRound;
  }, [isInHand, isMyTurn, gameState]);

  const handleFold = () => {
    onAction("fold");
  };

  const handleCheck = () => {
    onAction("check");
  };

  const handleCall = () => {
    onAction("call");
  };

  const handleBet = () => {
    if (betAmount >= betLimits.min && betAmount <= betLimits.max) {
      onAction("bet", betAmount);
    }
  };

  const handleRaise = () => {
    const totalRaise = chipsToCall + raiseAmount;
    if (raiseAmount >= betLimits.min && totalRaise <= myStack) {
      onAction("raise", raiseAmount);
    }
  };

  const handleAllIn = () => {
    onAction("allin");
  };

  if (!shouldShow) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className={cn(
          "fixed bottom-4 right-4 z-50",
          "w-auto min-w-[200px] max-w-[280px]"
        )}
      >
        <div
          className={cn(
            "bg-[#1a1a1a] border rounded-xl shadow-xl p-3",
            "backdrop-blur-sm",
            isMyTurn
              ? "border-[#9A1F40] shadow-[0_0_20px_rgba(154,31,64,0.4)]"
              : "border-gray-600 opacity-80"
          )}
        >
          {/* Header - only show when it's player's turn */}
          {isMyTurn && (
            <div className="text-center mb-2">
              <h3 className="text-sm font-semibold text-white">Your Turn</h3>
            </div>
          )}

          {/* Queued action indicator */}
          {queuedAction && !isMyTurn && (
            <div className="mb-2 p-2 bg-[#9A1F40]/20 border border-[#9A1F40]/50 rounded text-center">
              <p className="text-xs text-[#9A1F40] font-medium">
                Queued:{" "}
                {queuedAction === "check"
                  ? "Check"
                  : queuedAction === "call"
                  ? `Call ($${chipsToCall})`
                  : "Fold"}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          {isMyTurn ? (
            <>
              {/* Fold and Check/Call buttons */}
              <div className="flex gap-2 mb-2">
                <Button
                  onClick={handleFold}
                  variant="destructive"
                  className="flex-1 h-9 text-sm font-medium bg-red-600 hover:bg-red-700"
                >
                  Fold
                </Button>
                {canCheck ? (
                  <Button
                    onClick={handleCheck}
                    variant="outline"
                    className="flex-1 h-9 text-sm font-medium border border-white text-white hover:bg-white hover:text-black"
                  >
                    Check
                  </Button>
                ) : (
                  <Button
                    onClick={handleCall}
                    variant="outline"
                    className="flex-1 h-9 text-sm font-medium border border-white text-white hover:bg-white hover:text-black"
                  >
                    Call ${chipsToCall}
                  </Button>
                )}
              </div>

              {/* Bet/Raise section */}
              {canCheck && betLimits.canBet ? (
                // Bet section
                <div className="space-y-2 mb-2">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-300">Bet</span>
                      <span className="text-sm font-bold text-white">
                        ${betAmount}
                      </span>
                    </div>
                    <Slider
                      value={[betAmount]}
                      onValueChange={([value]) => setBetAmount(value)}
                      min={betLimits.min}
                      max={betLimits.max}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span>${betLimits.min}</span>
                      <span>${betLimits.max}</span>
                    </div>
                  </div>
                  <Button
                    onClick={handleBet}
                    disabled={
                      betAmount < betLimits.min || betAmount > betLimits.max
                    }
                    className="w-full h-9 text-sm font-medium bg-[#9A1F40] hover:bg-[#7a182f] text-white"
                  >
                    Bet ${betAmount}
                  </Button>
                </div>
              ) : !canCheck && betLimits.canRaise ? (
                // Raise section
                <div className="space-y-2 mb-2">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-300">Raise</span>
                      <span className="text-sm font-bold text-white">
                        ${raiseAmount}
                      </span>
                    </div>
                    <Slider
                      value={[raiseAmount]}
                      onValueChange={([value]) => setRaiseAmount(value)}
                      min={betLimits.min}
                      max={betLimits.max}
                      step={1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span>${betLimits.min}</span>
                      <span>${betLimits.max}</span>
                    </div>
                    <div className="text-[10px] text-gray-500 text-center">
                      Total: ${chipsToCall + raiseAmount}
                    </div>
                  </div>
                  <Button
                    onClick={handleRaise}
                    disabled={
                      raiseAmount < betLimits.min ||
                      chipsToCall + raiseAmount > myStack
                    }
                    className="w-full h-9 text-sm font-medium bg-[#9A1F40] hover:bg-[#7a182f] text-white"
                  >
                    Raise ${raiseAmount}
                  </Button>
                </div>
              ) : null}

              {/* All-in button */}
              {myStack > 0 && (
                <Button
                  onClick={handleAllIn}
                  className="w-full h-9 text-sm font-medium bg-red-600 hover:bg-red-700 text-white"
                >
                  All-In ${myStack}
                </Button>
              )}
            </>
          ) : (
            // Pre-emptive actions (not my turn yet) - single button
            <div>
              {canCheck ? (
                <Button
                  onClick={() => {
                    // If already queued (check or fold), clear it. Otherwise queue check
                    if (queuedAction === "check" || queuedAction === "fold") {
                      setQueuedAction(null);
                    } else {
                      setQueuedAction("check");
                    }
                  }}
                  variant="outline"
                  className={cn(
                    "w-full h-9 text-sm font-medium border",
                    queuedAction === "check" || queuedAction === "fold"
                      ? "border-[#9A1F40] bg-[#9A1F40]/20 text-[#9A1F40]"
                      : "border-gray-500 text-gray-300 hover:bg-gray-700"
                  )}
                >
                  {queuedAction === "check"
                    ? "✓ Check/Fold"
                    : queuedAction === "fold"
                    ? "✓ Fold (raised)"
                    : "Check/Fold"}
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    // If already queued (call or fold), clear it. Otherwise queue call
                    if (queuedAction === "call" || queuedAction === "fold") {
                      setQueuedAction(null);
                    } else {
                      setQueuedAction("call");
                    }
                  }}
                  variant="outline"
                  className={cn(
                    "w-full h-9 text-sm font-medium border",
                    queuedAction === "call" || queuedAction === "fold"
                      ? "border-[#9A1F40] bg-[#9A1F40]/20 text-[#9A1F40]"
                      : "border-gray-500 text-gray-300 hover:bg-gray-700"
                  )}
                >
                  {queuedAction === "call"
                    ? `✓ Call/Fold ($${chipsToCall})`
                    : queuedAction === "fold"
                    ? "✓ Fold (raised)"
                    : `Call/Fold ($${chipsToCall})`}
                </Button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
