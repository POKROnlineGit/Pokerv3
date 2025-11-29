import { GameState } from './GameState';
import { GameContext, Action, ActionType } from '../types';
import { addToHistory } from '../GameContext';
import { HandComplete } from './HandComplete';
import { getHandStrength } from '../botHandEvaluator';

export class Showdown implements GameState {
  phase = 'showdown' as const;

  onEnter(ctx: GameContext): GameContext {
    let newCtx = { ...ctx };
    
    // Find all players still in the hand
    const activePlayers = newCtx.players.filter(p => !p.folded && p.chips > 0);
    
    if (activePlayers.length === 1) {
      // Only one player left - award pot
      const winner = activePlayers[0];
      const totalPot = newCtx.pots.reduce((sum, pot) => sum + pot.amount, 0);
      newCtx.players = newCtx.players.map(p => 
        p.id === winner.id 
          ? { ...p, chips: p.chips + totalPot }
          : p
      );
      newCtx = addToHistory(newCtx, `Seat ${winner.seat} wins ${totalPot} chips (all others folded)`);
    } else {
      // Evaluate hands using browser-compatible evaluator
      const evaluations = activePlayers.map(player => {
        const allCards = [...player.holeCards, ...newCtx.communityCards];
        const strength = getHandStrength(allCards as any);
        return {
          player,
          strength,
        };
      });
      
      // Sort by hand strength (descending)
      evaluations.sort((a, b) => b.strength - a.strength);
      
      // Award pots
      const winners = evaluations.filter(e => e.strength === evaluations[0].strength);
      const totalPot = newCtx.pots.reduce((sum, pot) => sum + pot.amount, 0);
      const winningsPerPlayer = Math.floor(totalPot / winners.length);
      
      const winnerIds = winners.map(w => w.player.id);
      newCtx.players = newCtx.players.map(p => {
        if (winnerIds.includes(p.id)) {
          return { ...p, chips: p.chips + winningsPerPlayer };
        }
        return p;
      });
      
      winners.forEach(winner => {
        const player = newCtx.players.find(p => p.id === winner.player.id)!;
        const handName = winner.strength > 0.9 ? 'Strong Hand' : winner.strength > 0.7 ? 'Good Hand' : 'Decent Hand';
        newCtx = addToHistory(newCtx, `Seat ${player.seat} wins ${winningsPerPlayer} chips with ${handName}`);
      });
    }
    
    newCtx.currentPhase = 'showdown';
    newCtx.currentActorSeat = null;
    
    return newCtx;
  }

  onAction(ctx: GameContext, action: Action): GameContext {
    return ctx;
  }

  getLegalActions(ctx: GameContext, seat: number): ActionType[] {
    return [];
  }

  shouldTransition(ctx: GameContext): boolean {
    // Don't auto-transition - the store will call forceTransition() after 5 seconds
    // This prevents immediate transition when showdown state is entered
    return false;
  }

  getNextState(): GameState | null {
    return new HandComplete();
  }
}

