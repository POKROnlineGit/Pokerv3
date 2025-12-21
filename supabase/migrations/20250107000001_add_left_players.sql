-- Add left_players column to games table
-- Tracks players who have left the game and should not be redirected back

-- Add left_players column (UUID array)
alter table games add column if not exists left_players uuid[] default array[]::uuid[];

-- Create GIN index for fast array lookups
create index if not exists idx_games_left_players on games using gin(left_players);

-- Add comment for documentation
comment on column games.left_players is 'Array of user IDs who have left this game. These players should not be redirected back to the game.';





