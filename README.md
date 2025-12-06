# PokerOnline

A complete, production-ready Next.js 15 poker application for learning and playing No-Limit Texas Hold'em. Deploys instantly to Vercel and uses Supabase as the backend.

## Features

- 🎮 **Real-Time Poker Games**: 6-max No-Limit Texas Hold'em tables
- 📚 **Interactive Lessons**: Learn poker fundamentals with progress tracking
- 🎨 **Beautiful UI**: Modern, responsive design with dark/light mode
- ⚡ **Real-Time Updates**: Supabase Realtime for live game updates
- 🔐 **Authentication**: Google OAuth + Email/Password via Supabase Auth
- 💰 **Play Money**: Start with 10,000 chips

## Tech Stack

- **Next.js 15** (App Router) with TypeScript
- **Tailwind CSS** + **shadcn/ui** + **Radix UI**
- **Supabase** (Auth + PostgreSQL + Realtime)
- **Custom poker engine** for hand ranking
- **zustand** for client-side state
- **lucide-react** for icons

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo>
cd pokeronline
npm install
```

### 2. Set Up Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## Documentation

All documentation has been moved to the `/markdown` directory:

- **Setup & Guides**: `/markdown/documentation/`
- **Poker Game Engine**: `/markdown/poker-game/`
- **Code Analysis**: `/markdown/analysis/`
- **Resources**: `/markdown/resources/`

## License

MIT

