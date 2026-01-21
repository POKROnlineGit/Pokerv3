/**
 * Pure functions for normalizing server data to UI format
 * These handle the transformation of server payloads to the format expected by React components
 */

import type {
  GameState,
  Player,
  PendingJoinRequest,
  GameSpectator,
  GameStateConfig,
  Pot,
} from "@/lib/types/poker";
import type { GameStateEvent, ServerPot } from "../types/game";

// ============================================
// POT NORMALIZATION
// ============================================

// Re-export ServerPot for convenience
export type { ServerPot } from "../types/game";

export interface NormalizedPots {
  mainPot: number;
  sidePots: Array<{ amount: number; eligibleSeats: number[] }>;
}

/**
 * Convert server pot format to UI format
 * Server sends: pots: [{ amount: 3, eligiblePlayers: [...] }]
 * UI expects: pot: number, sidePots: [{ amount: number, eligibleSeats: number[] }]
 */
export function normalizePots(
  serverPots: ServerPot[] | undefined,
  players: Player[]
): NormalizedPots {
  if (!serverPots || !Array.isArray(serverPots)) {
    return { mainPot: 0, sidePots: [] };
  }

  if (serverPots.length === 0) {
    return { mainPot: 0, sidePots: [] };
  }

  const mainPot = serverPots[0]?.amount || 0;

  // Convert eligiblePlayers (UUIDs) to eligibleSeats (seat numbers)
  const sidePots = serverPots.slice(1).map((pot) => ({
    amount: pot?.amount || 0,
    eligibleSeats: (pot?.eligiblePlayers || [])
      .map((playerId: string) => {
        const player = players?.find((p) => p.id === playerId);
        return player?.seat || 0;
      })
      .filter((seat: number) => seat > 0),
  }));

  return { mainPot, sidePots };
}

// ============================================
// PLAYER NORMALIZATION
// ============================================

/**
 * Normalize a single player with default values
 * Ensures all required fields exist even if server sends incomplete data
 */
export function normalizePlayer(serverPlayer: Partial<Player>): Player {
  return {
    id: serverPlayer.id || "",
    username: serverPlayer.username || `Player ${serverPlayer.seat || ""}`,
    seat: serverPlayer.seat || 0,
    chips: typeof serverPlayer.chips === "number" ? serverPlayer.chips : 0,
    currentBet: serverPlayer.currentBet || 0,
    totalBet: serverPlayer.totalBet ?? serverPlayer.totalBetThisHand ?? 0,
    holeCards: Array.isArray(serverPlayer.holeCards)
      ? serverPlayer.holeCards.filter(
          (c: unknown): c is string => typeof c === "string"
        )
      : [],
    folded: Boolean(serverPlayer.folded),
    allIn: Boolean(serverPlayer.allIn),
    isBot: Boolean(serverPlayer.isBot),
    leaving: Boolean(serverPlayer.leaving),
    playerHandType: serverPlayer.playerHandType,
    revealedIndices: Array.isArray(serverPlayer.revealedIndices)
      ? serverPlayer.revealedIndices
      : [],
    disconnected: serverPlayer.disconnected ?? false,
    left: serverPlayer.left ?? false,
    isGhost: serverPlayer.isGhost ?? serverPlayer.disconnected ?? false,
    disconnectTimestamp: serverPlayer.disconnectTimestamp,
    status: serverPlayer.status,
  };
}

/**
 * Normalize players array
 */
export function normalizePlayers(serverPlayers: Partial<Player>[] | undefined): Player[] {
  if (!Array.isArray(serverPlayers)) {
    return [];
  }
  return serverPlayers.map(normalizePlayer);
}

// ============================================
// PHASE NORMALIZATION
// ============================================

export type ServerPhase = "waiting" | "preflop" | "flop" | "turn" | "river" | "showdown" | "complete";
export type UIPhase = "preflop" | "flop" | "turn" | "river" | "showdown" | "waiting";

/**
 * Map server phase to UI phase
 * "waiting" is mapped to "preflop" for UI display (but we keep track of actual waiting state)
 */
