# PokerOnline Server

Modular, persistent real-time Node.js server for PokerOnline built with Socket.io, Supabase, and Redis. Designed for deployment on Render.com with support for multiple game types and horizontal scaling.

## Features

- 🎮 **Real-time Game Management**: Socket.io for instant game state updates
- 💾 **Persistent State**: Supabase for database persistence and recovery
- 🔄 **Auto-Recovery**: Loads active games on startup, syncs via Realtime
- 🤖 **Bot Support**: Intelligent bots with multiple strategies fill queues and games
- ⏱️ **Timeout Handling**: Automatic action enforcement
- 🔐 **Secure**: JWT authentication via Supabase
- 📈 **Scalable**: Redis support for shared state across instances
- 🎯 **Modular Architecture**: Easy to extend with new game types via BaseGame
- 🔒 **Server-Side Logic**: All game logic runs server-side for security
- 🎲 **Action System**: Supports fold, check, call, bet, raise, allin with validation
- 🎴 **Multiple Game Types**: Supports 6-max (6 players) and heads-up (2 players)
- 💰 **Standard Stakes**: 1/2 blinds with 200 buy-in for all game types

## Directory Structure

```
/poker-server
├── src/
│   ├── index.js                → Main Express + Socket.io entrypoint
│   │
│   ├── domain/                 → Domain logic (business rules)
│   │   ├── game/
│   │   │   ├── engine/         → TexasHoldemEngine, config, types
│   │   │   ├── managers/       → GameManager, QueueManager, RecoveryService
│   │   │   ├── services/       → EffectExecutor, SocketBroadcaster
│   │   │   ├── bots/           → BotManager, botStrategies
│   │   │   └── types.js        → Game type definitions
│   │   ├── handHistory/        → HandHistoryService, HandRecorder, PokerCodec
│   │   └── evaluation/         → ShowdownService, showdownCalculator
│   │
│   ├── infrastructure/         → External integrations
│   │   ├── database/           → supabaseClient
│   │   ├── cache/              → redisClient
│   │   └── websocket/
│   │       └── handlers/        → gameHandler
│   │
│   ├── middleware/             → Express/Socket middleware
│   │   └── authMiddleware.js
│   │
│   ├── shared/                 → Shared utilities & constants
│   │   ├── constants/          → GAME_CONFIG, QUEUE_CONFIG
│   │   └── utils/              → Logger, Mutex, persistence, deck
│   │
│   ├── config/                 → Centralized configuration
│   │   └── index.js
│   │
│   └── scripts/                → Development/testing scripts
│       ├── simulate_game.js
│       └── test-hand-history.js
│
├── package.json                → Dependencies + scripts
├── render.yaml                  → Deployment configuration
├── loadEnv.cjs                  → Environment variable loader
└── README.md                   → This file
```

## Quick Start

### Local Development

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your Supabase credentials
   ```

3. **Run Server**
   ```bash
   npm start
   # Or for development with auto-reload:
   npm run dev
   ```

4. **Test Health Endpoint**
   ```bash
   curl http://localhost:4000/health
   ```

### Supabase Setup

1. **Run Migration**
   - Execute `supabase-migration.sql` in your Supabase SQL Editor
   - This creates `queue`, `games`, `game_players`, and `profiles` tables

2. **Enable Realtime**
   - Go to Supabase Dashboard → Database → Replication
   - Enable replication for `queue` and `games` tables

3. **Get Credentials**
   - Dashboard → Settings → API
   - Copy `Project URL` → `SUPABASE_URL`
   - Copy `service_role` key → `SUPABASE_SERVICE_KEY`

## Deployment on Render.com

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### Step 2: Deploy on Render

1. **Sign up** at [render.com](https://render.com)

2. **Create Web Service**
   - Dashboard → **New** → **Web Service**
   - Connect your GitHub repository
   - Select branch: `main`

3. **Configure Service**
   - **Name**: `poker-server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node --require ./loadEnv.cjs src/index.js`
   - **Plan**: Starter ($7/mo) for always-on persistence

4. **Environment Variables**
   ```
   SUPABASE_URL=your-supabase-url
   SUPABASE_SERVICE_KEY=your-service-key
   NODE_ENV=production
   PORT=4000
   ALLOWED_ORIGINS=https://pokronline.com,https://www.pokronline.com
   ```

5. **Deploy**
   - Click **Create Web Service**
   - Render will build and deploy (~2 minutes)

### Step 3: Add Redis (Optional, for Scaling)

1. **Create Redis Instance**
   - Dashboard → **New** → **Redis**
   - Plan: Starter ($10/mo)

2. **Add Redis URL to Environment**
   - Go to your Web Service → Environment
   - Add: `REDIS_URL=redis://red-xxxxx:6379` (from Redis instance)

