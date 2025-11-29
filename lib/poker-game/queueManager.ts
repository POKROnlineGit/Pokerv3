import { createServiceRoleClient } from "@/lib/supabaseClient";
import { GameEngine, createInitialContext } from "./index";
import { GameContext, Player } from "./types";

/**
 * Check queue and create a new multiplayer game when 6 players are ready
 * Returns the gameId if a game was created, null otherwise
 */
export async function checkQueueAndCreateGame(): Promise<string | null> {
  const supabase = createServiceRoleClient();

  // Get all players in queue
  const { data: queuePlayers, error } = await supabase
    .from("queue")
    .select("user_id, created_at")
    .order("created_at", { ascending: true })
    .limit(6);

  if (error) {
    console.error("Error checking queue:", error);
    return null;
  }

  if (!queuePlayers || queuePlayers.length < 6) {
    return null;
  }

  // Create new game
  const { randomUUID } = require("crypto");
  const gameId = randomUUID();

  // Get player profiles for chips
  const userIds = queuePlayers.map((q) => q.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, chips")
    .in("id", userIds);

  if (!profiles || profiles.length !== 6) {
    console.error("Could not fetch all player profiles");
    return null;
  }

  // Create game players with seats
  const gamePlayers: Player[] = queuePlayers.map((q, index) => {
    const profile = profiles.find((p) => p.id === q.user_id)!;
    return {
      id: q.user_id,
      seat: index + 1,
      name: `Player ${index + 1}`, // Will be updated from profile
      chips: profile.chips || 10000,
      currentBet: 0,
      totalBet: 0,
      holeCards: [],
      folded: false,
      allIn: false,
      eligibleToBet: true, // All players start eligible
      isBot: false,
    };
  });

  // Create initial game context
  const initialContext = createInitialContext(gameId, gamePlayers, 1, 2);

  // Create game engine and start first hand
  const gameEngine = new GameEngine(initialContext);
  const gameContext = gameEngine.getState();

  // Convert GameContext to legacy format for database storage
  const legacyGameState = {
    gameId: gameContext.gameId,
    status: "active" as const,
    players: gameContext.players.map((p) => ({
      userId: p.id,
      seat: p.seat,
      chips: p.chips,
      folded: p.folded,
      allIn: p.allIn,
      currentBet: p.currentBet,
      totalBetThisHand: p.totalBet,
      isDealer: p.seat === gameContext.buttonSeat,
      isSmallBlind: p.seat === (gameContext.buttonSeat % 6) + 1,
      isBigBlind: p.seat === (((gameContext.buttonSeat % 6) + 1) % 6) + 1,
      cards: p.holeCards,
    })),
    communityCards: gameContext.communityCards,
    pot: gameContext.pots[0]?.amount || 0,
    currentBet: Math.max(...gameContext.players.map((p) => p.currentBet), 0),
    dealerButton: gameContext.buttonSeat,
    currentPlayerIndex: gameContext.players.findIndex(
      (p) => p.seat === gameContext.currentActorSeat
    ),
    street:
      gameContext.currentPhase === "preflop"
        ? ("preflop" as const)
        : gameContext.currentPhase === "flop"
        ? ("flop" as const)
        : gameContext.currentPhase === "turn"
        ? ("turn" as const)
        : gameContext.currentPhase === "river"
        ? ("river" as const)
        : ("showdown" as const),
    smallBlind: gameContext.smallBlind,
    bigBlind: gameContext.bigBlind,
    handNumber: gameContext.handNumber,
  };

  // Save game to database
  const { error: gameError } = await supabase.from("games").insert({
    id: gameId,
    status: "active",
    small_blind: 1,
    current_hand: legacyGameState,
  });

  if (gameError) {
    console.error("Error creating game:", gameError);
    return null;
  }

  // Save game players
  const gamePlayersForDb = queuePlayers.map((q, index) => {
    const profile = profiles.find((p) => p.id === q.user_id)!;
    return {
      game_id: gameId,
      user_id: q.user_id,
      seat: index + 1,
      chips: profile.chips || 10000,
      folded: false,
      all_in: false,
      current_bet: 0,
      total_bet_this_hand: 0,
      is_dealer: index === 0,
      is_small_blind: index === 1,
      is_big_blind: index === 2,
    };
  });

  const { error: playersError } = await supabase
    .from("game_players")
    .insert(gamePlayersForDb);

  if (playersError) {
    console.error("Error creating game players:", playersError);
    return null;
  }

  // Remove players from queue
  const { error: queueError } = await supabase
    .from("queue")
    .delete()
    .in("user_id", userIds);

  if (queueError) {
    console.error("Error removing players from queue:", queueError);
  }

  return gameId;
}
