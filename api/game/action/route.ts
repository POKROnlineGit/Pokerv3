import { createServerComponentClient, createServiceRoleClient } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';
import { GameEngine } from '@/lib/poker-game';
import { Action } from '@/lib/poker-game/types';
import { legacyToGameContext, gameContextToLegacy, LegacyGameState } from '@/lib/poker-game/multiplayerAdapters';

export async function POST(request: Request) {
  try {
    const supabase = await createServerComponentClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { gameId, action, amount } = await request.json();

    // Load game state
    const serviceSupabase = createServiceRoleClient();
    const { data: game, error: gameError } = await serviceSupabase
      .from('games')
      .select('current_hand')
      .eq('id', gameId)
      .single();

    if (gameError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    const legacyState = game.current_hand as LegacyGameState;

    // Convert to GameContext and create engine
    const ctx = legacyToGameContext(legacyState);
    const engine = new GameEngine(ctx);

    // Find player seat
    const player = ctx.players.find(p => p.id === user.id);
    if (!player) {
      return NextResponse.json({ error: 'Player not in game' }, { status: 403 });
    }

    // Create action object
    const actionObj: Action = {
      type: action,
      seat: player.seat,
      amount,
    };

    // Process action
    engine.processAction(actionObj);

    // Get updated state
    const updatedContext = engine.getState();

    // Convert back to legacy format
    const updatedLegacyState = gameContextToLegacy(updatedContext);

    // Update game in database
    const { error: updateError } = await serviceSupabase
      .from('games')
      .update({ current_hand: updatedLegacyState })
      .eq('id', gameId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Update player states in game_players table
    for (const player of updatedContext.players) {
      await serviceSupabase
        .from('game_players')
        .update({
          chips: player.chips,
          folded: player.folded,
          all_in: player.allIn,
          current_bet: player.currentBet,
          total_bet_this_hand: player.totalBet,
        })
        .eq('game_id', gameId)
        .eq('user_id', player.id);
    }

    // Broadcast update to all players
    const channel = serviceSupabase.channel(`game:${gameId}`);
    await channel.send({
      type: 'broadcast',
      event: 'game-update',
      payload: { gameState: updatedLegacyState }
    });

    return NextResponse.json(updatedLegacyState);
  } catch (error: any) {
    console.error('Game action error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
