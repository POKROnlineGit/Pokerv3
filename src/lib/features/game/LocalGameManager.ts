import { TexasHoldemEngine } from '@backend/domain/game/engine/TexasHoldemEngine';
import { EffectType } from '@backend/shared/types/engine.js';
import { makeDecision } from '@backend/domain/game/bots/botStrategies.js';
import type { GameState } from '@/lib/types/poker';

// =============================================================================
// LOCAL TYPE DEFINITIONS FOR BACKEND ENGINE INTERFACE
// These match the JavaScript engine output and are used for local bot games only
// =============================================================================

interface LocalGameConfig {
  maxPlayers: number;
  blinds: {
    small: number;
    big: number;
  };
  buyIn: number;
  startingStack?: number;
  variantSlug?: string;
}

/** Local player type matching backend engine output */
interface LocalPlayer {
  id: string;
  username: string;
  seat: number;
  chips: number;
  currentBet: number;
  totalBet: number;
  holeCards: string[];
  folded: boolean;
  allIn: boolean;
  isBot: boolean;
  isOffline: boolean;
  isGhost: boolean;
  status: string;
  eligibleToBet: boolean;
  hasActed: boolean;
  leaving: boolean;
  left: boolean;
  revealedIndices: number[];
  lastAction: string | null;
}

/** Local context type matching backend engine output */
interface LocalEngineContext {
  gameId: string;
  type: string;
  status: string;
  currentPhase: string;
  players: LocalPlayer[];
  communityCards: string[];
  pots: Array<{ amount: number; eligiblePlayers?: string[]; contributors?: string[] }>;
  currentActorSeat: number | null;
  firstActorSeat: number | null;
  buttonSeat: number;
  sbSeat: number;
  bbSeat: number;
  smallBlind: number;
  bigBlind: number;
  minRaise: number;
  lastRaiseAmount: number | null;
  handNumber: number;
  actionDeadline: string | null;
  config: LocalGameConfig;
  showdownResults: unknown;
  isPrivate: boolean;
  hostId: string | null;
  isPaused: boolean;
  tournamentId: string | null;
  // Additional computed fields
  dealerSeat?: number;
  highBet?: number;
  left_players?: string[];
}

/** Effect type from backend engine */
interface LocalEffect {
  type: string;
  targetPhase?: string;
  delayMs?: number;
  reason?: string;
  [key: string]: unknown;
}

/** Result type from backend engine */
interface LocalGameResult {
  success: boolean;
  state: LocalEngineContext;
  events: unknown[];
  effects: LocalEffect[];
}

// Extended UI state that includes all game fields
type UIGameState = GameState & {
  dealerSeat?: number;
  totalPot?: number;
  highBet?: number;
};

export class LocalGameManager {
  public engine: TexasHoldemEngine;
  private updateUI: (state: UIGameState) => void;
  private timers: NodeJS.Timeout[] = [];
  private botTimeout: NodeJS.Timeout | null = null;
  private startGameTimeout: NodeJS.Timeout | null = null;
  private currentHeroId: string;
  private isDestroyed: boolean = false;

  constructor(config: LocalGameConfig, heroId: string, onStateUpdate: (state: UIGameState) => void) {
    this.updateUI = onStateUpdate;
    this.currentHeroId = heroId;

    this.engine = new TexasHoldemEngine('local-game-1', config);
    this.setupPlayers(heroId, config.startingStack || 200);

    // Send initial state (empty table) so UI can mount and render
    const initialUiState = this.engine.getPlayerContext(this.currentHeroId) as unknown as UIGameState;
    this.updateUI(initialUiState);

    // Delay Initial Deal: Give UI 500ms to mount and render empty table before cards appear
    // This ensures entry animations can trigger properly
    console.log('[LocalGame] Initializing game...');
    this.startGameTimeout = setTimeout(() => {
      if (this.isDestroyed) return; // Safety check
      this.startGame();
    }, 500);
  }

  private startGame() {
    if (this.isDestroyed) return;

    console.log('[LocalGame] Starting game...');
    const result = this.engine.executeTransition('preflop') as unknown as LocalGameResult;
    this.processResult(result);
  }

