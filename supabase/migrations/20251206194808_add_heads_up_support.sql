-- Add Heads-Up Poker Support

-- Create bots table (predefined bots)
CREATE TABLE IF NOT EXISTS bots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,  -- e.g., 'AggroBot'
  strategy TEXT NOT NULL      -- e.g., 'aggressive'
);

ALTER TABLE bots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bots_public_read" ON bots FOR SELECT USING (true);

-- Insert sample bots
INSERT INTO bots (name, strategy) VALUES 
  ('AggroBot', 'aggressive'),
  ('TightBot', 'tight'),
  ('CallingStation', 'calling'),
  ('RandomBot', 'random'),
  ('SolidBot', 'balanced')
ON CONFLICT (name) DO NOTHING;

-- Add queue_type to queue table
ALTER TABLE queue ADD COLUMN IF NOT EXISTS queue_type TEXT DEFAULT 'six_max' CHECK (queue_type IN ('six_max', 'heads_up'));

CREATE INDEX IF NOT EXISTS idx_queue_type ON queue(queue_type, created_at);

-- Add game_type to games table
ALTER TABLE games ADD COLUMN IF NOT EXISTS game_type TEXT DEFAULT 'six_max' CHECK (game_type IN ('six_max', 'heads_up'));

CREATE INDEX IF NOT EXISTS idx_games_type ON games(game_type, status);

-- Enable Realtime on bots table
-- Note: This will fail if table is already in publication, but that's okay
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'bots'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bots;
  END IF;
END $$;

