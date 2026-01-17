/**
 * Shared types for the game engine
 */

/**
 * @typedef {Object} Card
 * @property {string} suit - hearts, diamonds, clubs, spades
 * @property {string} rank - 2-10, J, Q, K, A
 * @property {number} value - Numeric value for comparison
 * @property {string} display - Display string (e.g., "Ah", "Kd")
 */

/**
 * @typedef {Object} Player
 * @property {string} id - User ID
 * @property {number} seat - Seat number (1-maxPlayers)
 * @property {string} username - Player username
 * @property {number} chips - Current chip stack
 * @property {Array<Card>} holeCards - Player's hole cards (private until showdown)
 * @property {number} currentBet - Bet amount this betting round
 * @property {number} totalBet - Total bet this hand
 * @property {boolean} folded - Whether player has folded
 * @property {boolean} allIn - Whether player is all-in
 * @property {boolean} eligibleToBet - Whether player can act this round
 * @property {boolean} isBot - Whether this is a bot player
 * @property {boolean} isOffline - Whether player is offline
 * @property {boolean} isGhost - Whether player is a ghost (disconnected but still in hand)
 * @property {string} [status] - Player status ('ACTIVE', 'DISCONNECTED', 'LEFT', 'REMOVED', 'WAITING_FOR_NEXT_HAND', 'ELIMINATED')
 */

/**
 * @typedef {Object} Pot
 * @property {number} amount - Pot amount
 * @property {Array<string>} eligiblePlayers - Player IDs eligible for this pot
 */

/**
 * @typedef {Object} GameContext
 * @property {string} gameId - Game ID
 * @property {string} type - Game type (holdem, plo, etc.)
 * @property {number} maxPlayers - Maximum players
 * @property {Array<Player>} players - Array of players
 * @property {number} buttonSeat - Dealer button seat
 * @property {number} smallBlind - Small blind amount
 * @property {number} bigBlind - Big blind amount
 * @property {number} buyIn - Buy-in amount
 * @property {Array<Card>} communityCards - Community cards (flop, turn, river)
 * @property {Array<Pot>} pots - Array of pots (main + side pots)
 * @property {string} currentPhase - Current game phase (preflop, flop, etc.)
 * @property {number|null} currentActorSeat - Seat of current player to act
 * @property {number|null} firstActorSeat - First actor seat in betting round
 * @property {number} minRaise - Minimum raise amount
 * @property {Array} handHistory - Action history
 * @property {number} handNumber - Current hand number
 * @property {string|null} actionDeadline - ISO timestamp for action timeout
 * @property {Array<Card>} deck - Current deck
 * @property {Object} showdownResults - Results from showdown (winners, rankings)
 * @property {boolean} isPrivate - Whether this is a private/host game
 * @property {string|null} hostId - Host user ID (for private games)
 * @property {boolean} isPaused - Whether the game is currently paused
 * @property {Array<Object>} pendingRequests - Array of pending seat requests (for private games)
 * @property {Array<Object>} spectators - Array of spectator users {userId, username, joinedAt} (for private games)
 */

/**
 * @typedef {('fold'|'check'|'call'|'bet'|'raise'|'allin')} ActionType
 */

/**
 * @typedef {Object} Action
 * @property {ActionType} type - Action type
 * @property {number} seat - Player seat number
 * @property {number} [amount] - Amount for bet/raise
 * @property {string} [playerId] - Player ID (optional, validated server-side)
 */

/**
 * @typedef {Object} ActionValidation
 * @property {boolean} valid - Whether action is valid
 * @property {string} [error] - Error message if invalid
 * @property {number} [minAmount] - Minimum amount for bet/raise
 * @property {number} [maxAmount] - Maximum amount for bet/raise
 */

/**
 * @typedef {Object} GameEvent
 * @property {string} type - Event type (e.g., 'PLAYER_ACTION', 'STREET_DEALT', 'SHOWDOWN')
 * @property {Object} data - Event data
 * @property {string} [timestamp] - ISO timestamp
 */

/**
 * @typedef {Object} Effect
 * @property {string} type - Effect type
 * @property {Object} [payload] - Effect-specific payload
 */

/**
 * Transition Effect - Requests a state transition
 * @typedef {Object} TransitionEffect
 * @property {string} type - 'SCHEDULE_TRANSITION'
 * @property {Function} targetState - State class constructor
 * @property {number} delayMs - Delay in milliseconds
 */

/**
 * Timer Effect - Requests starting a timer
 * @typedef {Object} TimerEffect
 * @property {string} type - 'START_TIMER' | 'CANCEL_TIMER'
 * @property {string} timerType - 'ACTION_TIMEOUT' | 'RECONNECT_TIMER' | 'TRANSITION'
 * @property {string} [playerId] - Player ID (for reconnect timer)
 * @property {number} [duration] - Duration in milliseconds
 * @property {Function} [callback] - Callback to execute when timer expires
 */

/**
 * Persistence Effect - Requests state persistence
 * @typedef {Object} PersistenceEffect
 * @property {string} type - 'PERSIST'
 */

/**
 * Reconnect Timer Effect
 * @typedef {Object} ReconnectTimerEffect
 * @property {string} type - 'START_RECONNECT_TIMER' | 'CANCEL_RECONNECT_TIMER'
 * @property {string} playerId - Player ID
 * @property {number} [duration] - Duration in milliseconds (for START)
 */

/**
 * Game End Effect
 * @typedef {Object} GameEndEffect
 * @property {string} type - 'GAME_END'
 * @property {string} reason - Reason for game end
 * @property {string} [winnerId] - Winner ID if applicable
 */


/**
 * @typedef {Object} GameResult
 * @property {GameContext} state - Updated game state
 * @property {Array<GameEvent>} events - Events to emit
 * @property {Array<Effect>} effects - Effects to execute
 */

export {};


