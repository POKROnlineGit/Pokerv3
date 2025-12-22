"use client";

import { useEffect, useState, useRef, useLayoutEffect } from "react";
import { GameState, Player } from "@/lib/types/poker";
import { Card as CardType, getNextActivePlayer } from "@/lib/utils/pokerUtils";
import { Card } from "@/components/Card";
import { cn } from "@/lib/utils";
import { useDebugMode } from "@/lib/hooks/useDebugMode";
import { motion } from "framer-motion";

interface PokerTableProps {
  gameState: GameState & {
    left_players?: string[]; // Server may send left_players array
    currentPhase?: string; // Actual phase from server (may be "waiting")
  };
  currentUserId: string;
  onAction?: () => void;
  onRevealCard?: (cardIndex: number) => void; // Callback for revealing a card during showdown
  playerNames?: Record<string, string>;
  isLocalGame?: boolean;
  isHeadsUp?: boolean;
  runoutCards?: string[]; // Cards being animated for runout
  isRunningOut?: boolean; // Flag for runout animation
  playerDisconnectTimers?: Record<string, number>; // Disconnect countdown timers per player
  turnTimer?: {
    deadline: number;
    duration: number;
    activeSeat: number;
  } | null; // Turn timer data from turn_timer_started event
}

// Calculate seat positions using sin/cos for equal spacing
// This makes it scalable to any number of seats
// Uses different radii for x (wider) and y (smaller) to create an elliptical layout
function calculateSeatPositions(
  numSeats: number,
  radiusX: number = 48,
  radiusY: number = 42
) {
  const positions = [];
  for (let i = 0; i < numSeats; i++) {
    // Start at bottom (90 degrees offset) and go clockwise
    // Each seat is 360/numSeats degrees apart
    const angleInterval = (2 * Math.PI) / numSeats;
    // Apply rotation offset to shift positions
    const angle = angleInterval * i + Math.PI / 2;
    const x = 50 + radiusX * Math.cos(angle);
    const y = 50 + radiusY * Math.sin(angle);
    positions.push({
      left: `${x}%`,
      top: `${y}%`,
      transform: "translate(-50%, -50%)",
    });
  }
  return positions;
}

