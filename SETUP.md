# Quick Setup Guide

## 1. Install Dependencies

```bash
npm install
```

## 2. Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In the SQL Editor, run the contents of `supabase-schema.sql`
3. Enable Realtime for `games` and `queue` tables:
   - Go to Database → Replication
   - Enable replication for `games` and `queue` tables

## 3. Configure Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Get these from: Supabase Dashboard → Settings → API

## 4. Add Card Images

Add 52 PNG card images to `public/cards/` following the naming convention:
- Format: `{Rank}{Suit}.png` (e.g., `Ah.png`, `Kd.png`, `Tc.png`)
- See `public/cards/README.md` for details

## 5. Run the App

```bash
npm run dev
```

Visit http://localhost:3000

## 6. Deploy to Vercel

1. Push to GitHub
2. Import in Vercel
3. Add environment variables
4. Deploy!

## Troubleshooting

- **Card images not showing**: Make sure all 52 cards are in `public/cards/` with correct naming
- **Realtime not working**: Check that Realtime is enabled for `games` and `queue` tables
- **Auth errors**: Verify your Supabase URL and keys are correct
- **Queue not creating games**: Check that `SUPABASE_SERVICE_ROLE_KEY` is set correctly

