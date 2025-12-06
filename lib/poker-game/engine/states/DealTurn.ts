import { GameState } from './GameState';
import { GameContext, Action, ActionType } from '../core/types';
import { dealCards } from '../utils/deck';
import { addToHistory, resetPlayerBets, resetEligibleToBet } from '../core/GameContext';
import { getNextActivePlayer, getNextEligiblePlayer } from '../utils/seatUtils';
import { TurnBetting } from './TurnBetting';

export class DealTurn implements GameState {
  phase = 'turn' as const;

  onEnter(ctx: GameContext): GameContext {
    let newCtx = { ...ctx };
    
    // Reset bets
    newCtx = resetPlayerBets(newCtx);
    newCtx.minRaise = newCtx.bigBlind;
    newCtx.lastAggressorSeat = null;
    
    // Reset eligibleToBet for all non-all-in players
    newCtx = resetEligibleToBet(newCtx);
    
    // Burn 1, deal turn (1 card)
    const { cards: burn, remaining: afterBurn } = dealCards(newCtx.deck, 1);
    const { cards: turn, remaining: afterTurn } = dealCards(afterBurn, 1);
    newCtx.deck = afterTurn;
    newCtx.communityCards = [...newCtx.communityCards, turn[0]];
    
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
    
    newCtx.currentPhase = 'turn';
    newCtx = addToHistory(newCtx, 'Turn dealt');
    
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
    return new TurnBetting();
  }
}