export function PokerTable({
  gameState,
  currentUserId,
  onAction,
  onRevealCard,
  playerNames,
  isLocalGame = false,
  isHeadsUp = false,
  runoutCards = [],
  isRunningOut = false,
  playerDisconnectTimers = {},
  turnTimer = null,
}: PokerTableProps) {
  const { isEnabled: debugMode } = useDebugMode();

  // Track cards that should be hidden (pending animation) - updated synchronously
  const [pendingCards, setPendingCards] = useState<string[]>([]);
  const prevCardsRef = useRef<string[]>([]);

  // Use useLayoutEffect to detect new cards synchronously before paint
  // This prevents the flash by hiding cards before they're painted
  useLayoutEffect(() => {
    const currentCards = gameState.communityCards || [];
    const prevCards = prevCardsRef.current;

    // Detect new cards
    const newCards = currentCards.filter(
      (card: string) => !prevCards.includes(card)
    );

    if (newCards.length > 0) {
      // Immediately hide new cards (synchronously, before paint)
      setPendingCards((prev) => [...new Set([...prev, ...newCards])]);
      prevCardsRef.current = currentCards;
    } else if (currentCards.length < prevCards.length) {
      // Cards were reset (new hand)
      setPendingCards([]);
      prevCardsRef.current = currentCards;
    } else {
      prevCardsRef.current = currentCards;
    }
  }, [gameState.communityCards]);

  // Remove cards from pending when they start animating
  useEffect(() => {
    if (isRunningOut && runoutCards.length > 0) {
      // Cards are now animating, remove them from pending
      setPendingCards((prev) =>
        prev.filter((card) => !runoutCards.includes(card))
      );
    }
  }, [isRunningOut, runoutCards, isLocalGame]);

  // Cards that should be hidden: pending cards OR cards in runoutCards but not animating yet
  const cardsToHide = isLocalGame
    ? [
        ...new Set([
          ...pendingCards,
          ...runoutCards.filter((card) => !isRunningOut),
        ]),
      ]
    : runoutCards.filter((card) => !isRunningOut);

  // Debug: Log animation props for local games
  useEffect(() => {
    if (isLocalGame) {
      console.log("[PokerTable] Animation props:", {
        runoutCards,
        isRunningOut,
        communityCards: gameState.communityCards,
        runoutCardsLength: runoutCards.length,
        pendingCards,
        cardsToHide,
      });
    }
  }, [
    runoutCards,
    isRunningOut,
    isLocalGame,
    gameState.communityCards,
    pendingCards,
    cardsToHide,
  ]);

  // Turn timer state - use ref to track current timer to avoid stale closures
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentTimerRef = useRef<typeof turnTimer>(null);

  // Track bets for animation and display
  const [betIndicators, setBetIndicators] = useState<
    Record<number, { amount: number; animating: boolean }>
  >({});
  const prevHoleCardsRef = useRef<Record<number, string[]>>({});

  // Update timer progress - use setInterval for smoother, more reliable updates
  useEffect(() => {
    // Clear any existing interval
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Reset progress if no timer
    if (!turnTimer) {
      setProgressPercent(0);
      currentTimerRef.current = null;
      return;
    }

    // Store current timer in ref to avoid stale closures
    currentTimerRef.current = turnTimer;

    // Calculate progress function
    const calculateProgress = () => {
      const timer = currentTimerRef.current;
      if (!timer) {
        setProgressPercent(0);
        return;
      }

      const now = Date.now();
      const remaining = Math.max(0, timer.deadline - now);
      const percent = Math.max(
        0,
        Math.min(100, (remaining / timer.duration) * 100)
      );

      setProgressPercent(percent);

      // Stop if timer expired
      if (remaining <= 0) {
        setProgressPercent(0);
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
      }
    };

    // Calculate immediately
    calculateProgress();

    // Update every 16ms for smooth animation (~60fps)
    timerIntervalRef.current = setInterval(calculateProgress, 16);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [turnTimer?.deadline, turnTimer?.duration, turnTimer?.activeSeat]);

  // Dynamic seat count based on game type
  const NUM_SEATS = isHeadsUp ? 2 : 6;
  // Use same radius for both heads-up and 6-max for consistency
  // Seats positioned so only ~20% of seat overlaps table edge
  const radiusX = 70; // Increased significantly to move seats further out
  const radiusY = 62; // Increased significantly to move seats further out

  // Find the current user's seat to position them at the bottom
  const currentUserSeat = gameState.players.find(
    (p) => p.id === currentUserId
  )?.seat;

  // Calculate positions with rotation so current user is at bottom
  const SEAT_POSITIONS = calculateSeatPositions(NUM_SEATS, radiusX, radiusY);

  // Helper function to map position index to actual seat number
  const getSeatForPosition = (positionIndex: number): number => {
    // Rotate seat mapping to get the seat of a given position
    let computedSeat = positionIndex;
    if (currentUserSeat !== undefined) {
      computedSeat =
        currentUserSeat + positionIndex > NUM_SEATS
          ? currentUserSeat + positionIndex - NUM_SEATS
          : currentUserSeat + positionIndex;
    }
    return computedSeat;
  };

  const getPlayerAtSeat = (seat: number): Player | undefined => {
    return gameState.players.find((p) => p.seat === seat);
  };

  const isCurrentPlayer = (player: Player) => {
    return (
      player.id === currentUserId &&
      gameState.currentActorSeat !== null &&
      gameState.currentActorSeat > 0 &&
      gameState.currentActorSeat === player.seat
    );
  };

  const isCurrentActor = (player: Player) => {
    return (
      gameState.currentActorSeat !== null &&
      gameState.currentActorSeat > 0 &&
      gameState.currentActorSeat === player.seat
    );
  };

  const isShowdown = gameState.currentRound === "showdown";

  // Check if we're in waiting phase (opponent disconnected)
  const isWaitingPhase = gameState.currentPhase === "waiting";

  // Track bet indicators and community card animations - directly from gameState
  useEffect(() => {
    // Track hole cards for animation detection
    // Update AFTER render to ensure isNewRound detection works correctly
    const currentHoleCards: Record<number, string[]> = {};
    gameState.players.forEach((player) => {
      if (player.holeCards && player.holeCards.length > 0) {
        // Filter out null values and HIDDEN, convert to string array
        // Only track actual card values for animation detection
        currentHoleCards[player.seat] = player.holeCards.filter(
          (c): c is string => c !== null && c !== "HIDDEN"
        ) as string[];
      } else {
        // Clear tracking for this seat if no cards
        currentHoleCards[player.seat] = [];
      }
    });
    prevHoleCardsRef.current = currentHoleCards;

    // Build indicators directly from gameState - that's it
    const newIndicators: Record<
      number,
      { amount: number; animating: boolean }
    > = {};

    gameState.players.forEach((player) => {
      const currentBet = player.currentBet || 0;
      // Show bet indicators for any player with a bet - gameState handles the logic
      if (currentBet > 0) {
        newIndicators[player.seat] = { amount: currentBet, animating: false };
      }
    });

    // Update indicators to match gameState exactly
    setBetIndicators(newIndicators);
  }, [gameState, isLocalGame]);
  const activePlayers = gameState.players.filter(
    (p) => !p.folded && p.chips > 0
  );
  const activePlayerCount = activePlayers.length;
  const isWaitingForOpponent = isWaitingPhase && activePlayerCount < 2;

  // Determine if this is a Heads-Up game (exactly 2 active players)
  const isHeadsUpGame = activePlayerCount === 2;

  return (
    <div
      className="relative mx-auto aspect-[5/3]"
      style={{
        width: "min(80vw, calc(80vh * 5 / 3), 45rem)",
        maxWidth: "45rem",
      }}
    >
      {/* Debug overlay (super user + debug mode only) */}
      {debugMode && (
        <div className="absolute top-4 left-4 bg-black/90 text-white p-4 rounded-lg text-xs font-mono z-50 border-2 border-yellow-500">
          <div className="font-bold mb-2 text-yellow-400">DEBUG INFO</div>
          <div>Button: Seat {gameState.buttonSeat}</div>
          <div>
            SB: Seat {gameState.sbSeat} | BB: Seat {gameState.bbSeat}
          </div>
          <div>Actor: Seat {gameState.currentActorSeat ?? "N/A"}</div>
          <div>
            Next: Seat{" "}
            {(() => {
              if (gameState.currentActorSeat === null) return "N/A";
              const nextPlayer = getNextActivePlayer(
                gameState.currentActorSeat,
                gameState.players.map((p) => ({
                  id: p.id,
                  seat: p.seat,
                  name: p.name,
                  chips: p.chips,
                  currentBet: p.currentBet,
                  totalBet: p.totalBet,
                  holeCards: p.holeCards as CardType[], // Cast string[] to Card[] for debug display
                  folded: p.folded,
                  allIn: p.allIn,
                  isBot: p.isBot,
                  eligibleToBet: !p.folded && !p.allIn && p.chips > 0, // Default to true for active players in debug
                }))
              );
              return nextPlayer || "N/A";
            })()}
          </div>
          <div>Round: {gameState.currentRound}</div>
          <div className="mt-2 pt-2 border-t border-yellow-500/50">
            <div className="text-yellow-400">Players (clockwise):</div>
            {Array.from({ length: NUM_SEATS }, (_, i) => i + 1).map((seat) => {
              const p = gameState.players.find((p) => p.seat === seat);
              const isActive = p && !p.folded && !p.allIn && p.chips > 0;
              return (
                <div
                  key={seat}
                  className={isActive ? "text-green-400" : "text-gray-400"}
                >
                  Seat {seat}: {p?.name || "Empty"} {p?.folded ? "(F)" : ""}{" "}
                  {p?.allIn ? "(AI)" : ""} {p?.chips || 0} chips
                </div>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-yellow-500/50">
            <div className="text-yellow-400">Total Chips:</div>
            <div className="text-white">
              {gameState.players.reduce((sum, p) => sum + (p.chips || 0), 0)}{" "}
              chips
            </div>
            <div className="text-yellow-400 mt-1">Pot:</div>
            <div className="text-white">
              {gameState.pot +
                (gameState.sidePots?.reduce(
                  (sum, pot) => sum + (pot.amount || 0),
                  0
                ) || 0)}{" "}
              chips
            </div>
          </div>
          <div className="mt-2 text-yellow-400">→ Clockwise direction</div>
        </div>
      )}

      {/* Table - Deep maroon/red oval felt with brown wooden border */}
      <div
        className="absolute inset-0 shadow-2xl"
        style={{
          background: "radial-gradient(circle at center, #7f1d1d, #4c0000)",
          borderRadius: "50% / 25%",
          border: "0.75rem solid #8b4513",
        }}
      >
        {/* Community cards area - centered, larger for heads-up - Higher z-index to appear above player status indicators */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex gap-2 z-30">
          {gameState.communityCards.map((card, i) => {
            // Check if card should be hidden/animated
            // For local games: hide if in runoutCards OR newly detected this render
            // For online games: only hide if in runoutCards (server controls timing)
            const shouldHide = isLocalGame
              ? cardsToHide.includes(card)
              : runoutCards.includes(card);
            const isRunoutCard = runoutCards.includes(card);
            const runoutIndex = runoutCards.indexOf(card);

            // Debug logging for local games
            if (isLocalGame && isRunoutCard && isRunningOut) {
              console.log(
                "[PokerTable] Animating card:",
                card,
                "runoutIndex:",
                runoutIndex,
                "runoutCards:",
                runoutCards,
                "isRunningOut:",
                isRunningOut
              );
            }

            return (
              <motion.div
                key={`community-${card}-${i}-${gameState.handNumber || 0}`}
                initial={
                  // Hide immediately if card should be hidden (prevents flash)
                  shouldHide ? { y: -80, rotate: -180, opacity: 0 } : false
                }
                animate={
                  // Only animate if card is in runoutCards AND animation is running
                  isRunoutCard && isRunningOut
                    ? { y: 0, rotate: 0, opacity: 1 }
                    : shouldHide
                    ? { y: -80, rotate: -180, opacity: 0 } // Keep hidden if should be hidden
                    : { y: 0, rotate: 0, opacity: 1 } // Normal state
                }
                transition={
                  isRunoutCard && isRunningOut
                    ? {
                        type: "spring",
                        stiffness: 400,
                        damping: 30,
                        delay: runoutIndex * 0.3,
                      }
                    : {}
                }
              >
                <Card card={card as CardType} />
              </motion.div>
            );
          })}
        </div>

        {/* Waiting for opponent banner - prominent message on table felt */}
        {isWaitingForOpponent && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-yellow-500/95 border-4 border-yellow-600 text-yellow-900 px-8 py-6 rounded-xl z-20 shadow-2xl">
            <div className="text-2xl font-bold text-center mb-2">
              Waiting for opponent...
            </div>
            <div className="text-sm text-center text-yellow-800">
              Game paused until another player joins
            </div>
          </div>
        )}

        {/* Street indicator - Above cards with equal spacing */}
        {!isWaitingForOpponent && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-[6rem] bg-black/80 text-white px-4 py-2 rounded-lg z-10">
            <div className="text-sm font-semibold uppercase">
              {gameState.currentRound}
            </div>
          </div>
        )}

        {/* Pot display - Below cards with equal spacing */}
        {(() => {
          const mainPot = gameState.pot || 0;
          const sidePotTotal =
            gameState.sidePots?.reduce(
              (sum, pot) => sum + (pot?.amount || 0),
              0
            ) || 0;
          const totalPot = mainPot + sidePotTotal;
          return totalPot > 0 ? (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 translate-y-[4rem] bg-black/90 text-white px-4 py-2 rounded-lg z-10">
              <div className="text-sm text-gray-300 mb-1">Pot</div>
              <div className="text-xl font-bold">${totalPot}</div>
            </div>
          ) : null;
        })()}

        {/* Bet indicators - positioned near center, around community cards */}
        {Object.entries(betIndicators).map(([seatStr, indicator]) => {
          const seat = Number(seatStr);
          const player = gameState.players.find((p) => p.seat === seat);
          if (!player || indicator.amount === 0) return null;

          // Calculate position around center based on seat
          // Find the correct seat index by matching seat numbers
          let seatIndex = -1;
          for (let i = 0; i < NUM_SEATS; i++) {
            if (getSeatForPosition(i) === seat) {
              seatIndex = i;
              break;
            }
          }
          if (seatIndex === -1) return null; // Skip if seat not found

          // Use the exact same angle calculation as player boxes
          // This ensures perfect alignment
          const angleInterval = (2 * Math.PI) / NUM_SEATS;
          const angle = angleInterval * seatIndex + Math.PI / 2;

          // Position bets closer to player boxes using the same angle
          const betRadiusX = 60; // Increased from 25 to move closer to player boxes
          const betRadiusY = 53; // Increased from 22 to move closer to player boxes
          const x = 50 + betRadiusX * Math.cos(angle);
          const y = 50 + betRadiusY * Math.sin(angle);

          return (
            <motion.div
              key={`bet-${seat}`}
              className="absolute z-[60]"
              style={{
                left: `calc(${x}% - 1.5rem)`,
                top: `calc(${y}% - 0.5rem)`,
                transform: "translate(-50%, -50%)",
              }}
              initial={
                indicator.animating
                  ? {
                      opacity: 0,
                      scale: 0.3,
                    }
                  : {
                      opacity: 1,
                      scale: 1,
                    }
              }
              animate={{
                opacity: 1,
                scale: 1,
              }}
              transition={
                indicator.animating
                  ? {
                      type: "spring",
                      stiffness: 300,
                      damping: 25,
                      duration: 0.5,
                    }
                  : {}
              }
            >
              <div className="bg-yellow-500/90 text-black px-3 py-1.5 rounded-lg shadow-lg border-2 border-yellow-600 text-center">
                <div className="text-base font-bold">${indicator.amount}</div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Player seats */}
      {SEAT_POSITIONS.map((position, index) => {
        const seat = getSeatForPosition(index);
        const player = getPlayerAtSeat(seat);
        const isEmpty = !player;
        const isCurrent = player && isCurrentPlayer(player);
        const isActor = player && isCurrentActor(player);
        const isFolded = player?.folded;
        const isDealer = player?.seat === gameState.buttonSeat;

        // Always trust the server's authoritative state for blinds
        const isSmallBlind = player?.seat === gameState.sbSeat;
        const isBigBlind = player?.seat === gameState.bbSeat;

        // Check if player has left (in left_players array from server OR left status)
        // This takes precedence over other states for visual feedback
        const hasLeftFromServer =
          player?.id && gameState.left_players
            ? gameState.left_players.includes(player.id)
            : false;

        // Check if player is disconnected (ghost state) or left
        const isDisconnected = player?.disconnected || player?.isGhost || false;
        const hasLeft = player?.left || hasLeftFromServer;

        return (
          <div key={seat} className="absolute z-20" style={position}>
            {isEmpty ? (
              <div className="bg-[#1a1a1a] text-white px-4 py-2 rounded-xl border-[0.1875rem] border-dashed border-gray-500 shadow-lg">
                Empty
              </div>
            ) : (
              <>
                {/* Show "Leaving After Hand" if player is leaving but hasn't left yet */}
                {player.leaving && !hasLeft && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-orange-600 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse z-40">
                    LEAVING AFTER HAND
                  </div>
                )}

                {/* Player box - scaled 1.3x */}
                <div
                  className={cn(
                    "bg-[#1a1a1a] border-[0.1875rem] rounded-xl p-3 min-w-[8.75rem] transition-all relative shadow-lg text-center z-10",
                    // White border by default
                    "border-white",
                    // Green glowing border when current player can act
                    isCurrent &&
                      isActor &&
                      !hasLeft &&
                      !isDisconnected &&
                      "border-[#4ade80] shadow-[0_0_1.25rem_rgba(74,222,128,0.6)]",
                    // Red glowing border when it's another player's turn
                    isActor &&
                      !isCurrent &&
                      !hasLeft &&
                      !isDisconnected &&
                      "border-[#ff4d4f] shadow-[0_0_1.25rem_rgba(255,77,79,0.6)]",
                    // Grey out if folded OR has left OR disconnected
                    (isFolded || hasLeft || isDisconnected) && "opacity-50",
                    // Additional styling for left players (completely greyed out)
                    hasLeft && "border-gray-500 grayscale",
                    // Disconnected state styling (might return - less greyed)
                    isDisconnected && !hasLeft && "border-blue-600/50"
                  )}
                  style={{
                    filter:
                      isDisconnected && !hasLeft
                        ? "grayscale(100%)"
                        : undefined,
                    transform: "scale(1.15)",
                    transformOrigin: "center",
                  }}
                >
                  {/* Name */}
                  <div
                    className={cn(
                      "text-base font-semibold truncate mb-1",
                      hasLeft
                        ? "text-gray-400"
                        : isDisconnected
                        ? "text-blue-300"
                        : "text-white"
                    )}
                  >
                    {player.id === currentUserId
                      ? player.name || "You"
                      : playerNames?.[player.id] ||
                        player.name ||
                        `Player ${seat}`}
                    {hasLeft && " (Left)"}
                  </div>

                  {/* Disconnected indicator (Reconnecting...) - Lower z-index to not block board */}
                  {isDisconnected &&
                    !hasLeft &&
                    (() => {
                      const endTime = playerDisconnectTimers[player.id];
                      const now = Date.now();
                      const secondsRemaining = endTime
                        ? Math.max(0, Math.ceil((endTime - now) / 1000))
                        : null;

                      return (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full z-25 flex items-center gap-1">
                          <span className="animate-pulse">🔄</span>
                          <span>
                            {secondsRemaining !== null && secondsRemaining > 0
                              ? `Reconnecting... ${secondsRemaining}s`
                              : "Reconnecting..."}
                          </span>
                        </div>
                      );
                    })()}

                  {/* Left indicator - Lower z-index to not block board during runout */}
                  {hasLeft && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gray-700 text-white text-xs px-2 py-0.5 rounded-full z-25">
                      Left Game
                    </div>
                  )}

                  {/* Hand type indicator - only show for current player */}
                  {player.playerHandType &&
                    !player.folded &&
                    player.id === currentUserId && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={cn(
                          "text-sm font-medium block mb-1",
                          // Strong hands in maroon/red
                          player.playerHandType === "Royal Flush" ||
                            player.playerHandType === "Straight Flush" ||
                            player.playerHandType === "Four of a Kind" ||
                            player.playerHandType === "Full House"
                            ? "text-red-400"
                            : // Good hands in orange
                            player.playerHandType === "Flush" ||
                              player.playerHandType === "Straight"
                            ? "text-orange-400"
                            : // Decent hands in yellow
                            player.playerHandType === "Three of a Kind" ||
                              player.playerHandType === "Two Pair"
                            ? "text-yellow-400"
                            : // Weak hands in default color
                              "text-gray-300"
                        )}
                      >
                        {player.playerHandType}
                      </motion.span>
                    )}

                  {/* Stack */}
                  <div className="text-sm text-white font-medium mb-1">
                    ${player.chips}
                  </div>

                  {/* Turn Timer - Progress Bar at bottom of player box */}
                  {turnTimer?.activeSeat === player.seat &&
                    progressPercent > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700/50 overflow-hidden rounded-b-xl z-5">
                        <div
                          className={cn(
                            "h-full",
                            // No CSS transitions - JavaScript updates handle animation smoothly
                            progressPercent > 50
                              ? "bg-green-500"
                              : progressPercent > 25
                              ? "bg-yellow-500"
                              : "bg-red-500"
                          )}
                          style={{
                            width: `${progressPercent}%`,
                            // Use will-change for better performance
                            willChange: "width",
                          }}
                        />
                      </div>
                    )}

                  {/* Dealer button - small white circle with "D" - High z-index to appear above border and timer bar */}
                  {isDealer && (
                    <div className="absolute -top-3 -left-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg z-50">
                      <span className="text-black text-xs font-bold">D</span>
                    </div>
                  )}

                  {/* Small blind indicator - High z-index to appear above border and timer bar */}
                  {/* In Heads-Up, Button is SB but we only show dealer badge, not SB badge */}
                  {/* In ring games, show SB badge only if not dealer */}
                  {isSmallBlind && !isDealer && (
                    <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-bold z-50">
                      SB
                    </div>
                  )}

                  {/* Big blind indicator - High z-index to appear above border and timer bar */}
                  {/* Show BB badge if player is BB and not dealer */}
                  {isBigBlind && !isDealer && (
                    <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold z-50">
                      BB
                    </div>
                  )}
                </div>

                {/* Hole cards - positioned above the player box, angled outward */}
                {(() => {
                  const isHero = player.id === currentUserId;
                  const isShowdown = gameState.currentRound === "showdown";

                  // Handle empty arrays: if folded player has empty holeCards, render two HIDDEN placeholders
                  const cardsToRender =
                    player.holeCards && player.holeCards.length > 0
                      ? player.holeCards
                      : player.folded
                      ? ["HIDDEN", "HIDDEN"] // Default to two HIDDEN cards for folded players
                      : []; // Don't render if no cards and not folded

                  // Don't render if no cards to show
                  if (cardsToRender.length === 0) {
                    return null;
                  }

                  // Determine card visibility:
                  // - For hero: always show actual cards (engine sends real cards)
                  // - For others: show "HIDDEN" if card is not revealed, or actual card if revealed
                  // - In showdown: cards may be partially revealed
                  const shouldShowFaceDown = (card: string | null) => {
                    if (isHero) return false; // Hero always sees their own cards
                    if (isShowdown) {
                      // In showdown, if card is "HIDDEN" or null, show back
                      return card === "HIDDEN" || card === null;
                    }
                    // Before showdown, hide all non-hero cards
                    return !isLocalGame || player.isBot;
                  };

                  // Check if cards are new (for animation trigger)
                  // Compare current cards with previous cards to detect new cards
                  const prevCards = prevHoleCardsRef.current[player.seat] || [];
                  const currentCards = (player.holeCards || []).filter(
                    (c): c is string => c !== null && c !== "HIDDEN"
                  );
                  // Only animate if this is the first time we see cards for this player
                  // (prev was empty, now has cards)
                  const isNewRound =
                    prevCards.length === 0 && currentCards.length > 0;

                  // Calculate card angle once per seat (stable across renders)
                  const seatIndex = SEAT_POSITIONS.findIndex(
                    (pos, idx) => getSeatForPosition(idx) === player.seat
                  );
                  const angleInterval = (2 * Math.PI) / NUM_SEATS;
                  const angle = angleInterval * seatIndex + Math.PI / 2;
                  const baseCardAngle = Math.cos(angle) * 15;
                  // Pre-calculate final angles for each card (stable values)
                  const card1Angle = baseCardAngle - 2;
                  const card2Angle = baseCardAngle + 2;

                  return (
                    <div
                      className="absolute left-1/2 transform -translate-x-1/2 flex z-0 bottom-full"
                      style={{
                        gap: "-1rem",
                        marginBottom: "-2.8rem", // Overlap player box by 40% (card height ~7rem * 0.4 = 2.8rem)
                      }}
                    >
                      {cardsToRender.map((card, i) => {
                        const cardValue =
                          card === "HIDDEN" || card === null ? "HIDDEN" : card;
                        const showBack = shouldShowFaceDown(card);

                        return (
                          <motion.div
                            key={`hole-${player.seat}-${cardValue}-${i}-${
                              gameState.handNumber || 0
                            }`}
                            initial={
                              isNewRound
                                ? {
                                    y: 40,
                                    opacity: 0,
                                    rotate: baseCardAngle,
                                  }
                                : false
                            }
                            animate={{
                              y: 0,
                              opacity: 1,
                              rotate: i === 0 ? card1Angle : card2Angle,
                            }}
                            transition={
                              isNewRound
                                ? {
                                    type: "spring",
                                    stiffness: 300,
                                    damping: 25,
                                    delay: i * 0.15,
                                  }
                                : undefined // No transition when not new - prevents animation restart
                            }
                            className={cn(
                              // Match player box styling: opacity-50 when folded, grayscale only when left
                              (player.folded ||
                                player.left ||
                                player.disconnected) &&
                                "opacity-50",
                              player.left && "grayscale"
                            )}
                            style={{ transform: "scale(1.1)" }}
                          >
                            <Card
                              card={cardValue as CardType | "HIDDEN"}
                              faceDown={showBack}
                            />
                          </motion.div>
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