  private setupPlayers(heroId: string, startingStack: number) {
    const playersData = [
      { id: heroId, username: 'You', isBot: false, chips: startingStack, seat: 1 },
      { id: 'bot-1', username: 'AggroBot', isBot: true, chips: startingStack, seat: 2 },
      { id: 'bot-2', username: 'TightBot', isBot: true, chips: startingStack, seat: 3 },
      { id: 'bot-3', username: 'CallingStation', isBot: true, chips: startingStack, seat: 4 },
      { id: 'bot-4', username: 'RandomBot', isBot: true, chips: startingStack, seat: 5 },
      { id: 'bot-5', username: 'SolidBot', isBot: true, chips: startingStack, seat: 6 },
    ];

    const maxPlayers = (this.engine.config as LocalGameConfig).maxPlayers;
    const players = maxPlayers === 2 ? playersData.slice(0, 2) : playersData;
    this.engine.addPlayers(players);

    const ctx = this.engine.context as unknown as LocalEngineContext;
    if (ctx.players) {
        ctx.players.forEach((p: LocalPlayer) => {
            p.status = 'ACTIVE';
            p.folded = false;
            p.left = false;
            p.chips = startingStack;
            p.isOffline = false;
        });
    }

    if (!ctx.left_players) ctx.left_players = [];
  }

  public handleAction(actionType: string, amount?: number) {
    if (this.isDestroyed) return;

    const context = this.engine.context as unknown as LocalEngineContext;
    const player = context.players?.find((p: LocalPlayer) => p.id === this.currentHeroId);
    if (!player) return;

    const action = {
      type: actionType as 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin',
      seat: player.seat,
      amount: amount,
      gameId: this.engine.gameId
    };

    console.log('[LocalGame] Hero Action:', action);
    const result = this.engine.processAction(action as Parameters<typeof this.engine.processAction>[0]) as unknown as LocalGameResult;
    this.processResult(result);
  }

  private processResult(result: LocalGameResult) {
    if (this.isDestroyed) return;

    // Force Context Refresh: Explicitly overwrite context with result.state if it exists
    // This ensures we have the latest state from the engine
    if (result.state) {
      (this.engine as { context: unknown }).context = result.state;
    }

    // Use the engine's context directly for mapping (live object, not snapshot)
    const ctx = this.engine.context as unknown as LocalEngineContext;

    const uiState = this.engine.getPlayerContext(this.currentHeroId) as unknown as UIGameState & {
      players: Array<LocalPlayer & { bet?: number; wager?: number; betAmount?: number; isDealer?: boolean; isSb?: boolean; isBb?: boolean }>;
      pots?: Array<{ amount: number; value?: number; contributors?: string[]; eligiblePlayers?: string[] }>;
    };

    // SAFE PATCHING
    uiState.dealerSeat = ctx.dealerSeat || 0;
    uiState.sbSeat = ctx.sbSeat || 0;
    uiState.bbSeat = ctx.bbSeat || 0;

    // PLAYER DATA MAPPING
    if (uiState.players) {
        uiState.players.forEach((p) => {
            // FIX: Force Number conversion for seat matching
            const rawPlayer = ctx.players.find((raw: LocalPlayer) => Number(raw.seat) === Number(p.seat));

            if (rawPlayer) {
                // Use currentBet directly (matches engine schema)
                const betAmount = typeof rawPlayer.currentBet === 'number' ? rawPlayer.currentBet : 0;

                // Set currentBet (primary field matching engine)
                p.currentBet = betAmount;

                // Also set aliases for compatibility
                p.bet = betAmount;
                p.wager = betAmount;
                p.betAmount = betAmount;

                // Fix Chip Deduction: Use raw chips directly (engine already has correct stack remaining)
                // Remove any logic that subtracts bet from chips - engine handles this
                p.chips = rawPlayer.chips || 0;

                p.isOffline = false; // Force online
            } else {
                console.warn('[LocalGame] Could not map UI player to Raw player:', p.seat);
                // Set all bet fields to 0 for missing players
                p.currentBet = 0;
                p.bet = 0;
                p.wager = 0;
                p.betAmount = 0;
            }

            const pSeat = Number(p.seat);
            p.isDealer = (pSeat === Number(uiState.dealerSeat));
            p.isSb = (pSeat === Number(uiState.sbSeat));
            p.isBb = (pSeat === Number(uiState.bbSeat));
        });
    }

    // POT MAPPING FIX
    // Universal Pot Formatting: Handle both singular and array formats
    let totalPot = 0;

    if (Array.isArray(uiState.pots)) {
        uiState.pots = uiState.pots.map((pot) => {
            let amount = 0;
            let contributors: string[] = [];

            // Extract Amount safely - explicitly cast to prevent NaN
            if (typeof pot === 'number') {
                amount = Number(pot || 0);
            } else if (typeof pot === 'object' && pot !== null) {
                // Explicitly cast: pot.amount || pot || 0
                amount = Number(pot.amount || 0);
                contributors = pot.contributors || pot.eligiblePlayers || [];
            }

            // Ensure amount is never NaN
            if (isNaN(amount)) {
                amount = 0;
            }

            // Accumulate total pot
            totalPot += amount;

            // Fallback for empty contributors
            if (contributors.length === 0 && amount > 0) {
                contributors = ctx.players
                    .filter((p: LocalPlayer) => !p.folded && p.status === 'ACTIVE')
                    .map((p: LocalPlayer) => p.id);
            }

            // Return object with BOTH 'amount' and 'value' to handle property naming mismatches
            return { amount, value: amount, contributors };
        });
    } else {
        uiState.pots = [{ amount: 0, value: 0, contributors: [] }];
    }

    // Assign singular pot properties to root state object
    uiState.pot = totalPot;
    uiState.totalPot = totalPot;

    // Map Game Constraints: Ensure minRaise, highBet, and blinds are available to UI
    uiState.minRaise = ctx.minRaise || ctx.bigBlind || 0;
    // Calculate highBet from players if not directly available (engine uses _getCurrentBet())
    const calculatedHighBet = ctx.highBet ||
      (ctx.players?.length > 0 ? Math.max(...ctx.players.map((p: LocalPlayer) => p.currentBet || 0), 0) : 0);
    uiState.highBet = calculatedHighBet;
    uiState.bigBlind = ctx.bigBlind || ctx.config?.blinds?.big || 0;
    uiState.smallBlind = ctx.smallBlind || ctx.config?.blinds?.small || 0;

    // Map Phase: Ensure currentPhase and handNumber are available to UI
    // Engine uses currentPhase for rounds (preflop, flop, turn, river, showdown)
    uiState.currentPhase = ctx.currentPhase as GameState["currentPhase"];
    uiState.handNumber = ctx.handNumber || 1;

    this.updateUI(uiState as UIGameState);

    if (result.effects) {
      result.effects.forEach((effect: LocalEffect) => {
        if (this.isDestroyed) return;

        switch (effect.type) {
          case EffectType.SCHEDULE_TRANSITION:
            const timer = setTimeout(() => {
              if (this.isDestroyed) return;
              const nextRes = this.engine.executeTransition(effect.targetPhase as Parameters<typeof this.engine.executeTransition>[0]) as unknown as LocalGameResult;
              this.processResult(nextRes);
            }, effect.delayMs || 0);
            this.timers.push(timer);
            break;

          case EffectType.START_TIMER:
             this.checkBotTurn();
             break;

           case EffectType.GAME_END:
             console.log('[LocalGame] Game Ended:', effect.reason);
             break;
        }
      });
    }

    this.checkBotTurn();
  }

