-- Prevent players in active games from joining queue
-- This RLS policy enforces database-level protection

-- Drop existing policy if it exists (idempotent)
drop policy if exists "no_queue_if_in_game" on queue;

-- Create RLS policy to prevent queue insert if user is in an active game
-- Checks both player_ids array (indexed, fast) and players JSONB (fallback)
create policy "no_queue_if_in_game" on queue
for insert 
with check (
  not exists (
    select 1 from games
    where status in ('active', 'starting')
    and (
      -- Check indexed player_ids array (most efficient)
      auth.uid() = any(player_ids)
      or
      -- Fallback: check players JSONB array for userId, id, or user_id fields
      (
        players::jsonb @> jsonb_build_array(jsonb_build_object('userId', auth.uid()))
        or
        players::jsonb @> jsonb_build_array(jsonb_build_object('id', auth.uid()))
        or
        players::jsonb @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()))
      )
    )
  )
);

-- Add comment for documentation
comment on policy "no_queue_if_in_game" on queue is 
'Prevents users from joining queue if they are currently in an active or starting game';







