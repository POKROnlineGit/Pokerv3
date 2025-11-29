export type Card = `${Rank}${Suit}`;
export type Rank =
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
export type Suit = "h" | "d" | "c" | "s";

export type GamePhase =
  | "waiting"
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "complete";

export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "allin";

export interface Action {
  type: ActionType;
  seat: number;
  amount?: number;
}

export interface Player {
  id: string;
  seat: number; // 1-9
  name: string;
  chips: number;
  holeCards: Card[];
  currentBet: number; // Bet this betting round
  totalBet: number; // Total bet this hand
  folded: boolean;
  allIn: boolean;
  eligibleToBet: boolean; // Whether player is eligible to bet in current round
  isBot?: boolean;
}

export interface Pot {
  amount: number;
  eligiblePlayers: string[]; // player.id
}

export interface GameContext {
  readonly gameId: string;
  readonly maxPlayers: number; // 6 for now, flexible later
  players: Player[];
  buttonSeat: number;
  smallBlind: number;
  bigBlind: number;
  deck: Card[];
  communityCards: Card[];
  pots: Pot[];
  currentPhase: GamePhase;
  currentActorSeat: number | null;
  firstActorSeat: number | null; // First actor in current betting round (for checking completion)
  minRaise: number;
  lastAggressorSeat: number | null;
  handHistory: string[]; // for debugging
  handNumber: number;
}

export interface ActionValidation {
  valid: boolean;
  error?: string;
  minAmount?: number;
  maxAmount?: number;
}
