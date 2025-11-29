import { GameState } from './GameState';
import { GameContext, Action, ActionType } from '../types';
import { dealCards } from '../deck';
import { addToHistory, resetPlayerBets, resetEligibleToBet } from '../GameContext';
import { getNextActivePlayer, getNextEligiblePlayer } from '../seatUtils';
import { RiverBetting } from './RiverBetting';

export class DealRiver implements GameState {
  phase = 'river' as const;

  onEnter(ctx: GameContext): GameContext {
    let newCtx = { ...ctx };
    
    // Reset bets
    newCtx = resetPlayerBets(newCtx);
    newCtx.minRaise = newCtx.bigBlind;
    newCtx.lastAggressorSeat = null;
    
    // Reset eligibleToBet for all non-all-in players
    newCtx = resetEligibleToBet(newCtx);
    
    // Burn 1, deal river (1 card)
    const { cards: burn, remaining: afterBurn } = dealCards(newCtx.deck, 1);
    const { cards: river, remaining: afterRiver } = dealCards(afterBurn, 1);
    newCtx.deck = afterRiver;
    newCtx.communityCards = [...newCtx.communityCards, river[0]];
    
    // Check if there are eligible players (if not, skip betting round)
    const eligiblePlayers = newCtx.players.filter(
      (p) => !p.folded && !p.allIn && p.chips > 0 && p.eligibleToBet
    );

    if (eligiblePlayers.length < 2) {
      // Not enough eligible players, skip betting round
      newCtx.currentActorSeat = null;
      newCtx.firstActorSeat = null;
    } else {
      // Set first actor (left of button) - first eligible player
      const firstActor = getNextEligiblePlayer(newCtx.buttonSeat, newCtx.players);
      newCtx.currentActorSeat = firstActor;
      newCtx.firstActorSeat = firstActor;
    }
    
    newCtx.currentPhase = 'river';
    newCtx = addToHistory(newCtx, 'River dealt');
    
    return newCtx;
  }

  onAction(ctx: GameContext, action: Action): GameContext {
    return ctx;
  }

  getLegalActions(ctx: GameContext, seat: number): ActionType[] {
    return [];
  }

  shouldTransition(ctx: GameContext): boolean {
    return true;
  }

  getNextState(): GameState | null {
    return new RiverBetting();
  }
}

