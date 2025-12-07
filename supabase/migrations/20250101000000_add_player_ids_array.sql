-- Create function to extract player IDs from players JSONB array
create or replace function extract_player_ids(players_jsonb jsonb)
returns uuid[] as $$
  select array_agg((p->>'id')::uuid)
  from jsonb_array_elements(players_jsonb) p
  where (p->>'id') is not null;
$$ language sql immutable;

-- Add searchable player_ids array (auto-filled from players JSONB)
-- Uses the function to extract player IDs
alter table games add column if not exists player_ids uuid[] 
  generated always as (extract_player_ids(players)) stored;

-- Index for fast lookups
create index if not exists idx_games_player_ids on games using gin(player_ids);

-- Make sure Realtime is enabled for games table (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and tablename = 'games'
  ) then
    alter publication supabase_realtime add table games;
  end if;
end $$;

