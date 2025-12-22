"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { GameState, ActionType } from "@/lib/types/poker";
import { cn } from "@/lib/utils";

interface ActionPopupProps {
  gameState: GameState | null;
  currentUserId: string | null;
  onAction: (action: ActionType, amount?: number) => void;
  isLocalGame?: boolean;
}

type QueuedAction = "fold" | "check" | "call" | null;

export function ActionPopup({
  gameState,
  currentUserId,
  onAction,
  isLocalGame = false,
}: ActionPopupProps) {
  const [queuedAction, setQueuedAction] = useState<QueuedAction>(null);
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [showRaiseMenu, setShowRaiseMenu] = useState(false);
  const prevHandNumberRef = useRef<number | null>(null);
  const prevChipsToCallRef = useRef<number | null>(null);
  const prevRoundRef = useRef<string | null>(null);

  // Find hero (current player)
  const hero = useMemo(() => {
    if (!gameState || !currentUserId) return null;
    return gameState.players.find((p) => p.id === currentUserId);
  }, [gameState, currentUserId]);

  // Check if player is in game and not LEFT
  const isPlayerInGame = useMemo(() => {
    if (!gameState || !currentUserId) return false;
    const player = gameState.players.find((p) => p.id === currentUserId);
    if (!player) return false;

    // Check if player has LEFT status
    const hasLeft =
      player.left || gameState.left_players?.includes(currentUserId) || false;
    return !hasLeft;
  }, [gameState, currentUserId]);

  // Check if it's player's turn
  const isMyTurn = useMemo(() => {
    if (!gameState || !hero) return false;
    return gameState.currentActorSeat === hero.seat;
  }, [gameState, hero]);

  // Calculate highest bet
  const highestBet = useMemo(() => {
    if (!gameState?.players) return 0;
    return Math.max(...gameState.players.map((p) => p.currentBet || 0), 0);
  }, [gameState]);

  // Calculate chips to call
  const chipsToCall = useMemo(() => {
    if (!hero) return 0;
    return Math.max(0, highestBet - (hero.currentBet || 0));
  }, [hero, highestBet]);

  // Check if can check (no bet to call)
  const canCheck = useMemo(() => {
    return chipsToCall === 0;
  }, [chipsToCall]);

  // Calculate pot size (main pot + side pots + current bets)
  const totalPot = useMemo(() => {
    if (!gameState) return 0;
    const mainPot = gameState.pot || 0;
    const sidePotTotal =
      gameState.sidePots?.reduce((sum, pot) => sum + (pot?.amount || 0), 0) ||
      0;
    const currentBetsTotal =
      gameState.players?.reduce((sum, p) => sum + (p.currentBet || 0), 0) || 0;
    return mainPot + sidePotTotal + currentBetsTotal;
  }, [gameState]);

  // Get big blind amount
  const bigBlind = useMemo(() => {
    if (gameState?.bigBlind) return gameState.bigBlind;
    if (gameState?.config?.bigBlind) return gameState.config.bigBlind;
    // Fallback: find BB player's bet
    if (gameState?.bbSeat) {
      const bbPlayer = gameState.players.find(
        (p) => p.seat === gameState.bbSeat
      );
      return bbPlayer?.currentBet || 2;
    }
    return 2;
  }, [gameState]);

  // Calculate min/max raise amounts
  const raiseLimits = useMemo(() => {
    if (!hero || !gameState) return { min: 0, max: 0 };

    const minRaise = Math.max(gameState.minRaise || bigBlind * 2, bigBlind * 2);
    const maxRaise = hero.chips;

    return { min: minRaise, max: maxRaise };
  }, [hero, gameState, bigBlind]);

  // Initialize raise amount to min when raise menu opens
  useEffect(() => {
    if (showRaiseMenu && raiseLimits.min > 0) {
      setRaiseAmount(raiseLimits.min);
    }
  }, [showRaiseMenu, raiseLimits.min]);

  // Auto-execute queued action when turn arrives
  useEffect(() => {
    if (isMyTurn && queuedAction) {
      // Execute the queued action
      if (queuedAction === "fold") {
        onAction("fold");
      } else if (queuedAction === "check") {
        onAction("check");
      } else if (queuedAction === "call") {
        onAction("call", highestBet);
      }

      // Clear queue after execution
      setQueuedAction(null);
      setShowRaiseMenu(false);
    }
  }, [isMyTurn, queuedAction, onAction, highestBet]);

  // Safety cleanup: Clear queue on hand number change
  useEffect(() => {
    if (!gameState) return;

    const currentHandNumber = gameState.handNumber;

    if (
      prevHandNumberRef.current !== null &&
      currentHandNumber !== prevHandNumberRef.current
    ) {
      setQueuedAction(null);
      setShowRaiseMenu(false);
      // Reset chipsToCall reference for new hand
      prevChipsToCallRef.current = null;
    }

    prevHandNumberRef.current = currentHandNumber;
  }, [gameState?.handNumber]);

  // Reset chipsToCall reference when betting round changes (new street)
  useEffect(() => {
    if (!gameState) return;

    const currentRound = gameState.currentRound;

    if (
      prevRoundRef.current !== null &&
      prevRoundRef.current !== currentRound &&
      ["preflop", "flop", "turn", "river"].includes(currentRound)
    ) {
      // New betting round started - reset chipsToCall reference
      prevChipsToCallRef.current = null;
    }

    prevRoundRef.current = currentRound;
  }, [gameState?.currentRound]);

  // Safety cleanup: Clear queue if player leaves hand
  useEffect(() => {
    if (!isPlayerInGame || !hero || hero.folded || hero.chips === 0) {
      setQueuedAction(null);
      setShowRaiseMenu(false);
    }
  }, [isPlayerInGame, hero]);

  // Clear queued call/check when there's a raise (chipsToCall increases)
  useEffect(() => {
    if (!gameState || !hero) return;

    const currentChipsToCall = chipsToCall;

    // Only clear queue if chipsToCall increased (someone raised)
    if (
      prevChipsToCallRef.current !== null &&
      currentChipsToCall > prevChipsToCallRef.current &&
      queuedAction &&
      (queuedAction === "call" || queuedAction === "check")
    ) {
      // Someone raised - clear queued call/check (should fold instead)
      console.log("[ActionPopup] Clearing queued action due to raise", {
        previousChipsToCall: prevChipsToCallRef.current,
        currentChipsToCall,
        queuedAction,
      });
      setQueuedAction(null);
    }

    prevChipsToCallRef.current = currentChipsToCall;
  }, [chipsToCall, gameState, hero, queuedAction]);

  // Hide component if player not in game or no game state
  if (!gameState || !isPlayerInGame || !hero) {
    return null;
  }

  // Handle button clicks
  const handleFold = () => {
    if (isMyTurn) {
      onAction("fold");
    } else {
      // Toggle queue
      setQueuedAction(queuedAction === "fold" ? null : "fold");
    }
  };

  const handleCheck = () => {
    if (isMyTurn) {
      onAction("check");
    } else {
      // Toggle queue
      setQueuedAction(queuedAction === "check" ? null : "check");
    }
  };

  const handleCall = () => {
    if (isMyTurn) {
      onAction("call", highestBet);
    } else {
      // Toggle queue
      setQueuedAction(queuedAction === "call" ? null : "call");
    }
  };

  const handleRaise = () => {
    if (isMyTurn) {
      // Toggle raise menu
      setShowRaiseMenu(!showRaiseMenu);
    }
    // Do nothing if not player's turn (cannot queue raise)
  };

  const handleRaiseSubmit = () => {
    if (!hero) return;
    if (raiseAmount >= raiseLimits.min && raiseAmount <= raiseLimits.max) {
      // Determine action type: "bet" if can check (no bet to call), "raise" otherwise
      const actionType: ActionType = canCheck ? "bet" : "raise";
      // For bet: amount is the bet amount itself
      // For raise: amount is total bet amount (chipsToCall + raiseAmount)
      const totalAmount = canCheck ? raiseAmount : chipsToCall + raiseAmount;
      onAction(actionType, totalAmount);
      setShowRaiseMenu(false);
      setRaiseAmount(raiseLimits.min);
    }
  };

  const handleQuickSize = (multiplier: number, isAllIn: boolean = false) => {
    if (!hero) return;

    if (isAllIn) {
      // All-In: raise amount is remaining chips after call
      const allInRaise = Math.max(0, hero.chips - chipsToCall);
      setRaiseAmount(Math.floor(allInRaise));
    } else {
      const potSize = totalPot * multiplier;
      const totalAmount = chipsToCall + potSize;
      const clampedAmount = Math.min(totalAmount, hero.chips);
      const raiseOnTop = Math.max(raiseLimits.min, clampedAmount - chipsToCall);
      setRaiseAmount(Math.floor(raiseOnTop));
    }
  };

  // Determine button states
  const foldQueued = queuedAction === "fold";
  const checkQueued = queuedAction === "check";
  const callQueued = queuedAction === "call";
  const checkDisabled = !canCheck && !isMyTurn;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Raise Menu (expanded above buttons) */}
      <AnimatePresence>
        {showRaiseMenu && isMyTurn && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="mb-4 bg-[#1a1a1a] border border-[#9A1F40] rounded-xl shadow-xl p-4 min-w-[20rem]"
          >
            <div className="space-y-4">
              {/* Header */}
              <div className="text-center">
                <h3 className="text-sm font-semibold text-white mb-1">
                  Raise Amount
                </h3>
                <p className="text-xs text-gray-400">
                  Total: ${chipsToCall + raiseAmount}
                </p>
              </div>

              {/* Slider */}
              <div className="space-y-2">
                <Slider
                  value={[raiseAmount]}
                  onValueChange={([value]) => {
                    const intValue = Math.floor(value);
                    const clamped = Math.max(
                      raiseLimits.min,
                      Math.min(raiseLimits.max, intValue)
                    );
                    setRaiseAmount(clamped);
                  }}
                  min={raiseLimits.min}
                  max={raiseLimits.max}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-[0.625rem] text-gray-400">
                  <span>${raiseLimits.min}</span>
                  <span>${raiseLimits.max}</span>
                </div>
              </div>

              {/* Numeric Input */}
              <div className="space-y-1">
                <Input
                  type="number"
                  value={raiseAmount}
                  onChange={(e) => {
                    const value = Math.floor(Number(e.target.value));
                    const clamped = Math.max(
                      raiseLimits.min,
                      Math.min(raiseLimits.max, value)
                    );
                    setRaiseAmount(clamped);
                  }}
                  min={raiseLimits.min}
                  max={raiseLimits.max}
                  className="w-full bg-[#2a2a2a] border-gray-600 text-white text-center"
                />
              </div>

              {/* Quick-Size Buttons */}
              <div className="grid grid-cols-4 gap-2">
                <Button
                  onClick={() => handleQuickSize(0.5)}
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 bg-[#2a2a2a] border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  1/2 Pot
                </Button>
                <Button
                  onClick={() => handleQuickSize(0.75)}
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 bg-[#2a2a2a] border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  3/4 Pot
                </Button>
                <Button
                  onClick={() => handleQuickSize(1)}
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 bg-[#2a2a2a] border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  Pot
                </Button>
                <Button
                  onClick={() => handleQuickSize(1, true)}
                  variant="outline"
                  size="sm"
                  className="text-xs h-8 bg-red-600 border-red-600 text-white hover:bg-red-700"
                >
                  All-In
                </Button>
              </div>

              {/* Submit Button */}
              <Button
                onClick={handleRaiseSubmit}
                disabled={
                  raiseAmount < raiseLimits.min || raiseAmount > raiseLimits.max
                }
                className="w-full h-9 bg-[#9A1F40] hover:bg-[#7a182f] text-white"
              >
                Raise ${raiseAmount}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Buttons - Horizontal Layout (Right to Left: Call, Raise, Check, Fold) */}
      <div className="flex items-center gap-2 flex-row-reverse">
        {/* Fold Button (rightmost) */}
        <Button
          onClick={handleFold}
          disabled={isMyTurn && showRaiseMenu}
          className={cn(
            "h-12 px-6 text-sm font-medium transition-all",
            foldQueued
              ? "bg-red-600 border-2 border-red-600 text-white shadow-lg"
              : isMyTurn
              ? "bg-red-600 border-2 border-red-600 text-white hover:bg-red-700"
              : "bg-[#2a2a2a] border-2 border-gray-600 text-gray-300 hover:bg-[#3a3a3a]"
          )}
        >
          {foldQueued ? "✓ Fold" : "Fold"}
        </Button>

        {/* Check Button */}
        <Button
          onClick={handleCheck}
          disabled={checkDisabled || (isMyTurn && showRaiseMenu)}
          className={cn(
            "h-12 px-6 text-sm font-medium transition-all",
            checkQueued
              ? "bg-[#9A1F40] border-2 border-[#9A1F40] text-white shadow-lg"
              : isMyTurn && canCheck
              ? "bg-[#2a2a2a] border-2 border-white text-white hover:bg-[#3a3a3a]"
              : canCheck && !isMyTurn
              ? "bg-[#2a2a2a] border-2 border-gray-600 text-gray-300 hover:bg-[#3a3a3a]"
              : "bg-[#2a2a2a] border-2 border-gray-600 text-gray-300 opacity-60 cursor-not-allowed"
          )}
        >
          {checkQueued ? "✓ Check" : "Check"}
        </Button>

        {/* Raise Button */}
        <Button
          onClick={handleRaise}
          disabled={!isMyTurn || hero.chips < raiseLimits.min}
          className={cn(
            "h-12 px-6 text-sm font-medium transition-all",
            isMyTurn && showRaiseMenu
              ? "bg-[#9A1F40] border-2 border-[#9A1F40] text-white shadow-lg"
              : isMyTurn
              ? "bg-[#2a2a2a] border-2 border-white text-white hover:bg-[#3a3a3a]"
              : "bg-[#2a2a2a] border-2 border-gray-600 text-gray-300 opacity-30 cursor-not-allowed"
          )}
        >
          Raise
        </Button>

        {/* Call Button (leftmost, conditional) */}
        {highestBet > (hero.currentBet || 0) && (
          <Button
            onClick={handleCall}
            disabled={isMyTurn && showRaiseMenu}
            className={cn(
              "h-12 px-6 text-sm font-medium transition-all",
              callQueued
                ? "bg-[#9A1F40] border-2 border-[#9A1F40] text-white shadow-lg"
                : isMyTurn
                ? "bg-[#2a2a2a] border-2 border-white text-white hover:bg-[#3a3a3a]"
                : "bg-[#2a2a2a] border-2 border-gray-600 text-gray-300 hover:bg-[#3a3a3a]"
            )}
          >
            {callQueued ? "✓ Call" : `Call $${chipsToCall}`}
          </Button>
        )}
      </div>
    </div>
  );
}
