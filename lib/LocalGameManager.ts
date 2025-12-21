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
    // 1. Create Players (Let engine assign seats naturally to prevent conflicts)
    const playersData = [
      { id: heroId, name: 'You', isBot: false, chips: 1000 },
      { id: 'bot-1', name: 'Bot 1', isBot: true, chips: 1000 },
      { id: 'bot-2', name: 'Bot 2', isBot: true, chips: 1000 },
      { id: 'bot-3', name: 'Bot 3', isBot: true, chips: 1000 },
      { id: 'bot-4', name: 'Bot 4', isBot: true, chips: 1000 },
      { id: 'bot-5', name: 'Bot 5', isBot: true, chips: 1000 },
    ];
    
    const players = this.engine.config.maxPlayers === 2 ? playersData.slice(0, 2) : playersData;
    this.engine.addPlayers(players);

    // 2. FORCE VALID STATUS (Critical Fix)
    // The engine defaults to 'sitting_out' or 'offline' without a socket.
    // We must manually override these flags so the engine counts them as 'activePlayers'.
    this.engine.context.players.forEach((p, index) => {
        p.status = 'active';
        p.folded = false;
        p.allIn = false;
        p.left = false;
        p.isOffline = false; // Fixes 'activePlayers=0' bug
        p.chips = 1000;
        p.turnBet = 0;
        p.roundBet = 0;
        // Ensure 1-based seating if engine used 0-based
        // (Optional safety check, but engine usually handles this)
        if (p.seat === undefined) p.seat = index + 1;
    });
    
    // Initialize left_players to prevent crashes
    if (!this.engine.context.left_players) {
        this.engine.context.left_players = [];
    }
    
    console.log('[LocalGame] Players Setup Complete. Status forced to Active.');
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
    
    // 1. Get Player View
    const uiState = this.engine.getPlayerContext(this.currentHeroId); 
    
    // 2. INJECT MISSING BLIND DATA (Fixes missing icons)
    // The engine context has these, but getPlayerContext might not pass them through.
    uiState.sbSeat = this.engine.context.sbSeat;
    uiState.bbSeat = this.engine.context.bbSeat;
    uiState.dealerSeat = this.engine.context.dealerSeat;

    this.updateUI(uiState);

    if (result.effects) {
      result.effects.forEach((effect: any) => {
        if (this.isDestroyed) return;

        switch (effect.type) {
          case EffectType.SCHEDULE_TRANSITION:
            console.log(`[LocalGame] Transition scheduled: ${effect.targetPhase} in ${effect.delayMs}ms`);
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
