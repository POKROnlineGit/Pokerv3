/**
 * Adapters for multiplayer game compatibility
 * Converts between legacy database format and new GameEngine format
 */

import { GameContext, Player, Action, Card } from "./types";
import { GameEngine } from "./GameEngine";
import { createInitialContext } from "./GameContext";

// Legacy GameState format (as stored in database)
export interface LegacyGameState {
  gameId: string;
  status: "active" | "complete";
  players: Array<{
    userId: string;
    seat: number;
    chips: number;
    folded: boolean;
    allIn: boolean;
    currentBet: number;
    totalBetThisHand: number;
    isDealer: boolean;
    isSmallBlind: boolean;
    isBigBlind: boolean;
    cards?: string[];
  }>;
  communityCards: string[];
  pot: number;
  currentBet: number;
  dealerButton: number;
  currentPlayerIndex: number;
  street: "preflop" | "flop" | "turn" | "river" | "showdown";
  smallBlind: number;
  bigBlind: number;
  handNumber: number;
}

/**
 * Convert legacy GameState to new GameContext
 */
export function legacyToGameContext(legacy: LegacyGameState): GameContext {
  const players: Player[] = legacy.players.map((p) => ({
    id: p.userId,
    seat: p.seat,
    name: `Player ${p.seat}`,
    chips: p.chips,
    currentBet: p.currentBet,
    totalBet: p.totalBetThisHand,
    holeCards: (p.cards || []) as Card[],
    folded: p.folded,
    allIn: p.allIn,
    eligibleToBet: !p.folded && !p.allIn && p.chips > 0, // Default eligibility
    isBot: false,
  }));

  const phaseMap: Record<
    LegacyGameState["street"],
    GameContext["currentPhase"]
  > = {
    preflop: "preflop",
    flop: "flop",
    turn: "turn",
    river: "river",
    showdown: "showdown",
  };

  return {
    gameId: legacy.gameId,
    maxPlayers: 6,
    players,
    buttonSeat: legacy.dealerButton,
    smallBlind: legacy.smallBlind,
    bigBlind: legacy.bigBlind,
    deck: [], // Not stored in legacy
    communityCards: (legacy.communityCards || []) as Card[],
    pots: [
      {
        amount: legacy.pot,
        eligiblePlayers: players
          .filter((p) => !p.folded && p.chips > 0)
          .map((p) => p.id),
      },
    ],
    currentPhase: phaseMap[legacy.street],
    currentActorSeat: legacy.players[legacy.currentPlayerIndex]?.seat || null,
    firstActorSeat: legacy.players[legacy.currentPlayerIndex]?.seat || null, // Approximate - not stored in legacy
    minRaise: legacy.bigBlind * 2,
    lastAggressorSeat: null, // Not stored in legacy
    handHistory: [],
    handNumber: legacy.handNumber,
  };
}

/**
 * Convert GameContext to legacy GameState for database storage
 */
export function gameContextToLegacy(ctx: GameContext): LegacyGameState {
  const sbSeat = (ctx.buttonSeat % 6) + 1;
  const bbSeat = (sbSeat % 6) + 1;

  const streetMap: Record<
    GameContext["currentPhase"],
    LegacyGameState["street"]
  > = {
    waiting: "preflop",
    preflop: "preflop",
    flop: "flop",
    turn: "turn",
    river: "river",
    showdown: "showdown",
    complete: "showdown",
  };

  return {
    gameId: ctx.gameId,
    status: ctx.currentPhase === "complete" ? "complete" : "active",
    players: ctx.players.map((p) => ({
      userId: p.id,
      seat: p.seat,
      chips: p.chips,
      folded: p.folded,
      allIn: p.allIn,
      currentBet: p.currentBet,
      totalBetThisHand: p.totalBet,
      isDealer: p.seat === ctx.buttonSeat,
      isSmallBlind: p.seat === sbSeat,
      isBigBlind: p.seat === bbSeat,
      cards: p.holeCards,
    })),
    communityCards: ctx.communityCards,
    pot: ctx.pots[0]?.amount || 0,
    currentBet: Math.max(...ctx.players.map((p) => p.currentBet), 0),
    dealerButton: ctx.buttonSeat,
    currentPlayerIndex: ctx.players.findIndex(
      (p) => p.seat === ctx.currentActorSeat
    ),
    street: streetMap[ctx.currentPhase],
    smallBlind: ctx.smallBlind,
    bigBlind: ctx.bigBlind,
    handNumber: ctx.handNumber,
  };
}

/**
 * Create a GameEngine from legacy game state
 */
export function createEngineFromLegacy(legacy: LegacyGameState): GameEngine {
  const ctx = legacyToGameContext(legacy);
  return new GameEngine(ctx);
}
