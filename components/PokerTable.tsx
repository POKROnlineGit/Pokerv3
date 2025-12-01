'use client'

import { GameState, Player } from '@/lib/poker-game/legacyTypes'
import { Card as CardType } from '@/lib/poker-game/types'
import { Card } from '@/components/Card'
import { cn } from '@/lib/utils'
import { getNextActivePlayer } from '@/lib/poker-game/seatUtils'
import { useDebugMode } from '@/lib/hooks/useDebugMode'

interface PokerTableProps {
  gameState: GameState
  currentUserId: string
  onAction?: () => void
  playerNames?: Record<string, string>
  isLocalGame?: boolean
}

// Seat positions in CLOCKWISE order (1→2→3→4→5→6→1)
// Evenly distributed around a circular table - 60 degrees apart
// Using approximate positions for a circular layout
const SEAT_POSITIONS = [
  { top: '5%', left: '50%', transform: 'translateX(-50%)' },        // Seat 1 (top - 0°)
  { top: '18%', right: '5%', transform: 'translateX(50%)' },      // Seat 2 (top-right - 60°)
  { top: '50%', right: '2%', transform: 'translateX(50%)' },        // Seat 3 (right - 120°)
  { top: '82%', right: '5%', transform: 'translateX(50%)' },        // Seat 4 (bottom-right - 180°)
  { top: '95%', left: '50%', transform: 'translateX(-50%)' },      // Seat 5 (bottom - 240°)
  { top: '18%', left: '5%', transform: 'translateX(-50%)' },       // Seat 6 (bottom-left - 300°)
]

export function PokerTable({ gameState, currentUserId, onAction, playerNames, isLocalGame = false }: PokerTableProps) {
  const { isEnabled: debugMode } = useDebugMode()

  const getPlayerAtSeat = (seat: number): Player | undefined => {
    return gameState.players.find(p => p.seat === seat)
  }

  const isCurrentPlayer = (player: Player) => {
    return player.id === currentUserId && 
           gameState.currentActorSeat > 0 &&
           gameState.currentActorSeat === player.seat
  }

  const isCurrentActor = (player: Player) => {
    return gameState.currentActorSeat > 0 &&
           gameState.currentActorSeat === player.seat
  }

  const isShowdown = gameState.currentRound === 'showdown'

  return (
    <div className="relative w-full max-w-4xl mx-auto aspect-[4/3]">
      {/* Debug overlay (super user + debug mode only) */}
      {debugMode && (
        <div className="absolute top-4 left-4 bg-black/90 text-white p-4 rounded-lg text-xs font-mono z-50 border-2 border-yellow-500">
          <div className="font-bold mb-2 text-yellow-400">DEBUG INFO</div>
          <div>Button: Seat {gameState.buttonSeat}</div>
          <div>SB: Seat {gameState.sbSeat} | BB: Seat {gameState.bbSeat}</div>
          <div>Actor: Seat {gameState.currentActorSeat}</div>
            <div>Next: Seat {(() => {
              const nextPlayer = getNextActivePlayer(gameState.currentActorSeat, gameState.players.map(p => ({
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
              })));
              return nextPlayer || 'N/A';
            })()}</div>
          <div>Round: {gameState.currentRound}</div>
          <div className="mt-2 pt-2 border-t border-yellow-500/50">
            <div className="text-yellow-400">Players (clockwise):</div>
            {[1, 2, 3, 4, 5, 6].map(seat => {
              const p = gameState.players.find(p => p.seat === seat)
              const isActive = p && !p.folded && !p.allIn && p.chips > 0
              return (
                <div key={seat} className={isActive ? 'text-green-400' : 'text-gray-400'}>
                  Seat {seat}: {p?.name || 'Empty'} {p?.folded ? '(F)' : ''} {p?.allIn ? '(AI)' : ''} {p?.chips || 0} chips
                </div>
              )
            })}
          </div>
          <div className="mt-2 text-yellow-400">→ Clockwise direction</div>
        </div>
      )}

      {/* Table */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-green-800 to-green-900 border-8 border-amber-800 shadow-2xl">
        {/* Felt texture overlay */}
        <div className="absolute inset-0 rounded-full bg-green-700/20" />
        
        {/* Community cards area */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex gap-2">
          {gameState.communityCards.map((card, i) => (
            <Card key={i} card={card as CardType} size="md" />
          ))}
        </div>

        {/* Pot display */}
        {gameState.pot > 0 && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-[120%] bg-black/80 text-white px-4 py-2 rounded-lg">
            <div className="text-sm text-muted-foreground">Pot</div>
            <div className="text-2xl font-bold">{gameState.pot}</div>
          </div>
        )}

        {/* Street indicator */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 translate-y-[120%] bg-black/80 text-white px-4 py-2 rounded-lg">
          <div className="text-sm font-semibold uppercase">{gameState.currentRound}</div>
        </div>
      </div>

      {/* Player seats */}
      {SEAT_POSITIONS.map((position, index) => {
        const seat = index + 1
        const player = getPlayerAtSeat(seat)
        const isEmpty = !player
        const isCurrent = player && isCurrentPlayer(player)
        const isActor = player && isCurrentActor(player)
        const isFolded = player?.folded
        const isDealer = player?.seat === gameState.buttonSeat
        const isSmallBlind = player?.seat === gameState.sbSeat
        const isBigBlind = player?.seat === gameState.bbSeat

        return (
          <div
            key={seat}
            className="absolute"
            style={position}
          >
            {isEmpty ? (
              <div className="bg-gray-800/50 text-white px-4 py-2 rounded-lg border-2 border-dashed border-gray-600">
                Empty
              </div>
            ) : (
              <div
                className={cn(
                  "bg-card border-2 rounded-lg p-3 min-w-[120px] transition-all relative",
                  isCurrent && "ring-4 ring-primary ring-offset-2",
                  isActor && !isCurrent && "ring-4 ring-yellow-500 ring-offset-2 animate-pulse",
                  isFolded && "opacity-50"
                )}
              >
                {/* Current actor indicator */}
                {isActor && (
                  <div className="absolute -top-1 -left-1 -right-1 -bottom-1 bg-yellow-500/30 rounded-lg -z-10 animate-pulse" />
                )}
                <div className="text-sm font-semibold truncate">
                  {player.id === currentUserId 
                    ? (player.name || 'You')
                    : (playerNames?.[player.id] || player.name || `Player ${seat}`)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {player.chips} chips
                </div>
                {player.betThisRound > 0 && (
                  <div className="text-xs text-primary font-bold mt-1">
                    Bet: {player.betThisRound}
                  </div>
                )}
                {isDealer && (
                  <div className="absolute -top-2 -left-2 bg-yellow-500 text-black text-xs px-2 py-1 rounded-full font-bold">
                    D
                  </div>
                )}
                {isSmallBlind && (
                  <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                    SB
                  </div>
                )}
                {isBigBlind && (
                  <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                    BB
                  </div>
                )}
                
                {/* Hole cards */}
                {player.holeCards && player.holeCards.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {player.holeCards.map((card, i) => {
                      // During showdown, show all players' hands
                      // Otherwise, show card back for bots in local games, or for other players in multiplayer
                      const showFaceDown = isShowdown
                        ? false
                        : isLocalGame 
                          ? player.isBot 
                          : player.id !== currentUserId
                      return (
                        <Card
                          key={i}
                          card={card as CardType}
                          size="sm"
                          faceDown={showFaceDown}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

