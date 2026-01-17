/**
 * Game Constants and Configuration
 */

export const QUEUE_CONFIG = {
  six_max: {
    minPlayers: 6,
    botFillAfter: 30000, // 30 seconds
  },
  heads_up: {
    minPlayers: 2,
    botFillAfter: 30000, // 30 seconds
  },
};

export const GAME_CONFIG = {
  six_max: {
    maxPlayers: 6,
    blinds: { small: 1, big: 2 },
    buyIn: 200,
    actionTimeout: 30000, // 30 seconds
  },
  heads_up: {
    maxPlayers: 2,
    blinds: { small: 1, big: 2 },
    buyIn: 200,
    actionTimeout: 30000, // 30 seconds
  },
};

export const ACTION_TYPES = {
  FOLD: "fold",
  CHECK: "check",
  CALL: "call",
  BET: "bet",
  RAISE: "raise",
  ALLIN: "allin",
};

export const GAME_PHASES = {
  WAITING: "waiting",
  PREFLOP: "preflop",
  FLOP: "flop",
  TURN: "turn",
  RIVER: "river",
  SHOWDOWN: "showdown",
  COMPLETE: "complete",
};

export const BOT_STRATEGIES = {
  AGGRESSIVE: "aggressive",
  TIGHT: "tight",
  LOOSE: "loose",
  BALANCED: "balanced",
  CALLING: "calling",
  RANDOM: "random",
};


