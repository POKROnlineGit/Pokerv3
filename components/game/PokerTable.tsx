"use client";

import { useEffect, useState, useRef, useLayoutEffect, useMemo } from "react";
import { GameState, Player } from "@/lib/types/poker";
import { Card as CardType, getNextActivePlayer } from "@/lib/utils/pokerUtils";
import { Card } from "@/components/Card";
import { cn } from "@/lib/utils";
import { useDebugMode } from "@/lib/hooks";
import { motion, AnimatePresence } from "framer-motion";
import { getClientHandStrength } from "@backend/domain/evaluation/ClientHandEvaluator";
// @ts-ignore - Importing from shared backend
import { calculateEquity } from "@backend/domain/evaluation/EquityCalculator";
import { Badge } from "@/components/ui/badge";

interface PokerTableProps {
  gameState: GameState & {
    left_players?: string[]; // Server may send left_players array
    currentPhase?: string; // Actual phase from server (may be "waiting")
    isPaused?: boolean; // Whether the game is paused
    hostId?: string; // Host ID for private games
  };
  currentUserId: string;
  onRevealCard?: (cardIndex: number) => void; // Callback for revealing a card during showdown
  playerNames?: Record<string, string>;
  isLocalGame?: boolean;
  isHeadsUp?: boolean;
  playerDisconnectTimers?: Record<string, number>; // Disconnect countdown timers per player
  turnTimer?: {
    deadline: number;
    duration: number;
    activeSeat: number;
  } | null; // Turn timer data from turn_timer_started event
  isSyncing?: boolean; // Whether we're currently syncing authoritative state
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
  // Offset to lower all seats slightly to account for card rendering above player boxes
  const verticalOffset = 10; // Percentage points to push seats down
  for (let i = 0; i < numSeats; i++) {
    // Start at bottom (90 degrees offset) and go clockwise
    // Each seat is 360/numSeats degrees apart
    const angleInterval = (2 * Math.PI) / numSeats;
    // Apply rotation offset to shift positions
    const angle = angleInterval * i + Math.PI / 2;
    const x = 50 + radiusX * Math.cos(angle);
    const y = 50 + radiusY * Math.sin(angle) + verticalOffset;
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
  onRevealCard,
  playerNames,
  isLocalGame = false,
  isHeadsUp = false,
  playerDisconnectTimers = {},
  turnTimer = null,
  isSyncing = false,
}: PokerTableProps) {
  const { isEnabled: debugMode } = useDebugMode();
  const isPaused = gameState.isPaused || false;

  // 1. MOUNT TRACKING: Detect if this is the first render vs an update
  // We use this to suppress animations on page load/refresh
  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
  }, []);

  // Turn timer state - use ref to track current timer to avoid stale closures
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentTimerRef = useRef<typeof turnTimer>(null);

  // Track bets for animation and display
  const [betIndicators, setBetIndicators] = useState<
    Record<number, { amount: number; animating: boolean }>
  >({});
  const prevHoleCardsRef = useRef<Record<number, string[]>>({});
  const prevBetsRef = useRef<Record<number, number>>({});
  const betAnimationTimeoutsRef = useRef<Record<number, NodeJS.Timeout>>({});
  const prevEquitiesRef = useRef<Record<number, number | undefined>>({});
  const equityAnimationRef = useRef<Record<number, boolean>>({});
  const equityAnimationTimeoutsRef = useRef<Record<number, NodeJS.Timeout>>({});

  // Calculate hand strength for hero player using client evaluator
  const heroHandStrength = useMemo(() => {
    const heroPlayer = gameState.players.find((p) => p.id === currentUserId);
    if (
      !heroPlayer ||
      !heroPlayer.holeCards ||
      heroPlayer.holeCards.length < 2
    ) {
      return null;
    }

    // Filter out HIDDEN/null cards
    const holeCards = heroPlayer.holeCards.filter(
      (c): c is string => c !== null && c !== "HIDDEN"
    );
    const communityCards = (gameState.communityCards || []).filter(
      (c): c is string => c !== null && c !== "HIDDEN"
    );

    if (holeCards.length < 2) {
      return null;
    }

    try {
      return getClientHandStrength(holeCards, communityCards);
    } catch (error) {
      console.error("Error calculating hand strength:", error);
      return null;
    }
  }, [gameState.players, gameState.communityCards, currentUserId]);

  // Calculate equity for all players during runouts
  const playerEquities = useMemo(() => {
    // Check if we're in a runout state:
    // - Multiple players have cards revealed (not HIDDEN)
    // - Not showdown
    // - Game is active (not waiting)
    const isShowdown = gameState.currentPhase === "showdown";
    const isWaitingPhase = gameState.currentPhase === "waiting";
    const isGameActive = !isWaitingPhase;

    if (isShowdown || !isGameActive) {
      return {}; // Don't calculate during showdown or when game is not active
    }

    // Find all active players with revealed cards (not folded, have 2 revealed cards)
    const playersWithRevealedCards = gameState.players.filter((player) => {
      if (player.folded || !player.holeCards || player.holeCards.length < 2) {
        return false;
      }
      // Check if player has 2 revealed cards (not HIDDEN or null)
      const revealedCards = player.holeCards.filter(
        (c): c is string => c !== null && c !== "HIDDEN"
      );
      return revealedCards.length === 2;
    });

    // Need at least 2 players with revealed cards for equity calculation
    if (playersWithRevealedCards.length < 2) {
      return {};
    }

    // Prepare hands and board for equity calculation
    const hands: string[][] = [];
    const playerSeatMap: number[] = []; // Map from hands array index to player seat

    playersWithRevealedCards.forEach((player) => {
      const revealedCards = player.holeCards.filter(
        (c): c is string => c !== null && c !== "HIDDEN"
      );
      if (revealedCards.length === 2) {
        hands.push(revealedCards);
        playerSeatMap.push(player.seat);
      }
    });

    if (hands.length < 2) {
      return {};
    }

    // Get community cards (board)
    const board = (gameState.communityCards || []).filter(
      (c): c is string => c !== null && c !== "HIDDEN"
    );

    try {
      // Calculate equity
      const result = calculateEquity(hands, board);

      // Map equities back to player seats
      const equities: Record<number, number> = {};
      result.equities.forEach((equity, index) => {
        const seat = playerSeatMap[index];
        equities[seat] = equity;
      });

      return equities;
    } catch (error) {
      console.error("Error calculating equity:", error);
      return {};
    }
  }, [
    gameState.players,
    gameState.communityCards,
    gameState.currentPhase,
    gameState.currentPhase,
  ]);

  // Update timer progress - use setInterval for smoother, more reliable updates
  useEffect(() => {
    // Clear any existing interval
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Reset progress if no timer or game is paused (for private games)
    if (!turnTimer || isPaused) {
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
  }, [
    turnTimer?.deadline,
    turnTimer?.duration,
    turnTimer?.activeSeat,
    isPaused,
  ]);

  // Dynamic seat count based on game type
  const NUM_SEATS = isHeadsUp
    ? 2
    : gameState.config?.maxPlayers ||
      (gameState.players.length > 0
        ? Math.max(...gameState.players.map((p) => p.seat))
        : 6);
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
    // Default to 1-based seat numbers when no current user (spectator mode)
    let computedSeat = positionIndex + 1;
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

  const isShowdown = gameState.currentPhase === "showdown";

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

    // Build indicators with animation detection - self-contained bet animation system
    const newIndicators: Record<
      number,
      { amount: number; animating: boolean }
    > = {};
    const prevBets = prevBetsRef.current;

    gameState.players.forEach((player) => {
      const currentBet = player.currentBet || 0;
      const prevBet = prevBets[player.seat] || 0;

      // Show bet indicators for any player with a bet
      if (currentBet > 0) {
        // Detect if bet changed (new bet or amount changed)
        const betChanged = currentBet !== prevBet;

        newIndicators[player.seat] = {
          amount: currentBet,
          animating: betChanged, // Animate if bet changed
        };

        // If bet changed, set up timeout to clear animation flag after animation completes
        if (betChanged) {
          // Clear any existing timeout for this seat
          if (betAnimationTimeoutsRef.current[player.seat]) {
            clearTimeout(betAnimationTimeoutsRef.current[player.seat]);
          }

          // Set timeout to clear animation flag after animation duration (500ms)
          betAnimationTimeoutsRef.current[player.seat] = setTimeout(() => {
            setBetIndicators((prev) => {
              const updated = { ...prev };
              if (updated[player.seat]) {
                updated[player.seat] = {
                  ...updated[player.seat],
                  animating: false,
                };
              }
              return updated;
            });
            delete betAnimationTimeoutsRef.current[player.seat];
          }, 500);
        }
      }

      // Update previous bet tracking
      prevBets[player.seat] = currentBet;
    });

    // Clear previous bets for players who no longer have bets
    Object.keys(prevBets).forEach((seatStr) => {
      const seat = Number(seatStr);
      const player = gameState.players.find((p) => p.seat === seat);
      if (!player || (player.currentBet || 0) === 0) {
        delete prevBets[seat];
        // Clear timeout if exists
        if (betAnimationTimeoutsRef.current[seat]) {
          clearTimeout(betAnimationTimeoutsRef.current[seat]);
          delete betAnimationTimeoutsRef.current[seat];
        }
      }
    });

    // Update indicators
    setBetIndicators(newIndicators);
    prevBetsRef.current = prevBets;

    // Track equity animations - detect when equity appears or disappears
    const currentEquities = playerEquities;
    const prevEquities = prevEquitiesRef.current;

    gameState.players.forEach((player) => {
      const seat = player.seat;
      const hasEquity = currentEquities[seat] !== undefined;
      const hadEquity = prevEquities[seat] !== undefined;

      // Detect if equity appeared or disappeared
      if (hasEquity !== hadEquity) {
        // Set animation flag immediately
        equityAnimationRef.current[seat] = true;

        // Clear animation flag after animation completes (500ms)
        if (equityAnimationTimeoutsRef.current[seat]) {
          clearTimeout(equityAnimationTimeoutsRef.current[seat]);
        }
        equityAnimationTimeoutsRef.current[seat] = setTimeout(() => {
          equityAnimationRef.current[seat] = false;
          delete equityAnimationTimeoutsRef.current[seat];
        }, 500);
      } else if (hasEquity && hadEquity) {
        // Equity value changed but still exists - no animation needed
        equityAnimationRef.current[seat] = false;
      }
    });

    // Clean up animation flags for seats that no longer have equity
    Object.keys(prevEquities).forEach((seatStr) => {
      const seat = Number(seatStr);
      if (currentEquities[seat] === undefined) {
        delete equityAnimationRef.current[seat];
        if (equityAnimationTimeoutsRef.current[seat]) {
          clearTimeout(equityAnimationTimeoutsRef.current[seat]);
          delete equityAnimationTimeoutsRef.current[seat];
        }
      }
    });

    prevEquitiesRef.current = currentEquities;

    // Cleanup function to clear timeouts on unmount
    return () => {
      Object.values(betAnimationTimeoutsRef.current).forEach((timeout) => {
        clearTimeout(timeout);
      });
      betAnimationTimeoutsRef.current = {};
      Object.values(equityAnimationTimeoutsRef.current).forEach((timeout) => {
        clearTimeout(timeout);
      });
      equityAnimationTimeoutsRef.current = {};
    };
  }, [gameState, isLocalGame, playerEquities]);
  const activePlayers = gameState.players.filter(
    (p) =>
      !p.folded &&
      p.chips > 0 &&
      p.status !== "LEFT" &&
      p.status !== "REMOVED" &&
      !p.left
  );
  const activePlayerCount = activePlayers.length;

  // Determine if this is a Heads-Up game (exactly 2 active players)
  const isHeadsUpGame = activePlayerCount === 2;

  return (
    <div
      className="relative mx-auto aspect-[5/3]"
      style={{
        width: "min(70vw, calc(70vh * 5 / 3), 38rem)",
        maxWidth: "38rem",
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
                  username: p.username,
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
          <div>Round: {gameState.currentPhase}</div>
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
                  Seat {seat}: {p?.username || "Empty"} {p?.folded ? "(F)" : ""}{" "}
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
                  (sum, pot) => sum + (pot?.amount || 0),
                  0
                ) || 0)}{" "}
              chips
            </div>
          </div>
          <div className="mt-2 text-yellow-400">→ Clockwise direction</div>
        </div>
      )}

      {/* Pause/Sync Overlay - Bright red button in center */}
      {(isPaused || isSyncing) && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[100]">
          <div className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 rounded-lg shadow-2xl border-2 border-red-700 font-bold text-lg uppercase">
            {isPaused ? "PAUSED" : "SYNCING"}
          </div>
        </div>
      )}

      {/* Table - Deep maroon/red oval felt with brown wooden border */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(circle at center, #7f1d1d, #4c0000)",
          borderRadius: "50% / 25%",
          border: "0.75rem solid #8b4513",
          transform: "perspective(1000px) rotateX(8deg)",
          transformStyle: "preserve-3d",
          boxShadow:
            "0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(0, 0, 0, 0.1), 0 10px 40px rgba(0, 0, 0, 0.6)",
        }}
      >
        {/* Community cards area - centered, larger for heads-up - Higher z-index to appear above player status indicators */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex gap-2 z-30">
          <AnimatePresence>
            {gameState.communityCards.map((card, i) => {
              // 2. UNIQUE KEYS: Combine card + index + hand number
              // This guarantees that a new deal creates new React instances
              const uniqueKey = `comm-${card}-${i}-${
                gameState.handNumber || 0
              }`;

              // Determine if this is flop (3 cards) or turn/river (4-5 cards)
              // Flop: stagger animations with delay
              // Turn/River: no delay for immediate animation
              const isFlop = gameState.communityCards.length === 3;
              const delay = isFlop ? i * 0.15 : 0; // Small delay for flop, no delay for turn/river

              return (
                <motion.div
                  key={uniqueKey}
                  initial={
                    // 3. CONDITIONAL ANIMATION:
                    // If mounted (update): Start off-screen with spin to animate in.
                    // If mounting (first load): Start at final position (y: 0) to skip animation.
                    isMountedRef.current
                      ? { y: -80, rotate: -180, opacity: 0 }
                      : false // 'false' tells motion to start at 'animate' state
                  }
                  animate={{
                    y: 0,
                    rotate: 0,
                    opacity: 1,
                  }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 30,
                    delay: delay,
                  }}
                >
                  <Card card={card as CardType} />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Street indicator - Above cards with equal spacing */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-[6rem] bg-black/80 text-white px-4 py-2 rounded-lg z-10">
          <div className="text-sm font-semibold uppercase">
            {gameState.currentPhase}
          </div>
        </div>

        {/* Pot display - Below cards with equal spacing */}
        {(() => {
          const mainPot = gameState.pot || 0;
          const sidePots =
            gameState.sidePots?.filter((pot) => (pot?.amount || 0) > 0) || [];
          const hasPots = mainPot > 0 || sidePots.length > 0;

          return hasPots ? (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 translate-y-[4rem] bg-black/90 text-white px-4 py-2 rounded-lg z-10">
              <div className="flex flex-col gap-2">
                {/* Pot */}
                {mainPot > 0 && (
                  <div className="text-center">
                    <div className="text-sm text-gray-300 mb-1">Pot</div>
                    <div className="text-xl font-bold">${mainPot}</div>
                  </div>
                )}
                {/* Side Pots */}
                {sidePots.map((pot, index) => (
                  <div
                    key={index}
                    className="text-center border-t border-gray-600 pt-2"
                  >
                    <div className="text-xs text-gray-400 mb-1">
                      Side Pot {index + 1}
                    </div>
                    <div className="text-lg font-semibold text-yellow-400">
                      ${pot?.amount || 0}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null;
        })()}
      </div>

      {/* Bet indicators - positioned at cardinal directions relative to player boxes */}
      {/* Moved outside table div to avoid stacking context issues with transform */}
      {Object.entries(betIndicators).map(([seatStr, indicator]) => {
        const seat = Number(seatStr);
        const player = gameState.players.find((p) => p.seat === seat);
        if (!player || indicator.amount === 0) return null;

        // Find the player's position to get their angle
        let seatIndex = -1;
        let playerPosition: { left: string; top: string } | null = null;
        for (let i = 0; i < NUM_SEATS; i++) {
          if (getSeatForPosition(i) === seat) {
            seatIndex = i;
            playerPosition = SEAT_POSITIONS[i];
            break;
          }
        }
        if (seatIndex === -1 || !playerPosition) return null;

        // Calculate angle from player to center (in degrees, 0-360)
        // Player position is in percentage, center is at 50%, 50%
        const playerX = parseFloat(playerPosition.left);
        const playerY = parseFloat(playerPosition.top);
        const centerX = 50;
        const centerY = 50;

        // Calculate angle from center to player (we want opposite direction - from player to center)
        const dx = centerX - playerX;
        const dy = centerY - playerY;
        let angleRad = Math.atan2(dy, dx);
        let angleDeg = (angleRad * 180) / Math.PI;

        // Normalize to 0-360
        if (angleDeg < 0) angleDeg += 360;

        // Map to one of 6 cardinal directions (N, NE, SE, S, SW, NW)
        // Eliminated E and W - they're incorporated into NE/SE and NW/SW
        // Specific angle boundaries:
        // N: 270 ± 22.5 = 247.5° to 292.5°
        // S: 90 ± 22.5 = 67.5° to 112.5°
        // NE: 272.5° to 360° (wraps to 0°)
        // SE: 0° to 67.5°
        // NW: 180° to 247.5°
        // SW: 112.5° to 180°
        let directionIndex: number;
        if (angleDeg >= 247.5 && angleDeg < 292.5) {
          directionIndex = 0; // N
        } else if (angleDeg >= 67.5 && angleDeg < 112.5) {
          directionIndex = 3; // S
        } else if (angleDeg >= 272.5) {
          directionIndex = 1; // NE (272.5 to 360)
        } else if (angleDeg >= 0 && angleDeg < 67.5) {
          directionIndex = 2; // SE (0 to 67.5)
        } else if (angleDeg >= 180 && angleDeg < 247.5) {
          directionIndex = 5; // NW
        } else {
          // angleDeg >= 112.5 && angleDeg < 180
          directionIndex = 4; // SW
        }

        // Define the 6 directions with their offsets
        // Each direction: [xOffsetMult, yOffsetMult, anchorX, anchorY]
        // xOffsetMult/yOffsetMult: multipliers for offset direction (-1, 0, or 1)
        // anchorX/anchorY: anchor point (0=left/top edge, 0.5=center, 1=right/bottom edge)
        const directions = [
          [0, -1, 0.5, 1], // N (top) - half on top edge
          [1, -1, 0, 1], // NE (top-right) - quarter on corner
          [1, 1, 0, 0], // SE (bottom-right) - quarter on corner
          [0, 1, 0.5, 0], // S (bottom) - half on bottom edge
          [-1, 1, 1, 0], // SW (bottom-left) - quarter on corner
          [-1, -1, 1, 1], // NW (top-left) - quarter on corner
        ];

        const [xOffsetMult, yOffsetMult, anchorX, anchorY] =
          directions[directionIndex];

        // Player box dimensions: min-w-[8.75rem] scaled by 1.15 = ~10rem width
        // For half on/half off (edges N/S): offset by half the box size (5rem), reduced to 2.5rem
        // For quarter on (corners NE/SE/SW/NW): offset by quarter the box size (2.5rem), reduced to 1.25rem
        const isCorner =
          Math.abs(xOffsetMult) === 1 && Math.abs(yOffsetMult) === 1;
        const boxHalfWidth = 2.5; // rem (half of ~10rem scaled box, reduced by half)
        const boxQuarterWidth = 1.25; // rem (quarter of ~10rem scaled box, reduced by half)
        const offsetDistance = isCorner ? boxQuarterWidth : boxHalfWidth;

        // Calculate position: start at player box center, offset by direction
        // The player container is positioned at playerPosition and uses flexbox to center the player box
        // So the player box center is at playerPosition
        // We need to offset from that center point
        // Position bets similar to SB/BB/dealer badges - absolutely positioned relative to player container
        // Calculate offset in rem units
        // Increase horizontal offset slightly while keeping vertical the same
        const offsetX = xOffsetMult * offsetDistance * 1.25;
        const offsetY = yOffsetMult * offsetDistance;

        return (
          <motion.div
            key={`bet-${seat}`}
            className="absolute z-[60]"
            style={{
              left: playerPosition.left,
              top: playerPosition.top,
              transform: `translate(-50%, -50%)`,
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
            <div
              className="absolute bg-yellow-500/90 text-black px-3 py-1.5 rounded-lg shadow-lg border-2 border-yellow-600 text-center"
              style={{
                left: `calc(50% + ${offsetX}rem)`,
                top: `calc(50% + ${offsetY}rem)`,
                transform: `translate(${-anchorX * 100}%, ${-anchorY * 100}%)`,
              }}
            >
              <div className="text-base font-bold">${indicator.amount}</div>
            </div>
          </motion.div>
        );
      })}

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
        const isHost = gameState.hostId && player?.id === gameState.hostId;

        // Check if player has left (in left_players array from server OR left status OR leaving)
        // This takes precedence over other states for visual feedback
        const hasLeftFromServer =
          player?.id && gameState.left_players
            ? gameState.left_players.includes(player.id)
            : false;

        // Check if player is permanently out (LEFT or REMOVED)
        const isPermanentlyOut =
          player?.status === "LEFT" ||
          player?.status === "REMOVED" ||
          player?.left ||
          player?.leaving ||
          hasLeftFromServer;

        // Check if player is disconnected (ghost state) or permanently out
        const isDisconnected = player?.disconnected || player?.isGhost || false;
        // If player.leaving is true, treat them as left (server will remove at end of round)
        const hasLeft = isPermanentlyOut;
        const isRemoved = player?.status === "REMOVED";

        return (
          <div
            key={seat}
            className="absolute z-20 flex flex-col items-center"
            style={position}
          >
            {isEmpty ? (
              <div className="bg-[#1a1a1a] text-white px-4 py-2 rounded-xl border-[0.1875rem] border-dashed border-gray-500 shadow-lg">
                Empty
              </div>
            ) : (
              <>
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
                        : (player as any).status === "WAITING_FOR_NEXT_HAND"
                        ? "text-amber-300 opacity-75"
                        : "text-white"
                    )}
                  >
                    {player.id === currentUserId
                      ? player.username || "You"
                      : player.username ||
                        playerNames?.[player.id] ||
                        `Player ${seat}`}
                    {isRemoved && " (Removed)"}
                    {hasLeft && !isRemoved && " (Left)"}
                  </div>

                  {/* Waiting for next hand badge */}
                  {(player as any).status === "WAITING_FOR_NEXT_HAND" &&
                    !hasLeft && (
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-600/80 text-white text-[10px] px-2 py-0.5 rounded-full z-25">
                        Waiting for next round
                      </div>
                    )}

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
                            player.playerHandType === "Set" ||
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
                  {/* Don't show timer when game is paused (for private games) */}
                  {turnTimer?.activeSeat === player.seat &&
                    progressPercent > 0 &&
                    !isPaused && (
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

                  {/* Host indicator - Positioned bottom-left to avoid overlap with other badges */}
                  {isHost && (
                    <div className="absolute -bottom-2 -left-2 bg-yellow-500 text-black text-xs px-2 py-1 rounded-full font-bold z-50">
                      Host
                    </div>
                  )}

                  {/* Equity display - bottom right corner during runouts */}
                  <AnimatePresence>
                    {playerEquities[player.seat] !== undefined &&
                      !hasLeft &&
                      !isDisconnected &&
                      !player.folded && (
                        <motion.div
                          key={`equity-${player.seat}`}
                          className="absolute -bottom-2 -right-2 z-50"
                          initial={{
                            opacity: 0,
                            scale: 0.3,
                          }}
                          animate={{
                            opacity: 1,
                            scale: 1,
                          }}
                          exit={{
                            opacity: 0,
                            scale: 0.3,
                          }}
                          transition={
                            equityAnimationRef.current[player.seat]
                              ? {
                                  type: "spring",
                                  stiffness: 300,
                                  damping: 25,
                                  duration: 0.5,
                                }
                              : {}
                          }
                        >
                          <div className="bg-black/90 text-white text-xs px-2 py-1 rounded-lg font-semibold shadow-lg border border-white/30">
                            {playerEquities[player.seat].toFixed(1)}%
                          </div>
                        </motion.div>
                      )}
                  </AnimatePresence>
                </div>

                {/* Hand strength badge - only show for hero player, positioned below player box */}
                {player.id === currentUserId &&
                  heroHandStrength &&
                  !player.folded &&
                  !hasLeft &&
                  !isDisconnected && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-2 z-30"
                    >
                      <div className="bg-accent-600/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg shadow-lg border border-accent-500/50 text-xs font-semibold whitespace-nowrap">
                        {heroHandStrength}
                      </div>
                    </motion.div>
                  )}

                {/* Hole cards - positioned above the player box, angled outward */}
                {(() => {
                  const isHero = player.id === currentUserId;
                  const isShowdown = gameState.currentPhase === "showdown";

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
                  // - For others: use revealedIndices metadata during showdown for partial reveals
                  // - If no revealedIndices metadata is present, fall back to legacy HIDDEN/null logic
                  const revealedIndices: number[] = Array.isArray(
                    (player as any).revealedIndices
                  )
                    ? ((player as any).revealedIndices as number[])
                    : [];

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

                  // Calculate card angles - cards should be vertical with slight fan between them
                  // No outward skew based on position, just a small fan (one card slightly left, one slightly right)
                  const card1Angle = -2; // Slight left tilt
                  const card2Angle = 2; // Slight right tilt

                  return (
                    <div
                      className="absolute left-1/2 transform -translate-x-1/2 flex z-0 bottom-full"
                      style={{
                        gap: "-1rem",
                        marginBottom: "-2.8rem", // Overlap player box by 40% (card height ~7rem * 0.4 = 2.8rem)
                      }}
                    >
                      {cardsToRender.map((card, i) => {
                        const isRevealedIndex =
                          isHero ||
                          (isShowdown &&
                            (revealedIndices.length > 0
                              ? revealedIndices.includes(i)
                              : !(card === "HIDDEN" || card === null)));

                        // Trust server-sent cards: If a card value is provided, show it
                        // The backend now selectively masks cards (sending 'HIDDEN' or 'As')
                        // If the frontend receives 'As', it means the user is allowed to see it
                        // (Runout/Showdown/Hero), so we should always render the face
                        const cardValue =
                          card === "HIDDEN" || card === null ? "HIDDEN" : card;
                        const showBack =
                          cardValue === "HIDDEN" || cardValue === null;
                        const revealKey = showBack ? "down" : "up";

                        return (
                          <motion.div
                            key={`hole-${player.seat}-${i}-${
                              gameState.handNumber || 0
                            }-${revealKey}`}
                            initial={
                              isNewRound
                                ? {
                                    y: 40,
                                    opacity: 0,
                                    rotate: i === 0 ? card1Angle : card2Angle,
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
                              // Match player box styling: opacity-50 when folded, grayscale only when permanently out
                              (player.folded ||
                                isPermanentlyOut ||
                                player.disconnected) &&
                                "opacity-50",
                              isPermanentlyOut && "grayscale"
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
