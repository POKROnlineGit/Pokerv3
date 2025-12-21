import { TexasHoldemEngine } from '@backend/game/engine/TexasHoldemEngine';
import { EffectType } from '@backend/game/constants/types';

export class LocalGameManager {
  public engine: TexasHoldemEngine;
  private updateUI: (state: any) => void;
  private timers: NodeJS.Timeout[] = [];
  private botTimeout: NodeJS.Timeout | null = null;
  private currentHeroId: string;
  private isDestroyed: boolean = false;

  constructor(variant: string, heroId: string, onStateUpdate: (state: any) => void) {
    this.updateUI = onStateUpdate;
    this.currentHeroId = heroId;

    this.engine = new TexasHoldemEngine('local-game-1', variant);
    this.setupPlayers(heroId);

    console.log('[LocalGame] Starting game...');
    const result = this.engine.executeTransition('preflop');
    this.processResult(result);
  }

  private setupPlayers(heroId: string) {
    const playersData = [
      { id: heroId, name: 'You', isBot: false, chips: 1000, seat: 1 },
      { id: 'bot-1', name: 'Bot 1', isBot: true, chips: 1000, seat: 2 },
      { id: 'bot-2', name: 'Bot 2', isBot: true, chips: 1000, seat: 3 },
      { id: 'bot-3', name: 'Bot 3', isBot: true, chips: 1000, seat: 4 },
      { id: 'bot-4', name: 'Bot 4', isBot: true, chips: 1000, seat: 5 },
      { id: 'bot-5', name: 'Bot 5', isBot: true, chips: 1000, seat: 6 },
    ];
    
    const players = this.engine.config.maxPlayers === 2 ? playersData.slice(0, 2) : playersData;
    this.engine.addPlayers(players);

    // CRITICAL FIX: Match Backend Case Sensitivity ('ACTIVE')
    this.engine.context.players.forEach(p => {
        p.status = 'ACTIVE'; // Changed from 'active' to 'ACTIVE'
        p.folded = false;
        p.left = false;
        p.chips = 1000;
        
        // Ensure everyone is 'online' so the engine counts them
        p.isOffline = false;
    });
    
    if (!this.engine.context.left_players) this.engine.context.left_players = [];
  }

  public handleAction(actionType: string, amount?: number) {
    if (this.isDestroyed) return;

    const context = this.engine.context;
    const player = context.players.find((p: any) => p.id === this.currentHeroId);
    if (!player) return;

    const action = {
      type: actionType,
      seat: player.seat,
      amount: amount,
      gameId: this.engine.gameId
    };

    console.log('[LocalGame] Hero Action:', action);
    const result = this.engine.processAction(action);
    this.processResult(result);
  }

  private processResult(result: any) {
    if (this.isDestroyed) return;

    this.engine.context = result.state;
    const ctx = this.engine.context;

    // --- DIAGNOSTIC PROBE START ---
    console.group('[LocalGame Diagnostic]');
    console.log('1. Global Seats (Raw):', { 
        dealer: ctx.dealerSeat, 
        sb: ctx.sbSeat, 
        bb: ctx.bbSeat, 
        typeOfSB: typeof ctx.sbSeat 
    });
    
    console.log('2. Pots (Raw):', JSON.stringify(ctx.pots));

    const playerOne = ctx.players.find((p: any) => p.seat === 1);
    console.log('3. Player 1 Data (Raw):', {
        id: playerOne?.id,
        seat: playerOne?.seat,
        betThisRound: playerOne?.betThisRound,
        chips: playerOne?.chips,
        holeCards: playerOne?.holeCards
    });
    console.groupEnd();
    // --- DIAGNOSTIC PROBE END ---

    // 1. Base UI State (Revert to getPlayerContext to fix Hole Cards)
    // This method handles the card masking logic correctly for us.
    const uiState = this.engine.getPlayerContext(this.currentHeroId); 
    
    // 2. SAFE PATCHING (The Fix for NaN)
    // We use (val || 0) to ensure undefined/null becomes 0 instead of NaN
    uiState.dealerSeat = ctx.dealerSeat || 0;
    uiState.sbSeat = ctx.sbSeat || 0;
    uiState.bbSeat = ctx.bbSeat || 0;

    // 3. Patch Players
    if (uiState.players) {
        uiState.players.forEach((p: any) => {
            // Fix Bets: Ensure strictly a number
            p.bet = p.betThisRound || 0;
            p.chips = p.chips || 0;
            
            // Fix Icons: Safe comparison
            // We cast to Number() just in case, but rely on the safe defaults above
            const pSeat = Number(p.seat);
            p.isDealer = (pSeat === Number(uiState.dealerSeat));
            p.isSb = (pSeat === Number(uiState.sbSeat));
            p.isBb = (pSeat === Number(uiState.bbSeat));
        });
    }

    // 4. Fix Pots (Safe Parsing)
    if (Array.isArray(uiState.pots)) {
        uiState.pots = uiState.pots.map((pot: any) => {
            // Handle raw number case
            if (typeof pot === 'number') return { amount: pot, contributors: [] };
            
            // Handle object case safely
            return {
                amount: pot.amount || 0,
                contributors: pot.contributors || []
            };
        });
    } else {
        uiState.pots = [{ amount: 0, contributors: [] }];
    }

    this.updateUI(uiState);

    // 5. Handle Effects

    if (result.effects) {
      result.effects.forEach((effect: any) => {
        if (this.isDestroyed) return;

        switch (effect.type) {
          case EffectType.SCHEDULE_TRANSITION:
            const timer = setTimeout(() => {
              if (this.isDestroyed) return;
              const nextRes = this.engine.executeTransition(effect.targetPhase);
              this.processResult(nextRes);
            }, effect.delayMs);
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

    const ctx = this.engine.context;
    if (ctx.status !== 'active' && ctx.status !== 'waiting') return;
    if (ctx.currentPhase === 'showdown' || ctx.currentPhase === 'complete') return;

    const actor = ctx.players.find((p: any) => p.seat === ctx.currentActorSeat);
    if (actor && actor.isBot) {
        if (this.botTimeout) clearTimeout(this.botTimeout);
        
        this.botTimeout = setTimeout(() => {
            if (this.isDestroyed) return;
            this.executeBotMove(actor);
        }, 1000 + Math.random() * 1000);
    }
  }

  private executeBotMove(actor: any) {
     if (this.isDestroyed) return;

     const ctx = this.engine.context;
     const currentBet = Math.max(...ctx.players.map((p: any) => p.currentBet));
     const toCall = currentBet - actor.currentBet;
     
     let actionType = 'fold';
     let amount = 0;

     if (toCall === 0) {
         actionType = 'check';
     } else if (toCall < actor.chips) {
         actionType = 'call';
         amount = toCall;
     } else {
         actionType = 'fold';
     }

     const action = {
         type: actionType,
         seat: actor.seat,
         amount: amount,
         gameId: this.engine.gameId
     };
     
     const result = this.engine.processAction(action);
     this.processResult(result);
  }
  
  public cleanup() {
    this.isDestroyed = true;
    this.timers.forEach(clearTimeout);
    if (this.botTimeout) clearTimeout(this.botTimeout);
    console.log('[LocalGame] Manager destroyed and timers cleared.');
  }
}