## Socket Events

### Client → Server

- `joinQueue(data)` - Join matchmaking queue
  ```js
  // Support both formats:
  { type: 'six_max' | 'heads_up' }  // Object format
  'six_max' | 'heads_up'            // String format (defaults to 'six_max')
  ```
- `leaveQueue()` - Leave queue
- `joinGame(gameId)` - Join active game room
- `action(data)` - Player action
  ```js
  { 
    type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin',
    amount?: number  // Required for bet/raise
  }
  ```
- `request-state(gameId)` - Request current game state

### Server → Client

- `queue-joined` - Successfully joined queue
- `game-started` - Game created from queue
  ```js
  { gameId: string, type: string, players: number }
  ```
- `gameState` - Current game state (includes decrypted hole cards for requesting player)
- `action-processed` - Action was successfully processed
- `error` - Error message
- `player-joined` - Player joined game room
- `player-left` - Player left game room

## Architecture

The server uses a modular architecture with separation of concerns:

- **GameManager**: Manages in-memory game state, handles actions, timeouts, and bot turns
- **QueueManager**: Handles matchmaking, creates games when 6 players ready, fills with bots
- **BaseGame**: Abstract base class for game types (extend for new variants)
- **BotManager**: Bot decision-making with multiple strategies (aggressive, tight, loose, balanced)

## Game Flow

1. **Queue**: Players join queue → 6 players ready → Game created
2. **Preflop**: Blinds posted, hole cards dealt, betting round
3. **Flop**: 3 community cards dealt, betting round
4. **Turn**: 1 community card dealt, betting round
5. **River**: 1 community card dealt, final betting round
6. **Showdown**: Evaluate hands, award pots (TODO: implement hand evaluation)

## Extending with New Game Types

Create a new game type by extending `BaseGame`:

```javascript
import { BaseGame } from './models/BaseGame.js';

export class TournamentGame extends BaseGame {
  constructor(gameId) {
    super(gameId, 'tournament');
    this.maxPlayers = 9;
    // Add tournament-specific logic
  }
}
```

Then update `GameManager` and `QueueManager` to handle the new type.

## Environment Variables

- `SUPABASE_URL` - Your Supabase project URL (required)
- `SUPABASE_SERVICE_KEY` - Your Supabase service role key (required)
- `SUPABASE_ANON_KEY` - Your Supabase anon key (optional, recommended for Realtime)
- `REDIS_URL` - Redis connection URL (optional, for scaling)
- `PORT` - Server port (default: 4000)
- `NODE_ENV` - Environment (development/production)
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins
- `ENABLE_BOT_FILL` - Enable automatic bot filling for queues (default: `true`, set to `false` to disable)

## Testing

1. **Local Test**:
   - Start server: `npm start`
   - Connect via Socket.io client
   - Join queue, create game, send actions

2. **Health Check**:
   ```bash
   curl http://localhost:4000/health
   ```

## Troubleshooting

- **Missing env vars**: Ensure `.env.local` exists in development, or set env vars in Render dashboard
- **Redis connection fails**: Server continues without cache (Redis is optional)
- **Games not loading**: Check Supabase Realtime is enabled for `games` table
- **Socket.io connection fails**: Verify CORS origins match your domain

## License

ISC
