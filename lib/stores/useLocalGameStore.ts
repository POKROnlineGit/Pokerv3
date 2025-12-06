'use client';

import { create } from 'zustand';
import { GameEngine, createInitialContext, isBettingRoundComplete } from '@/lib/poker-game';
import { GameContext, Player, Action, ActionType } from '@/lib/poker-game/engine/core/types';
import { makeBotDecision } from '@/lib/poker-game/engine/bots/botLogic';

const INITIAL_CHIPS = 200;
const HUMAN_PLAYER_ID = 'human-player';

interface BotPlayer {
  id: string;
  name: string;
  strategy: 'aggro' | 'tight' | 'calling' | 'random' | 'solid';
}

const BOTS: BotPlayer[] = [
  { id: 'bot-1', name: 'AggroBot', strategy: 'aggro' },
  { id: 'bot-2', name: 'TightBot', strategy: 'tight' },
  { id: 'bot-3', name: 'CallingStation', strategy: 'calling' },
  { id: 'bot-4', name: 'RandomBot', strategy: 'random' },
  { id: 'bot-5', name: 'SolidBot', strategy: 'solid' },
];

interface LocalGameState {
  gameId: string | null;
  gameContext: GameContext | null;
  gameEngine: GameEngine | null;
  isLocalGame: boolean;
  botActionTimeout: NodeJS.Timeout | null;
  showdownTimeout: NodeJS.Timeout | null;
  bettingRoundTimeout: NodeJS.Timeout | null;

  startLocalGame: () => void;
  playerAction: (action: ActionType, amount?: number) => void;
  processBotActions: () => void;
  leaveLocalGame: () => void;
  newGame: () => void;
}

