"use client";

import { GameState, Player } from "@/lib/poker-game/ui/legacyTypes";
import { Card as CardType } from "@/lib/poker-game/engine/core/types";
import { Card } from "@/components/Card";
import { cn } from "@/lib/utils";
import { getNextActivePlayer } from "@/lib/poker-game/engine/utils/seatUtils";
import { useDebugMode } from "@/lib/hooks/useDebugMode";
import { motion } from "framer-motion";

interface PokerTableProps {
  gameState: GameState;
  currentUserId: string;
  onAction?: () => void;
  playerNames?: Record<string, string>;
  isLocalGame?: boolean;
  isHeadsUp?: boolean;
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
}: PokerTableProps) {
  const { isEnabled: debugMode } = useDebugMode();

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
      gameState.currentActorSeat > 0 &&
      gameState.currentActorSeat === player.seat
    );
  };

  const isCurrentActor = (player: Player) => {
    return (
      gameState.currentActorSeat > 0 &&
      gameState.currentActorSeat === player.seat
    );
  };

  const isShowdown = gameState.currentRound === "showdown";

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
          <div>Actor: Seat {gameState.currentActorSeat}</div>
          <div>
            Next: Seat{" "}
            {(() => {
              const nextPlayer = getNextActivePlayer(
                gameState.currentActorSeat,
                gameState.players.map((p) => ({
                  id: p.id,
                  seat: p.seat,
                  name: p.name,
                  chips: p.chips,
                  currentBet: p.betThisRound,
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
        {/* Community cards area - centered, larger for heads-up */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex gap-2 z-10">
          {gameState.communityCards.map((card, i) => (
            <Card
              key={i}
              card={card as CardType}
              size={isHeadsUp ? "md" : "sm"}
            />
          ))}
        </div>

        {/* Street indicator */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 translate-y-[140%] bg-black/80 text-white px-4 py-2 rounded-lg z-10">
          <div className="text-sm font-semibold uppercase">
            {gameState.currentRound}
          </div>
        </div>

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
        const isSmallBlind = player?.seat === gameState.sbSeat;
        const isBigBlind = player?.seat === gameState.bbSeat;

        return (
          <div key={seat} className="absolute z-20" style={position}>
            {isEmpty ? (
              <div className="bg-[#1a1a1a] text-white px-4 py-2 rounded-xl border-[3px] border-dashed border-gray-500 shadow-lg">
                Empty
              </div>
            ) : (
              <>
                {/* Player box */}
                <div
                  className={cn(
                    "bg-[#1a1a1a] border-[3px] rounded-xl p-3 min-w-[140px] transition-all relative shadow-lg text-center",
                    // White border by default
                    "border-white",
                    // Green glowing border when current player can act
                    isCurrent &&
                      isActor &&
                      "border-[#4ade80] shadow-[0_0_20px_rgba(74,222,128,0.6)]",
                    // Red glowing border when it's another player's turn
                    isActor &&
                      !isCurrent &&
                      "border-[#ff4d4f] shadow-[0_0_20px_rgba(255,77,79,0.6)]",
                    isFolded && "opacity-50"
                  )}
                >
                  {/* Name */}
                  <div className="text-sm font-semibold text-white truncate mb-1">
                    {player.id === currentUserId
                      ? player.name || "You"
                      : playerNames?.[player.id] ||
                        player.name ||
                        `Player ${seat}`}
                  </div>

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
                  {player.betThisRound > 0 && (
                    <div className="text-xs text-yellow-400 font-bold mt-1 bg-yellow-400/20 px-2 py-1 rounded">
                      Bet: ${player.betThisRound}
                    </div>
                  )}

                  {/* Dealer button - small white circle with "D" */}
                  {isDealer && (
                    <div className="absolute -top-3 -left-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg z-30">
                      <span className="text-black text-xs font-bold">D</span>
                    </div>
                  )}

                  {/* Small blind indicator */}
                  {isSmallBlind && !isDealer && (
                    <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-bold text-[10px]">
                      SB
                    </div>
                  )}

                  {/* Big blind indicator */}
                  {isBigBlind && !isDealer && (
                    <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold text-[10px]">
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
                      const showFaceDown = isShowdown
                        ? false
                        : isLocalGame
                        ? player.isBot
                        : player.id !== currentUserId;
                      return (
                        <Card
                          key={i}
                          card={card as CardType}
                          size={isHeadsUp ? "md" : "sm"}
                          faceDown={showFaceDown}
                        />
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
