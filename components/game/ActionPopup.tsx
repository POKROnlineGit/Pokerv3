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
  onAction: (
    action: ActionType,
    amount?: number,
    isAllInCall?: boolean
  ) => void;
  onRevealCard?: (cardIndex: number) => void; // Callback for revealing cards during showdown
  isLocalGame?: boolean;
}

type QueuedAction = "fold" | "check" | "call" | null;

export function ActionPopup({
  gameState,
  currentUserId,
  onAction,
  onRevealCard,
  isLocalGame = false,
}: ActionPopupProps) {
  const [queuedAction, setQueuedAction] = useState<QueuedAction>(null);
  const [raiseAmount, setRaiseAmount] = useState(0); // Amount to raise on top (not total bet)
  const [showBetMenu, setShowBetMenu] = useState(false);
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

    // Check if player is permanently out (LEFT or REMOVED)
    const isPermanentlyOut =
      player.status === "LEFT" ||
      player.status === "REMOVED" ||
      player.left ||
      gameState.left_players?.includes(currentUserId) ||
      false;
    return !isPermanentlyOut;
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

  // Get last raise amount (the amount raised on top in the last raise)
  // According to backend: lastRaiseAmount is the raise amount on top, not the total bet
  // - For opening bets: lastRaiseAmount = betAmount
  // - For raises: lastRaiseAmount = raiseAmount (betAmount - currentBet)
  const lastRaiseAmount = useMemo(() => {
    // Use lastRaiseAmount from gameState (backend sends this)
    if (
      gameState?.lastRaiseAmount &&
      typeof gameState.lastRaiseAmount === "number" &&
      gameState.lastRaiseAmount > 0
    ) {
      return gameState.lastRaiseAmount;
    }

    // If not available, calculate from betting state as fallback
    // Find the difference between the highest bet and the second highest bet
    if (gameState?.players && gameState.players.length > 0) {
      const bets = gameState.players
        .map((p) => p.currentBet || 0)
        .filter((bet) => bet > 0)
        .sort((a, b) => b - a); // Sort descending

      if (bets.length >= 2) {
        // Last raise = highest bet - second highest bet
        const calculatedRaise = bets[0] - bets[1];
        if (calculatedRaise > 0) {
          return calculatedRaise;
        }
      } else if (bets.length === 1 && bets[0] > bigBlind) {
        // If only one bet and it's more than BB, it's an opening bet
        // For opening bets, lastRaiseAmount = betAmount (the bet itself)
        return bets[0];
      }
    }

    return 0;
  }, [gameState, bigBlind]);

  // Detect if there are all-in players with smaller bets than highestBet
  // This creates a dual call scenario
  const allInCallInfo = useMemo(() => {
    if (!gameState?.players || !hero) return null;

    // Find all-in players who have a bet less than the highest bet
    const allInPlayers = gameState.players.filter(
      (p) =>
        p.allIn && p.currentBet > 0 && p.currentBet < highestBet && !p.folded
    );

    if (allInPlayers.length === 0) return null;

    // Find the effective bet according to backend: _getCurrentBet() returns
    // Math.max(maxFromActingPlayers, maxFromAllInPlayers)
    // This ensures that when someone goes all-in for more than current bet,
    // the effective bet reflects that all-in amount
    const nonAllInPlayers = gameState.players.filter(
      (p) => !p.allIn && !p.folded
    );

    // Max bet from players who can still act (non-all-in)
    const maxFromActingPlayers =
      nonAllInPlayers.length > 0
        ? Math.max(...nonAllInPlayers.map((p) => p.currentBet || 0), 0)
        : 0;

    // Max bet from all-in players
    const maxFromAllInPlayers = Math.max(
      ...allInPlayers.map((p) => p.currentBet || 0),
      0
    );

    // Effective bet matches backend _getCurrentBet() logic
    const effectiveBet = Math.max(maxFromActingPlayers, maxFromAllInPlayers);

    // All-in call amount is the highest all-in bet (the amount needed to call the all-in player)
    const highestAllInBet = maxFromAllInPlayers;

    // The all-in call option is to call the all-in player's bet
    // The full call option is to call the effective bet (which now includes all-in bets)
    const allInCallAmount = highestAllInBet;
    const fullCallAmount = Math.max(effectiveBet, highestBet);

    // Only show dual options if all-in call is different from full call
    if (allInCallAmount < fullCallAmount) {
      return {
        hasDualCall: true,
        allInCallAmount: Math.max(0, allInCallAmount - (hero.currentBet || 0)),
        fullCallAmount: Math.max(0, fullCallAmount - (hero.currentBet || 0)),
      };
    }

    return null;
  }, [gameState, hero, highestBet]);

  // Effective chips to call (uses all-in call if dual scenario, otherwise highest bet)
  const effectiveChipsToCall = useMemo(() => {
    if (allInCallInfo?.hasDualCall) {
      // In dual call scenario, use all-in call amount as the "effective" call
      return allInCallInfo.allInCallAmount;
    }
    return chipsToCall;
  }, [allInCallInfo, chipsToCall]);

  // Calculate min/max raise amounts (amount to raise on top)
  const raiseLimits = useMemo(() => {
    if (!hero || !gameState) return { min: 0, max: 0 };

    // Calculate minimum raise amount on top:
    // Minimum raise = max(bigBlind, priorRaiseAmount) where priorRaiseAmount is the last raise if it exists
    // The lastRaiseAmount is calculated from the betting state (difference between highest and second highest bet)
    // If there's no prior raise (lastRaiseAmount is 0), use bigBlind
    // If there's a prior raise, use the max of that and bigBlind
    const minRaiseOnTop =
      lastRaiseAmount > 0 ? Math.max(lastRaiseAmount, bigBlind) : bigBlind;

    // Maximum raise amount on top = player's remaining chips after calling
    // Player needs effectiveChipsToCall to call, so max raise = hero.chips - effectiveChipsToCall
    const maxRaiseOnTop = Math.max(0, hero.chips - effectiveChipsToCall);

    return { min: minRaiseOnTop, max: maxRaiseOnTop };
  }, [hero, gameState, bigBlind, lastRaiseAmount, effectiveChipsToCall]);

  // Check if there are players who can still act with bigger stacks than the prior bet
  // Only allow jamming (all-in raise) if there's a player to act with a bigger stack
  const canJamOnAllIn = useMemo(() => {
    if (!gameState?.players || !hero || highestBet === 0) return false;

    // Find players who:
    // 1. Haven't folded
    // 2. Aren't all-in
    // 3. Have a bigger stack than the current highest bet (can cover the all-in)
    // 4. Can still act (their currentBet < highestBet, meaning they need to act)
    const actingPlayers = gameState.players.filter(
      (p) =>
        !p.folded &&
        !p.allIn &&
        p.chips > highestBet &&
        (p.currentBet || 0) < highestBet && // They haven't matched the bet yet
        p.id !== hero.id &&
        p.status !== "LEFT" &&
        p.status !== "REMOVED"
    );

    // Only allow jamming if there are players who can still act
    return actingPlayers.length > 0;
  }, [gameState, hero, highestBet]);

  // Calculate all-in amounts for button replacement logic
  const allInInfo = useMemo(() => {
    if (!hero) return null;

    const allInTotal = hero.chips;
    const allInRaiseAmount = Math.max(0, hero.chips - effectiveChipsToCall);

    return {
      total: allInTotal,
      raiseAmount: allInRaiseAmount,
      lessThanCall: allInTotal < effectiveChipsToCall,
      lessThanMinRaise:
        allInRaiseAmount > 0 && allInRaiseAmount < raiseLimits.min,
      canMakeMinRaise: allInRaiseAmount >= raiseLimits.min,
      canJam: canJamOnAllIn && allInRaiseAmount > 0, // Can jam if there are players to act with bigger stacks
    };
  }, [hero, effectiveChipsToCall, raiseLimits.min, canJamOnAllIn]);

  // Initialize raise amount to min when raise menu opens
  useEffect(() => {
    if (showBetMenu && raiseLimits.min > 0) {
      // Always default to minimum raise amount on top
      setRaiseAmount(raiseLimits.min);
    }
  }, [showBetMenu, raiseLimits.min]);

  // Auto-execute queued action when turn arrives
  useEffect(() => {
    if (isMyTurn && queuedAction) {
      // Execute the queued action
      if (queuedAction === "fold") {
        onAction("fold");
      } else if (queuedAction === "check") {
        onAction("check");
      } else if (queuedAction === "call") {
        // Backend expects the amount TO CALL, not the total bet
        // For queued calls, use the full call (not all-in call)
        if (allInCallInfo?.hasDualCall) {
          onAction("call", allInCallInfo.fullCallAmount, false);
        } else {
          onAction("call", effectiveChipsToCall, false);
        }
      }

      // Clear queue after execution
      setQueuedAction(null);
      setShowBetMenu(false);
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
      setShowBetMenu(false);
      // Reset chipsToCall reference for new hand
      prevChipsToCallRef.current = null;
    }

    prevHandNumberRef.current = currentHandNumber;
  }, [gameState?.handNumber]);

  // Reset chipsToCall reference when betting round changes (new street)
  useEffect(() => {
    if (!gameState) return;

    const currentPhase = gameState.currentPhase;

    if (
      prevRoundRef.current !== null &&
      prevRoundRef.current !== currentPhase &&
      ["preflop", "flop", "turn", "river"].includes(currentPhase)
    ) {
      // New betting round started - reset chipsToCall reference
      prevChipsToCallRef.current = null;
    }

    prevRoundRef.current = currentPhase;
  }, [gameState?.currentPhase]);

  // Safety cleanup: Clear queue if player leaves hand
  useEffect(() => {
    if (!isPlayerInGame || !hero || hero.folded || hero.chips === 0) {
      setQueuedAction(null);
      setShowBetMenu(false);
    }
  }, [isPlayerInGame, hero]);

  // Clear queued call/check when there's a raise (effectiveChipsToCall increases)
  useEffect(() => {
    if (!gameState || !hero) return;

    const currentChipsToCall = effectiveChipsToCall;

    // Only clear queue if effectiveChipsToCall increased (someone raised)
    if (
      prevChipsToCallRef.current !== null &&
      currentChipsToCall > prevChipsToCallRef.current &&
      queuedAction &&
      (queuedAction === "call" || queuedAction === "check")
    ) {
      // Someone raised - clear queued call/check (should fold instead)
      setQueuedAction(null);
    }

    prevChipsToCallRef.current = currentChipsToCall;
  }, [effectiveChipsToCall, gameState, hero, queuedAction]);

  // Check if it's showdown phase (must be before conditional return for hooks)
  const isShowdown = gameState ? gameState.currentPhase === "showdown" : false;

  // Check if it's a contested showdown (hero hasn't folded and multiple players remaining)
  // Must be before conditional return to satisfy React Hooks rules
  const isContestedShowdown = useMemo(() => {
    if (!isShowdown || !hero || hero.folded) return false;
    // Count non-folded players
    const nonFoldedPlayers = gameState?.players?.filter((p) => !p.folded) || [];
    return nonFoldedPlayers.length > 1; // More than just the hero
  }, [isShowdown, hero, gameState]);

  // Hide component if player not in game or no game state
  // Show popup if there is an Active Actor, even if it's not me (enables Action Queuing)
  // Hide during Runouts and Transitions (when currentActorSeat === null), BUT allow during Showdown for reveal cards
  // Hide if hero is all-in (cannot queue Fold/Check)
  if (
    !gameState ||
    !isPlayerInGame ||
    !hero ||
    (gameState.currentActorSeat === null && !isShowdown) ||
    hero.allIn
  ) {
    return null;
  }

  // Allow folded players to see reveal controls during showdown
  // But hide betting controls if folded
  const showBettingControls = !hero.folded;

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
    const callAmount = effectiveChipsToCall;

    if (isMyTurn) {
      // Backend expects the amount TO CALL, not the total bet
      onAction("call", callAmount);
    } else {
      // Toggle queue
      setQueuedAction(queuedAction === "call" ? null : "call");
    }
  };

  const handleAllIn = () => {
    if (!hero || !isMyTurn) return;
    onAction("allin", hero.chips);
  };

  const handleAllInCall = () => {
    if (!allInCallInfo || !hero || !isMyTurn) return;
    // Backend expects the amount TO CALL, not the total bet
    // isAllInCall: true indicates this is the all-in call (main pot only)
    onAction("call", allInCallInfo.allInCallAmount, true);
  };

  const handleFullCall = () => {
    if (!allInCallInfo || !hero || !isMyTurn) return;
    // Backend expects the amount TO CALL, not the total bet
    // isAllInCall: false (or undefined) indicates this is the full call (all pots)
    onAction("call", allInCallInfo.fullCallAmount, false);
  };

  const handleRaise = () => {
    if (isMyTurn) {
      // Toggle raise menu
      setShowBetMenu(!showBetMenu);
    }
    // Do nothing if not player's turn (cannot queue raise)
  };

  const handleBetSubmit = () => {
    if (!hero) return;

    // Validation: Ensure raise amount is valid
    if (
      raiseAmount >= raiseLimits.min &&
      raiseAmount <= raiseLimits.max &&
      Number.isInteger(raiseAmount) &&
      raiseAmount >= 0
    ) {
      // Calculate total bet amount: prior bet (highestBet) + raise amount on top
      // This is the total bet that will be sent to the server
      const totalBetAmount = highestBet + raiseAmount;

      // Always send unified "bet" action with total bet amount
      onAction("bet", totalBetAmount);
      setShowBetMenu(false);
      // Reset to minimum for next time
      setRaiseAmount(raiseLimits.min);
    }
  };

  const handleQuickSize = (multiplier: number, isAllIn: boolean = false) => {
    if (!hero) return;

    if (isAllIn) {
      // All-In: raise amount is remaining chips after call
      const allInRaise = Math.max(0, hero.chips - effectiveChipsToCall);
      setRaiseAmount(Math.floor(allInRaise));
    } else {
      // Use pot value directly (not totalPot which includes current bets)
      // Pot value is the actual pot size
      const potValue = gameState?.pot || 0;
      const raiseOnTop = Math.floor(potValue * multiplier);
      // Clamp to available chips
      const clampedRaise = Math.min(
        raiseOnTop,
        hero.chips - effectiveChipsToCall
      );
      // Set to max of minimum raise and calculated raise
      setRaiseAmount(Math.max(raiseLimits.min, clampedRaise));
    }
  };

  // Calculate if quick-size buttons should be disabled (raise would be less than minimum)
  const getQuickSizeDisabled = (multiplier: number) => {
    if (!hero || !gameState) return true;
    const potValue = gameState.pot || 0;
    const calculatedRaise = Math.floor(potValue * multiplier);
    const clampedRaise = Math.min(
      calculatedRaise,
      hero.chips - effectiveChipsToCall
    );
    return clampedRaise < raiseLimits.min;
  };

  // Determine button states
  const foldQueued = queuedAction === "fold";
  const checkQueued = queuedAction === "check";
  const callQueued = queuedAction === "call";
  const checkDisabled = !canCheck && !isMyTurn;

  // heroCards is already available from earlier in the component
  const heroCards = hero?.holeCards || [];

  // Helper function to format card display (e.g., "As" -> "A♠")
  const formatCardDisplay = (card: string | null | "HIDDEN") => {
    if (!card || card === "HIDDEN" || card === null) return "?";
    // Card format is like "As", "Kh", etc.
    const rank = card[0];
    const suit = card[1];
    const suitSymbols: Record<string, string> = {
      s: "♠",
      h: "♥",
      d: "♦",
      c: "♣",
    };
    return `${rank}${suitSymbols[suit] || suit}`;
  };

  // Show reveal mode during showdown for hero if they have cards
  // Hide reveal buttons in contested showdowns (cards are shown by default)
  // This allows both folded players and winners in uncontested showdowns to reveal their cards
  if (
    isShowdown &&
    onRevealCard &&
    heroCards.length > 0 &&
    hero &&
    !isContestedShowdown
  ) {
    const card1 = heroCards[0];
    const card2 = heroCards[1];
    const card1Display = formatCardDisplay(card1);
    const card2Display = formatCardDisplay(card2);

    // Use revealedIndices from hero (memoized with gameState dependency, so it's reactive)
    // Backend initializes to [] and updates when cards are revealed
    const revealedIndices = hero.revealedIndices || [];

    const card1Revealed = revealedIndices.includes(0);
    const card2Revealed = revealedIndices.includes(1);
    const bothRevealed = card1Revealed && card2Revealed;

    // Handler for revealing cards
    const handleReveal = (cardIndex: number) => {
      if (!revealedIndices.includes(cardIndex)) {
        onRevealCard(cardIndex);
      }
    };

    const handleRevealBoth = () => {
      if (!card1Revealed) {
        onRevealCard(0);
      }
      if (!card2Revealed) {
        onRevealCard(1);
      }
    };

    return (
      <div className="fixed bottom-6 right-6" style={{ zIndex: 9999 }}>
        {/* Visual Feedback Prompt */}
        <div className="mb-2 text-center">
          <p className="text-sm text-white font-medium">Show your cards?</p>
        </div>
        {/* Reveal Buttons - Horizontal Layout matching action buttons */}
        <div className="flex items-center gap-2 flex-row-reverse">
          {/* Reveal Card 2 Button (rightmost) */}
          <Button
            onClick={() => handleReveal(1)}
            disabled={card2Revealed}
            className={cn(
              "h-12 px-6 text-sm font-medium",
              card2Revealed
                ? "bg-green-600/80 border-2 border-green-500 text-white cursor-not-allowed"
                : "bg-[#2a2a2a] border-2 border-white text-white hover:bg-[#3a3a3a]"
            )}
          >
            {`Reveal Card 2 (${card2Display})`}
          </Button>

          {/* Reveal Card 1 Button */}
          <Button
            onClick={() => handleReveal(0)}
            disabled={card1Revealed}
            className={cn(
              "h-12 px-6 text-sm font-medium",
              card1Revealed
                ? "bg-green-600/80 border-2 border-green-500 text-white cursor-not-allowed"
                : "bg-[#2a2a2a] border-2 border-white text-white hover:bg-[#3a3a3a]"
            )}
          >
            {`Reveal Card 1 (${card1Display})`}
          </Button>

          {/* Reveal Both Button (leftmost) */}
          <Button
            onClick={handleRevealBoth}
            disabled={bothRevealed}
            className={cn(
              "h-12 px-6 text-sm font-medium",
              bothRevealed
                ? "bg-green-600/80 border-2 border-green-500 text-white cursor-not-allowed"
                : "bg-[#9A1F40] border-2 border-[#9A1F40] text-white hover:bg-[#7a182f]"
            )}
          >
            Reveal Both
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6" style={{ zIndex: 9999 }}>
      {/* Bet Menu (expanded above buttons) */}
      <AnimatePresence>
        {showBetMenu && isMyTurn && (
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
                  Raise: ${raiseAmount} | Total: ${highestBet + raiseAmount}
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
                  disabled={getQuickSizeDisabled(0.5)}
                  variant="outline"
                  size="sm"
                  className={cn(
                    "text-xs h-8",
                    getQuickSizeDisabled(0.5)
                      ? "bg-[#1a1a1a] border-gray-700 text-gray-500 cursor-not-allowed opacity-50"
                      : "bg-[#2a2a2a] border-gray-600 text-gray-300 hover:bg-gray-700"
                  )}
                >
                  1/2 Pot
                </Button>
                <Button
                  onClick={() => handleQuickSize(0.75)}
                  disabled={getQuickSizeDisabled(0.75)}
                  variant="outline"
                  size="sm"
                  className={cn(
                    "text-xs h-8",
                    getQuickSizeDisabled(0.75)
                      ? "bg-[#1a1a1a] border-gray-700 text-gray-500 cursor-not-allowed opacity-50"
                      : "bg-[#2a2a2a] border-gray-600 text-gray-300 hover:bg-gray-700"
                  )}
                >
                  3/4 Pot
                </Button>
                <Button
                  onClick={() => handleQuickSize(1)}
                  disabled={getQuickSizeDisabled(1)}
                  variant="outline"
                  size="sm"
                  className={cn(
                    "text-xs h-8",
                    getQuickSizeDisabled(1)
                      ? "bg-[#1a1a1a] border-gray-700 text-gray-500 cursor-not-allowed opacity-50"
                      : "bg-[#2a2a2a] border-gray-600 text-gray-300 hover:bg-gray-700"
                  )}
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
                onClick={handleBetSubmit}
                disabled={
                  raiseAmount < raiseLimits.min || raiseAmount > raiseLimits.max
                }
                className="w-full h-9 bg-[#9A1F40] hover:bg-[#7a182f] text-white"
              >
                Raise ${raiseAmount} (Total: ${highestBet + raiseAmount})
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Buttons - Horizontal Layout (Right to Left: Call, Raise, Check, Fold) */}
      {/* Only show betting controls if player hasn't folded */}
      {showBettingControls && (
        <div className="flex items-center gap-2 flex-row-reverse">
          {/* Fold Button (rightmost) */}
          <Button
            onClick={handleFold}
            disabled={isMyTurn && showBetMenu}
            className={cn(
              "h-12 px-6 text-sm font-medium",
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
            disabled={checkDisabled || (isMyTurn && showBetMenu)}
            className={cn(
              "h-12 px-6 text-sm font-medium",
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

          {/* Raise Button - Hide if all-in is less than call, replace with All In if less than min raise AND can jam */}
          {!allInInfo?.lessThanCall && (
            <Button
              onClick={
                allInInfo?.lessThanMinRaise && allInInfo?.canJam
                  ? handleAllIn
                  : handleRaise
              }
              disabled={
                !isMyTurn ||
                (allInInfo?.lessThanMinRaise && !allInInfo?.canJam
                  ? true // Disable if all-in is less than min raise but can't jam
                  : allInInfo?.lessThanMinRaise
                  ? false // Allow if can jam
                  : (highestBet > 0 &&
                      hero.chips < effectiveChipsToCall + raiseLimits.min) ||
                    (highestBet === 0 && hero.chips < bigBlind))
              }
              className={cn(
                "h-12 px-6 text-sm font-medium",
                isMyTurn && showBetMenu && !allInInfo?.lessThanMinRaise
                  ? "bg-[#9A1F40] border-2 border-[#9A1F40] text-white shadow-lg"
                  : isMyTurn
                  ? "bg-[#2a2a2a] border-2 border-white text-white hover:bg-[#3a3a3a]"
                  : "bg-[#2a2a2a] border-2 border-gray-600 text-gray-300 opacity-30 cursor-not-allowed"
              )}
            >
              {allInInfo?.lessThanMinRaise && allInInfo?.canJam
                ? `All In $${allInInfo.total}`
                : "Raise"}
            </Button>
          )}

          {/* Call Button(s) - Handle dual call scenario and all-in replacement */}
          {highestBet > (hero.currentBet || 0) && (
            <>
              {/* Dual call options: All-in call and Full call */}
              {allInCallInfo?.hasDualCall ? (
                <>
                  {/* All-in Call Button */}
                  <Button
                    onClick={handleAllInCall}
                    disabled={isMyTurn && showBetMenu}
                    className={cn(
                      "h-12 px-6 text-sm font-medium",
                      callQueued
                        ? "bg-[#9A1F40] border-2 border-[#9A1F40] text-white shadow-lg"
                        : isMyTurn
                        ? "bg-[#2a2a2a] border-2 border-white text-white hover:bg-[#3a3a3a]"
                        : "bg-[#2a2a2a] border-2 border-gray-600 text-gray-300 hover:bg-[#3a3a3a]"
                    )}
                    title="Eligible only for main pot, will go all-in"
                  >
                    {callQueued
                      ? "✓ Call"
                      : `Call $${allInCallInfo.allInCallAmount} (Main Pot Only)`}
                  </Button>

                  {/* Full Call Button */}
                  <Button
                    onClick={handleFullCall}
                    disabled={isMyTurn && showBetMenu}
                    className={cn(
                      "h-12 px-6 text-sm font-medium",
                      callQueued
                        ? "bg-emerald-600 border-2 border-emerald-600 text-white shadow-lg"
                        : isMyTurn
                        ? "bg-emerald-600 border-2 border-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-[#2a2a2a] border-2 border-gray-600 text-gray-300 hover:bg-[#3a3a3a]"
                    )}
                    title="Eligible for all pots, can continue betting"
                  >
                    {callQueued
                      ? "✓ Call"
                      : `Call $${allInCallInfo.fullCallAmount}`}
                  </Button>
                </>
              ) : allInInfo?.lessThanCall ? (
                /* All-in is less than call - replace Call with All In */
                <Button
                  onClick={handleAllIn}
                  disabled={isMyTurn && showBetMenu}
                  className={cn(
                    "h-12 px-6 text-sm font-medium",
                    callQueued
                      ? "bg-[#9A1F40] border-2 border-[#9A1F40] text-white shadow-lg"
                      : isMyTurn
                      ? "bg-[#2a2a2a] border-2 border-white text-white hover:bg-[#3a3a3a]"
                      : "bg-[#2a2a2a] border-2 border-gray-600 text-gray-300 hover:bg-[#3a3a3a]"
                  )}
                >
                  {callQueued ? "✓ All In" : `All In $${allInInfo.total}`}
                </Button>
              ) : (
                /* Standard single call */
                <Button
                  onClick={handleCall}
                  disabled={isMyTurn && showBetMenu}
                  className={cn(
                    "h-12 px-6 text-sm font-medium",
                    callQueued
                      ? "bg-[#9A1F40] border-2 border-[#9A1F40] text-white shadow-lg"
                      : isMyTurn
                      ? "bg-[#2a2a2a] border-2 border-white text-white hover:bg-[#3a3a3a]"
                      : "bg-[#2a2a2a] border-2 border-gray-600 text-gray-300 hover:bg-[#3a3a3a]"
                  )}
                >
                  {callQueued ? "✓ Call" : `Call $${effectiveChipsToCall}`}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
