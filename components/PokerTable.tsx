"use client";

import { useEffect, useState, useRef } from "react";
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
  playerNames,
  isLocalGame = false,
  isHeadsUp = false,
  runoutCards = [],
  isRunningOut = false,
  playerDisconnectTimers = {},
  turnTimer = null,
}: PokerTableProps) {
  const { isEnabled: debugMode } = useDebugMode();

  // Turn timer state
  const [remainingTime, setRemainingTime] = useState<number | null>(null);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  // Update timer progress
  useEffect(() => {
    if (!turnTimer) {
      setRemainingTime(null);
      setProgressPercent(0);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, turnTimer.deadline - now);
      const percent = Math.max(
        0,
        Math.min(100, (remaining / turnTimer.duration) * 100)
      );

      setRemainingTime(remaining);
      setProgressPercent(percent);

      if (remaining > 0) {
        animationFrameRef.current = requestAnimationFrame(updateTimer);
      } else {
        setRemainingTime(0);
        setProgressPercent(0);
        animationFrameRef.current = null;
      }
    };

    updateTimer();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [turnTimer]);

  // Dynamic seat count based on game type
  const NUM_SEATS = isHeadsUp ? 2 : 6;
  // Use same radius for both heads-up and 6-max for consistency
  const radiusX = 48;
  const radiusY = 42;

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
  const activePlayers = gameState.players.filter(
    (p) => !p.folded && p.chips > 0
  );
  const activePlayerCount = activePlayers.length;
  const isWaitingForOpponent = isWaitingPhase && activePlayerCount < 2;

  // Determine if this is a Heads-Up game (exactly 2 active players)
  const isHeadsUpGame = activePlayerCount === 2;

  return (
    <div className="relative w-full max-w-4xl mx-auto aspect-[5/3]">
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
          border: "12px solid #8b4513",
        }}
      >
        {/* Community cards area - centered, larger for heads-up - Higher z-index to appear above player status indicators */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex gap-2 z-30">
          {gameState.communityCards.map((card, i) => {
            // Only animate if this card is in the runout cards array
            const isRunoutCard = runoutCards.includes(card);
            const runoutIndex = runoutCards.indexOf(card);

            return (
              <motion.div
                key={`${card}-${i}`}
                initial={
                  isRunoutCard && isRunningOut
                    ? { y: -80, rotate: -180, opacity: 0 }
                    : false
                }
                animate={
                  isRunoutCard && isRunningOut
                    ? { y: 0, rotate: 0, opacity: 1 }
                    : {}
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
                <Card card={card as CardType} size={isHeadsUp ? "md" : "sm"} />
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

        {/* Street indicator */}
        {!isWaitingForOpponent && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 translate-y-[140%] bg-black/80 text-white px-4 py-2 rounded-lg z-10">
            <div className="text-sm font-semibold uppercase">
              {gameState.currentRound}
            </div>
          </div>
        )}

        {/* Pot display - white text, smaller, black background, beneath round indicator */}
        {(() => {
          const mainPot = gameState.pot || 0;
          const sidePotTotal =
            gameState.sidePots?.reduce(
              (sum, pot) => sum + (pot?.amount || 0),
              0
            ) || 0;
          const totalPot = mainPot + sidePotTotal;
          return totalPot > 0 ? (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 translate-y-[180%] bg-black/90 text-white px-4 py-2 rounded-lg z-10">
              <div className="text-sm text-gray-300 mb-1">Pot</div>
              <div className="text-xl font-bold">${totalPot}</div>
            </div>
          ) : null;
        })()}
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
              <div className="bg-[#1a1a1a] text-white px-4 py-2 rounded-xl border-[3px] border-dashed border-gray-500 shadow-lg">
                Empty
              </div>
            ) : (
              <>
                {/* Show "Sitting Out" if player has left (from server state) */}
                {hasLeft && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-600 text-white px-3 py-1 rounded-full text-xs font-bold z-40">
                    SITTING OUT
                  </div>
                )}

                {/* Show "Leaving After Hand" if player is leaving but hasn't left yet */}
                {player.leaving && !hasLeft && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-orange-600 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse z-40">
                    LEAVING AFTER HAND
                  </div>
                )}

                {/* Player box */}
                <div
                  className={cn(
                    "bg-[#1a1a1a] border-[3px] rounded-xl p-3 min-w-[140px] transition-all relative shadow-lg text-center",
                    // White border by default
                    "border-white",
                    // Green glowing border when current player can act
                    isCurrent &&
                      isActor &&
                      !hasLeft &&
                      !isDisconnected &&
                      "border-[#4ade80] shadow-[0_0_20px_rgba(74,222,128,0.6)]",
                    // Red glowing border when it's another player's turn
                    isActor &&
                      !isCurrent &&
                      !hasLeft &&
                      !isDisconnected &&
                      "border-[#ff4d4f] shadow-[0_0_20px_rgba(255,77,79,0.6)]",
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
                  }}
                >
                  {/* Name */}
                  <div
                    className={cn(
                      "text-sm font-semibold truncate mb-1",
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
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full z-25 flex items-center gap-1">
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
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gray-700 text-white text-[10px] px-2 py-0.5 rounded-full z-25">
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
                          "text-xs font-medium block mb-1",
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
                  <div className="text-xs text-white font-medium mb-1">
                    ${player.chips}
                  </div>

                  {/* Bet - show bet amount prominently */}
                  {player.currentBet > 0 && (
                    <div className="text-xs text-yellow-400 font-bold mt-1 bg-yellow-400/20 px-2 py-1 rounded">
                      Bet: ${player.currentBet}
                    </div>
                  )}

                  {/* Turn Timer - Progress Bar at bottom of player box */}
                  {turnTimer?.activeSeat === player.seat &&
                    remainingTime !== null &&
                    remainingTime > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700/50 overflow-hidden rounded-b-xl z-5">
                        <div
                          className={cn(
                            "h-full transition-all duration-100 ease-linear",
                            progressPercent > 50
                              ? "bg-green-500"
                              : progressPercent > 25
                              ? "bg-yellow-500"
                              : "bg-red-500"
                          )}
                          style={{ width: `${progressPercent}%` }}
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
                    <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-bold text-[10px] z-50">
                      SB
                    </div>
                  )}

                  {/* Big blind indicator - High z-index to appear above border and timer bar */}
                  {/* Show BB badge if player is BB and not dealer */}
                  {isBigBlind && !isDealer && (
                    <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold text-[10px] z-50">
                      BB
                    </div>
                  )}
                </div>

                {/* Hole cards - always positioned beneath the player, larger for heads-up */}
                {player.holeCards && player.holeCards.length > 0 && (
                  <div className="absolute left-1/2 transform -translate-x-1/2 flex gap-1 z-10 top-full mt-2">
                    {player.holeCards.map((card, i) => {
                      // During showdown, show all players' hands
                      // Otherwise, show card back for bots in local games, or for other players in multiplayer
                      // If disconnected and folded, show fold animation
                      const showFaceDown = isShowdown
                        ? false
                        : isLocalGame
                        ? player.isBot
                        : player.id !== currentUserId;

                      // If disconnected and action was FOLD, animate fold
                      const shouldAnimateFold =
                        isDisconnected && player.folded && !isShowdown;

                      return (
                        <motion.div
                          key={`${card}-${i}`}
                          animate={
                            shouldAnimateFold
                              ? {
                                  rotate: -90,
                                  y: 20,
                                  opacity: 0.3,
                                }
                              : {}
                          }
                          transition={{
                            type: "spring",
                            stiffness: 300,
                            damping: 25,
                            delay: i * 0.1,
                          }}
                        >
                          <Card
                            card={card as CardType}
                            size={isHeadsUp ? "md" : "sm"}
                            faceDown={showFaceDown}
                          />
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