export function normalizePhase(serverPhase: string | undefined): UIPhase {
  if (!serverPhase) return "preflop";

  if (serverPhase === "waiting" || serverPhase === "complete") {
    return "preflop";
  }

  return serverPhase as UIPhase;
}

/**
 * Check if server phase is the waiting state
 */
export function isWaitingPhase(serverPhase: string | undefined): boolean {
  return serverPhase === "waiting";
}

// ============================================
// CARD FILTERING
// ============================================

/**
 * Filter out "HIDDEN" values from cards array
 * Returns only actual card strings
 */
export function filterHiddenCards(cards: (string | "HIDDEN" | null)[] | undefined): string[] {
  if (!Array.isArray(cards)) return [];
  return cards.filter((c): c is string => c !== null && c !== "HIDDEN" && typeof c === "string");
}

/**
 * Filter community cards, removing hidden/invalid values
 */
export function normalizeCommunityCards(cards: unknown[] | undefined): string[] {
  if (!Array.isArray(cards)) return [];
  return cards.filter((c): c is string => typeof c === "string");
}

// ============================================
// PENDING REQUESTS NORMALIZATION
// ============================================

/**
 * Normalize pending join requests for private games
 * Handles field name mismatch between backend (id, userId) and frontend (odanUserId, odanRequestId)
 */
export function normalizePendingRequests(
  requests: Partial<PendingJoinRequest & { id?: string; userId?: string }>[] | undefined,
  seatedPlayerIds: string[]
): PendingJoinRequest[] {
  if (!Array.isArray(requests) || requests.length === 0) {
    return [];
  }

  // Filter out requests from players who are now seated
  // Check all possible ID field names from backend
  const cleanedRequests = requests.filter((req) => {
    const requestUserId = req.odanUserId || req.id || req.userId || req.odanRequestId;
    return requestUserId && !seatedPlayerIds.includes(requestUserId);
  });

  // Normalize each request - map backend fields to frontend fields
  return cleanedRequests.map((req) => ({
    odanUserId: req.odanUserId || req.id || req.userId || "",
    odanRequestId: req.odanRequestId || req.id || req.userId || "",
    username: req.username || "Unknown",
    requestedAt: req.requestedAt || new Date().toISOString(),
    type: req.type || "join",
  }));
}

// ============================================
// FULL GAME STATE NORMALIZATION
// ============================================

export interface NormalizeGameStateOptions {
  gameId: string;
  previousState?: GameState | null;
  defaultConfig?: Partial<GameStateConfig>;
}

/**
 * Normalize full game state from server
 * This is the main normalization function used after receiving gameState events
 */
