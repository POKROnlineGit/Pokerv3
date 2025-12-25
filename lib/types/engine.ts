/**
 * Type definitions for TexasHoldemEngine
 * These types match the actual JavaScript implementation
 */

export interface GameResult {
  success: boolean;
  state: any; // GameContext - using any since it's a complex object
  events: any[]; // Array<GameEvent>
  effects: any[]; // Array<Effect>
}

export interface TransitionOverrides {
  holeCards?: Record<number, EngineCard[]>;
  communityCards?: EngineCard[];
}

export interface EngineCard {
  suit: "hearts" | "diamonds" | "clubs" | "spades";
  rank:
    | "2"
    | "3"
    | "4"
    | "5"
    | "6"
    | "7"
    | "8"
    | "9"
    | "T"
    | "J"
    | "Q"
    | "K"
    | "A";
  value: number;
  display: string;
}

export interface EngineContext {
  gameId: string;
  status: string;
  currentPhase: string;
  players: EnginePlayer[];
  communityCards: EngineCard[];
  pots?: Array<{
    amount: number;
    eligiblePlayers?: string[];
  }>;
  currentActorSeat: number | null;
  buttonSeat: number;
  sbSeat: number;
  bbSeat: number;
  actionDeadline?: Date | string | null;
  minRaise?: number;
  bigBlind?: number;
  smallBlind?: number;
  handNumber?: number;
  config?: any;
  [key: string]: any;
}

export interface EnginePlayer {
  id: string;
  name: string;
  seat: number;
  chips: number;
  currentBet: number;
  totalBet: number;
  holeCards: EngineCard[] | string[];
  folded: boolean;
  allIn: boolean;
  isBot: boolean;
  isOffline: boolean;
  status: string;
  leaving?: boolean;
  left?: boolean;
  revealedIndices?: number[];
  [key: string]: any;
}
