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
- **poker-evaluator** for hand ranking
- **zustand** for client-side state
- **lucide-react** for icons

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo>
cd pokeronline
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the schema below
3. Enable Realtime for the following tables:
   - `games`
   - `queue`
   - `game_players`

### 3. Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional: For Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### 4. Add Card Images

Place 52 card images in `public/cards/` with the following naming convention:
- `Ah.png`, `2h.png`, `3h.png`, ..., `Kh.png` (Hearts)
- `Ad.png`, `2d.png`, `3d.png`, ..., `Kd.png` (Diamonds)
- `Ac.png`, `2c.png`, `3c.png`, ..., `Kc.png` (Clubs)
- `As.png`, `2s.png`, `3s.png`, ..., `Ks.png` (Spades)

Card format: `{Rank}{Suit}` where Rank is `2-9, T, J, Q, K, A` and Suit is `h, d, c, s` (lowercase).

### 5. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## Supabase Schema

Run this SQL in your Supabase SQL Editor:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  chips INTEGER DEFAULT 10000 NOT NULL,
  theme TEXT DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Queue table
CREATE TABLE queue (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Games table
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL CHECK (status IN ('waiting', 'active', 'complete')),
  small_blind INTEGER DEFAULT 1 NOT NULL,
  big_blind INTEGER DEFAULT 2 NOT NULL,
  current_hand JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game players table
CREATE TABLE game_players (
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seat INTEGER NOT NULL CHECK (seat >= 1 AND seat <= 6),
  chips INTEGER NOT NULL,
  cards TEXT[],
  folded BOOLEAN DEFAULT FALSE,
  all_in BOOLEAN DEFAULT FALSE,
  current_bet INTEGER DEFAULT 0,
  total_bet_this_hand INTEGER DEFAULT 0,
  is_dealer BOOLEAN DEFAULT FALSE,
  is_small_blind BOOLEAN DEFAULT FALSE,
  is_big_blind BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (game_id, user_id)
);

-- Lessons table
CREATE TABLE lessons (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT,
  lesson_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lesson progress table
CREATE TABLE lesson_progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed BOOLEAN DEFAULT FALSE,
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, lesson_id)
);

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Queue policies
CREATE POLICY "Users can view queue"
  ON queue FOR SELECT
  USING (true);

CREATE POLICY "Users can join queue"
  ON queue FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave queue"
  ON queue FOR DELETE
  USING (auth.uid() = user_id);

-- Games policies
CREATE POLICY "Users can view active games"
  ON games FOR SELECT
  USING (true);

-- Game players policies
CREATE POLICY "Users can view game players"
  ON game_players FOR SELECT
  USING (true);

-- Lessons policies
CREATE POLICY "Anyone can view lessons"
  ON lessons FOR SELECT
  USING (true);

-- Lesson progress policies
CREATE POLICY "Users can view own progress"
  ON lesson_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
  ON lesson_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can upsert own progress"
  ON lesson_progress FOR UPDATE
  USING (auth.uid() = user_id);

-- Create function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, chips, theme)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    10000,
    'light'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable Realtime for tables
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE queue;
```

## Deployment to Vercel

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy!

The app will automatically deploy on every push to main.

## Project Structure

```
PokerOnline/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx         # Root layout with sidebar
│   ├── page.tsx           # Landing page
│   ├── auth/              # Authentication
│   ├── play/              # Game pages
│   ├── learn/             # Lesson pages
│   └── settings/          # Settings page
├── api/                   # API routes
│   ├── queue/             # Queue management
│   └── game/              # Game actions
├── components/            # React components
│   ├── ui/                # shadcn/ui components
│   ├── PokerTable.tsx     # Main table component
│   ├── ActionModal.tsx    # Action selection modal
│   └── ...
├── lib/
│   ├── supabaseClient.ts  # Supabase clients
│   └── poker-game/        # Core poker logic (state machine engine)
└── public/
    └── cards/             # Card images (52 files)
```

## Game Rules

- **Format**: No-Limit Texas Hold'em
- **Table Size**: 6 players maximum
- **Stakes**: 1/2 play-money chips
- **Starting Chips**: 10,000 per player
- **Blinds**: Small Blind = 1, Big Blind = 2

## Card Encoding

Cards are encoded as `{Rank}{Suit}`:
- **Ranks**: `2`, `3`, `4`, `5`, `6`, `7`, `8`, `9`, `T` (10), `J`, `Q`, `K`, `A`
- **Suits**: `h` (hearts), `d` (diamonds), `c` (clubs), `s` (spades)
- **Examples**: `Ah` = Ace of Hearts, `Tc` = Ten of Clubs, `5d` = Five of Diamonds

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.