export function normalizeGameState(
  serverState: GameStateEvent,
  options: NormalizeGameStateOptions
): GameState {
  const { gameId, previousState, defaultConfig } = options;

  // Normalize players first (needed for pot normalization)
  const normalizedPlayers = normalizePlayers(serverState.players);

  // Normalize pots
  let mainPot = 0;
  let sidePots: Array<{ amount: number; eligibleSeats: number[] }> = [];

  if (serverState.pots && Array.isArray(serverState.pots)) {
    const normalized = normalizePots(serverState.pots as ServerPot[], normalizedPlayers);
    mainPot = normalized.mainPot;
    sidePots = normalized.sidePots;
  } else {
    // Fallback: use pot and sidePots if they exist directly
    mainPot = typeof serverState.pot === "number" ? serverState.pot : 0;
    sidePots = Array.isArray(serverState.sidePots) ? serverState.sidePots : [];
  }

  // Detect phase
  const serverPhase = serverState.currentPhase || serverState.phase || "preflop";
  const waiting = isWaitingPhase(serverPhase);

  // Handle waiting state during active hand (block transition)
  const hasActiveHand =
    (serverState.communityCards && serverState.communityCards.length > 0) ||
    mainPot > 0 ||
    normalizedPlayers.some(
      (p) =>
        (p.holeCards && p.holeCards.length > 0) ||
        (p.currentBet && p.currentBet > 0)
    );
  const shouldBlockWaiting = hasActiveHand && waiting;

  // Normalize community cards
  const communityCards = shouldBlockWaiting
    ? normalizeCommunityCards(serverState.communityCards)
    : waiting
    ? []
    : normalizeCommunityCards(serverState.communityCards);

  // Calculate high bet from players if not directly available
  const highBet =
    typeof serverState.highBet === "number"
      ? serverState.highBet
      : normalizedPlayers.length > 0
      ? Math.max(...normalizedPlayers.map((p) => p.currentBet || 0), 0)
      : 0;

  // Build normalized config
  const config: GameStateConfig = {
    maxPlayers: serverState.config?.maxPlayers ?? defaultConfig?.maxPlayers ?? 6,
    smallBlind:
      serverState.config?.smallBlind ??
      serverState.smallBlind ??
      defaultConfig?.smallBlind ??
      1,
    bigBlind:
      serverState.config?.bigBlind ??
      serverState.bigBlind ??
      defaultConfig?.bigBlind ??
      2,
    turnTimer: serverState.config?.turnTimer ?? defaultConfig?.turnTimer ?? 30,
  };

  // Normalize pending requests for private games
  const seatedPlayerIds = normalizedPlayers.map((p) => p.id);
  const pendingRequests = normalizePendingRequests(
    serverState.pendingRequests,
    seatedPlayerIds
  );

  // Normalize spectators for private games
  // Backend sends userId but frontend expects odanUserId
  const spectators: GameSpectator[] = Array.isArray(serverState.spectators)
    ? serverState.spectators.map((s: Partial<GameSpectator & { userId?: string }>) => ({
        odanUserId: s.odanUserId || s.userId || "",
        username: s.username || "Unknown",
        joinedAt: s.joinedAt || new Date().toISOString(),
      }))
    : [];

  const normalizedState: GameState = {
    gameId: serverState.gameId || gameId,
    status: serverState.status,
    players: normalizedPlayers,
    communityCards,
    pot: shouldBlockWaiting ? mainPot : waiting ? 0 : mainPot,
    sidePots: shouldBlockWaiting ? sidePots : waiting ? [] : sidePots,
    buttonSeat: typeof serverState.buttonSeat === "number" ? serverState.buttonSeat : 1,
    sbSeat: typeof serverState.sbSeat === "number" ? serverState.sbSeat : 1,
    bbSeat: typeof serverState.bbSeat === "number" ? serverState.bbSeat : 2,
    currentPhase: shouldBlockWaiting
      ? previousState?.currentPhase || normalizePhase(serverPhase)
      : normalizePhase(serverPhase),
    currentActorSeat:
      typeof serverState.currentActorSeat === "number"
        ? serverState.currentActorSeat
        : null,
    minRaise: typeof serverState.minRaise === "number" ? serverState.minRaise : 2,
    lastRaiseAmount:
      typeof serverState.lastRaiseAmount === "number"
        ? serverState.lastRaiseAmount
        : undefined,
    betsThisRound: Array.isArray(serverState.betsThisRound)
      ? serverState.betsThisRound
      : [],
    handNumber: typeof serverState.handNumber === "number" ? serverState.handNumber : 0,
    bigBlind:
      typeof serverState.bigBlind === "number"
        ? serverState.bigBlind
        : config.bigBlind,
    smallBlind:
      typeof serverState.smallBlind === "number"
        ? serverState.smallBlind
        : config.smallBlind,
    highBet,
    config,
    // Private game fields
    isPrivate: serverState.isPrivate,
    joinCode: serverState.joinCode,
    hostId: serverState.hostId,
    isPaused: serverState.isPaused,
    pendingRequests,
    spectators,
    // Tournament fields
    tournamentId: serverState.tournamentId,
    // Preserve left_players if server sends it
    ...(serverState.left_players && { left_players: serverState.left_players }),
  };

  return normalizedState;
}

/**
 * Normalize game state for sync events (after reconnection)
 * Clears disconnect statuses since we've reconnected
 */
export function normalizeGameStateForSync(
  serverState: GameStateEvent,
  options: NormalizeGameStateOptions
): GameState {
  const normalized = normalizeGameState(serverState, options);

  // Clear disconnect status for all players on sync
  normalized.players = normalized.players.map((p) => ({
    ...p,
    disconnected: false,
    left: false,
    isGhost: false,
  }));

  return normalized;
}