  private checkBotTurn() {
    if (this.isDestroyed) return;

    const ctx = this.engine.context as unknown as LocalEngineContext;
    if (ctx.status !== 'active' && ctx.status !== 'waiting') return;
    if (ctx.currentPhase === 'showdown') return;

    const actor = ctx.players?.find((p: LocalPlayer) => p.seat === ctx.currentActorSeat);
    if (actor && actor.isBot) {
        if (this.botTimeout) clearTimeout(this.botTimeout);

        this.botTimeout = setTimeout(() => {
            if (this.isDestroyed) return;
            this.executeBotMove(actor);
        }, 1000 + Math.random() * 1000);
    }
  }

  private executeBotMove(actor: LocalPlayer) {
     if (this.isDestroyed) return;

     const ctx = this.engine.context as unknown as LocalEngineContext;

     // Use backend bot strategies - assign different strategies to different bots
     const botStrategies = ['aggressive', 'balanced', 'tight', 'loose', 'calling'];
     const botIdStr = actor.id.replace('bot-', '');
     const botIndex = parseInt(botIdStr) - 1; // bot-1 -> index 0, bot-2 -> index 1, etc.
     const strategy = botStrategies[botIndex % botStrategies.length];

     const botProfile = { strategy };

     // Use the same decision-making logic as the backend
     const action = makeDecision(ctx, actor, botProfile);
     action.seat = actor.seat;
     action.gameId = this.engine.gameId;

     const result = this.engine.processAction(action) as unknown as LocalGameResult;
     this.processResult(result);
  }

  public cleanup() {
    this.isDestroyed = true;
    this.timers.forEach(clearTimeout);
    if (this.botTimeout) clearTimeout(this.botTimeout);
    if (this.startGameTimeout) {
      clearTimeout(this.startGameTimeout);
      this.startGameTimeout = null;
    }
    console.log('[LocalGame] Manager destroyed and timers cleared.');
  }
}