export const useLocalGameStore = create<LocalGameState>((set, get) => {
  let gameEngine: GameEngine | null = null;

  // Expose store for debugging in development
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    (window as any).__POKER_STORE__ = { getState: get, gameEngine: () => gameEngine };
  }

  return {
    gameId: null,
    gameContext: null,
    gameEngine: null,
    isLocalGame: false,
    botActionTimeout: null,
    showdownTimeout: null,
    bettingRoundTimeout: null,

    startLocalGame: () => {
      // Check if game already exists
      if (get().gameContext) {
        return;
      }

      const gameId = `local-${crypto.randomUUID()}`;

      // Create players: 1 human + 5 bots
      const players: Player[] = [
        {
          id: HUMAN_PLAYER_ID,
          name: 'You',
          seat: 1,
          chips: INITIAL_CHIPS,
          currentBet: 0,
          totalBet: 0,
          holeCards: [],
          folded: false,
          allIn: false,
          eligibleToBet: true,
          isBot: false,
        },
        ...BOTS.map((bot, index) => ({
          id: bot.id,
          name: bot.name,
          seat: index + 2,
          chips: INITIAL_CHIPS,
          currentBet: 0,
          totalBet: 0,
          holeCards: [],
          folded: false,
          allIn: false,
          eligibleToBet: true,
          isBot: true,
        })),
      ];

      // Create initial context
      const initialContext = createInitialContext(gameId, players, 1, 2);

      // Create game engine
      gameEngine = new GameEngine(initialContext);

      // Subscribe to state changes
      gameEngine.onStateChange((ctx) => {
        set({ gameContext: ctx });
        // Process bot actions after state change
        setTimeout(() => {
          get().processBotActions();
        }, 100);
      });

      const currentContext = gameEngine.getState();

      set({
        gameId,
        gameContext: currentContext,
        gameEngine,
        isLocalGame: true,
      });

      // Start bot action processing after a short delay
      setTimeout(() => {
        get().processBotActions();
      }, 500);
    },

    playerAction: (action: ActionType, amount?: number) => {
      const { gameContext, gameEngine: engine } = get();
      if (!gameContext || !engine) return;

      const humanPlayer = gameContext.players.find(p => p.id === HUMAN_PLAYER_ID);
      if (!humanPlayer) return;

      try {
        const actionObj: Action = {
          type: action,
          seat: humanPlayer.seat,
          amount,
        };

        engine.processAction(actionObj);
      } catch (error) {
        console.error('Player action error:', error);
      }
    },

    processBotActions: () => {
      const { gameContext, gameEngine: engine, botActionTimeout, showdownTimeout, bettingRoundTimeout } = get();
      if (!gameContext || !engine) return;

      // Clear any existing timeouts
      if (botActionTimeout) {
        clearTimeout(botActionTimeout);
      }
      if (showdownTimeout) {
        clearTimeout(showdownTimeout);
      }
      if (bettingRoundTimeout) {
        clearTimeout(bettingRoundTimeout);
      }

      // Check if we're in showdown or complete
      if (gameContext.currentPhase === 'showdown') {
        // Wait 5 seconds then start new hand (allows time to see revealed hands)
        const timeout = setTimeout(() => {
          const { gameEngine: currentEngine } = get();
          if (currentEngine) {
            currentEngine.forceTransition(); // Transition to HandComplete, then PreflopBetting
          }
        }, 5000);

        set({ showdownTimeout: timeout });
        return;
      }

      if (gameContext.currentPhase === 'complete') {
        // Transition to new hand
        const { gameEngine: currentEngine } = get();
        if (currentEngine) {
          currentEngine.forceTransition();
        }
        setTimeout(() => {
          get().processBotActions();
        }, 500);
        return;
      }

      // Check if betting round is complete (preflop, flop, turn, river)
      const isBettingPhase = ['preflop', 'flop', 'turn', 'river'].includes(gameContext.currentPhase);
      if (isBettingPhase && isBettingRoundComplete(gameContext)) {
        // Wait 3 seconds before transitioning to next dealing round
        const timeout = setTimeout(() => {
          const { gameEngine: currentEngine } = get();
          if (currentEngine) {
            currentEngine.forceTransition(); // Transition to next dealing round
          }
          // Continue processing after transition
          setTimeout(() => {
            get().processBotActions();
          }, 100);
        }, 3000);

        set({ bettingRoundTimeout: timeout });
        return;
      }

      // Check if it's a bot's turn
      if (gameContext.currentActorSeat === null) {
        return;
      }

      const currentPlayer = gameContext.players.find(p => p.seat === gameContext.currentActorSeat);
      if (!currentPlayer) {
        return;
      }

      // If it's the human's turn, wait for their action
      if (currentPlayer.id === HUMAN_PLAYER_ID) {
        return;
      }

      // Bot's turn - make decision after delay
      const delay = 800 + Math.random() * 1700; // 800-2500ms
      const timeout = setTimeout(() => {
        const { gameContext: currentCtx, gameEngine: currentEngine } = get();
        if (!currentCtx || !currentEngine) return;

        const bot = currentCtx.players.find(p => p.seat === currentCtx.currentActorSeat);
        if (!bot || bot.id === HUMAN_PLAYER_ID || !bot.isBot) return;

        const botInfo = BOTS.find(b => b.id === bot.id);
        if (!botInfo) return;

        const decision = makeBotDecision(currentCtx, bot.id, botInfo.strategy);

        try {
          const actionObj: Action = {
            type: decision.action,
            seat: bot.seat,
            amount: decision.amount,
          };

          currentEngine.processAction(actionObj);
        } catch (error) {
          console.error('Bot action error:', error);
          // If bot action fails, fold as fallback
          try {
            const actionObj: Action = {
              type: 'fold',
              seat: bot.seat,
            };
            currentEngine.processAction(actionObj);
          } catch (e) {
            console.error('Fallback fold error:', e);
          }
        }
      }, delay);

      set({ botActionTimeout: timeout });
    },

    leaveLocalGame: () => {
      const { botActionTimeout, showdownTimeout, bettingRoundTimeout } = get();
      if (botActionTimeout) {
        clearTimeout(botActionTimeout);
      }
      if (showdownTimeout) {
        clearTimeout(showdownTimeout);
      }
      if (bettingRoundTimeout) {
        clearTimeout(bettingRoundTimeout);
      }
      gameEngine = null;
      set({
        gameId: null,
        gameContext: null,
        gameEngine: null,
        isLocalGame: false,
        botActionTimeout: null,
        showdownTimeout: null,
        bettingRoundTimeout: null,
      });
    },

    newGame: () => {
      get().leaveLocalGame();
      setTimeout(() => {
        get().startLocalGame();
      }, 100);
    },
  };
});
