


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."add_chips"("user_id" "uuid", "amount" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE profiles
  SET chips = chips + amount,
      updated_at = NOW()
  WHERE id = user_id;
END;
$$;


ALTER FUNCTION "public"."add_chips"("user_id" "uuid", "amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."commit_match"("player_ids" "uuid"[], "game_type" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  new_game_id UUID;
BEGIN
  -- Protect against empty input
  IF player_ids IS NULL OR array_length(player_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'player_ids array must not be empty';
  END IF;

  -- Single transaction: remove players from queue and create game
  PERFORM 1;

  -- Delete all queue entries for provided players
  DELETE FROM queue
  WHERE user_id = ANY (player_ids);

  -- Insert new game row
  INSERT INTO games (status, game_type, players, state)
  VALUES (
    'starting',
    game_type,
    -- Store players as simple array of ids for now; server will expand to full state
    to_jsonb(
      ARRAY(
        SELECT jsonb_build_object('id', pid)
        FROM unnest(player_ids) AS pid
      )
    ),
    '{}'::jsonb
  )
  RETURNING id INTO new_game_id;

  RETURN new_game_id;
END;
$$;


ALTER FUNCTION "public"."commit_match"("player_ids" "uuid"[], "game_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deduct_chips"("user_ids" "uuid"[], "amount" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE profiles
  SET chips = chips - amount,
      updated_at = NOW()
  WHERE id = ANY(user_ids)
    AND chips >= amount;
END;
$$;


ALTER FUNCTION "public"."deduct_chips"("user_ids" "uuid"[], "amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deduct_chips"("user_ids" "uuid"[], "amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  uid UUID;
BEGIN
  -- Check if all users have enough funds
  FOR uid IN SELECT unnest(user_ids) LOOP
    IF (SELECT chips FROM profiles WHERE id = uid) < amount THEN
      RAISE EXCEPTION 'User % does not have enough chips', uid;
    END IF;
  END LOOP;

  -- Deduct chips (only executes if all checks pass)
  UPDATE profiles
  SET chips = chips - amount
  WHERE id = ANY(user_ids);
END;
$$;


ALTER FUNCTION "public"."deduct_chips"("user_ids" "uuid"[], "amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."extract_player_ids"("players_jsonb" "jsonb") RETURNS "uuid"[]
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select array_agg((p->>'id')::uuid)
  from jsonb_array_elements(players_jsonb) p
  where (p->>'id') is not null;
$$;


ALTER FUNCTION "public"."extract_player_ids"("players_jsonb" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_player_stats"("target_player_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  total_games int;
  total_hands int;
  total_wins int;
  total_vpip int;
  total_pfr int;
BEGIN
  -- 1. Count Total Hands (Denominator)
  -- Uses the explicit index scan on player_manifest for performance
  SELECT count(*)
  INTO total_hands
  FROM hand_histories
  WHERE 
    player_manifest->>'0' = target_player_id::text OR
    player_manifest->>'1' = target_player_id::text OR
    player_manifest->>'2' = target_player_id::text OR
    player_manifest->>'3' = target_player_id::text OR
    player_manifest->>'4' = target_player_id::text OR
    player_manifest->>'5' = target_player_id::text OR
    player_manifest->>'6' = target_player_id::text OR
    player_manifest->>'7' = target_player_id::text OR
    player_manifest->>'8' = target_player_id::text OR
    player_manifest->>'9' = target_player_id::text;

  -- 2. Count Hands Won
  SELECT count(*) INTO total_wins FROM hand_histories WHERE winner_id = target_player_id;

  -- 3. Count VPIP/PFR (Numerators)
  -- Counts rows where the specific player's flag in the stats JSON is TRUE
  -- Structure: stats.stats[playerId].vpip and stats.stats[playerId].pfr
  SELECT 
    count(*) FILTER (WHERE (stats->'stats'->(target_player_id::text)->>'vpip')::boolean IS TRUE),
    count(*) FILTER (WHERE (stats->'stats'->(target_player_id::text)->>'pfr')::boolean IS TRUE)
  INTO total_vpip, total_pfr
  FROM hand_histories
  WHERE stats->'stats' ? target_player_id::text;

  -- 4. Count Unique Games
  SELECT count(DISTINCT game_id)
  INTO total_games
  FROM hand_histories
  WHERE 
    player_manifest->>'0' = target_player_id::text OR
    player_manifest->>'1' = target_player_id::text OR
    player_manifest->>'2' = target_player_id::text OR
    player_manifest->>'3' = target_player_id::text OR
    player_manifest->>'4' = target_player_id::text OR
    player_manifest->>'5' = target_player_id::text OR
    player_manifest->>'6' = target_player_id::text OR
    player_manifest->>'7' = target_player_id::text OR
    player_manifest->>'8' = target_player_id::text OR
    player_manifest->>'9' = target_player_id::text;

  RETURN json_build_object(
    'games_played', total_games,
    'hands_played', total_hands,
    'hands_won', total_wins,
    'vpip_count', total_vpip,
    'pfr_count', total_pfr
  );
END;
$$;


ALTER FUNCTION "public"."get_player_stats"("target_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
DECLARE
  -- Create a variable to hold the potential username
  input_username TEXT := NEW.raw_user_meta_data->>'username';
  final_username TEXT;
BEGIN
  -- CHECK: Is it valid? (5-12 chars, alphanumeric)
  -- If yes, keep it. If no, set to NULL.
  IF input_username ~* '^[a-zA-Z0-9_]{5,12}$' THEN
    final_username := input_username;
  ELSE
    final_username := NULL;
  END IF;

  -- INSERT the safe value with dark mode default
  INSERT INTO public.profiles (id, username, created_at, theme)
  VALUES (NEW.id, final_username, NOW(), 'dark');
  
  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_chips"("user_id" "uuid", "amount" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE profiles
  SET chips = chips + amount
  WHERE id = user_id;
END;
$$;


ALTER FUNCTION "public"."increment_chips"("user_id" "uuid", "amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payout_chips"("user_id" "uuid", "amount" numeric) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE profiles
  SET chips = chips + amount
  WHERE id = user_id;
END;
$$;


ALTER FUNCTION "public"."payout_chips"("user_id" "uuid", "amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_join_code"("p_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_game_id UUID;
BEGIN
    SELECT id INTO v_game_id
    FROM games
    WHERE join_code = UPPER(p_code)
    AND status IN ('waiting', 'starting', 'active')
    AND is_private = true; -- Only allow join codes for private games
    
    RETURN v_game_id;
END;
$$;


ALTER FUNCTION "public"."resolve_join_code"("p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_game_from_queue"("p_queue_type" "text", "p_player_ids" "text"[]) RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
  v_game_id UUID;
  v_variant RECORD;
  v_config JSONB;
  v_buy_in NUMERIC;
  v_real_player_ids UUID[];
  v_actual_player_count INT;
BEGIN
  -- 1. IDENTIFY REAL PLAYERS FIRST
  -- Filter input array to find valid UUIDs (humans). Bots (strings) are ignored for DB locking.
  SELECT array_agg(id::UUID) INTO v_real_player_ids
  FROM unnest(p_player_ids) AS id
  WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  -- 2. LOCK ROW(S) FOR REAL PLAYERS ONLY
  -- We only validate that the *humans* are still in the queue and unlocked.
  IF array_length(v_real_player_ids, 1) > 0 THEN
    WITH locked AS (
      SELECT user_id
      FROM queue
      WHERE user_id = ANY (v_real_player_ids)
        AND queue_type = p_queue_type
      FOR UPDATE SKIP LOCKED
    )
    SELECT count(*) INTO v_actual_player_count FROM locked;

    -- Validate: Did we get locks for ALL real players?
    -- If count mismatch, another server instance stole a player.
    IF v_actual_player_count < array_length(v_real_player_ids, 1) THEN
      RETURN NULL;
    END IF;
  END IF;

  -- 3. Load Variant & Config (needed for chip deduction)
  SELECT * INTO v_variant FROM available_games WHERE slug = p_queue_type AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variant % not found or inactive', p_queue_type;
  END IF;

  v_config := v_variant.config;
  v_buy_in := COALESCE((v_config->>'buyIn')::NUMERIC, 0);

  -- 4. ATOMIC DEDUCTION (Cash Games Only)
  -- Perform this check strictly on the validated real players
  IF v_variant.category = 'cash' AND v_buy_in > 0 AND array_length(v_real_player_ids, 1) > 0 THEN
    PERFORM deduct_chips(v_real_player_ids, v_buy_in);
  END IF;

  -- 5. Generate Game ID (to return for Node.js to use)
  v_game_id := gen_random_uuid();

  -- 6. Cleanup Queue (atomic with the above operations)
  -- Only remove the real players we locked
  IF array_length(v_real_player_ids, 1) > 0 THEN
    DELETE FROM queue WHERE user_id = ANY(v_real_player_ids);
  END IF;

  -- 7. Return game ID (Node.js will create the game record with proper usernames)
  RETURN v_game_id;
END;
$_$;


ALTER FUNCTION "public"."start_game_from_queue"("p_queue_type" "text", "p_player_ids" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."available_games" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "engine_type" "text" NOT NULL,
    "category" "text" NOT NULL,
    "max_players" integer NOT NULL,
    "config" "jsonb" NOT NULL,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."available_games" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "strategy" "text" NOT NULL
);


ALTER TABLE "public"."bots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friend_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_user_id" "uuid" NOT NULL,
    "to_user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "friend_requests_check" CHECK (("from_user_id" <> "to_user_id")),
    CONSTRAINT "friend_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."friend_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friends" (
    "user_id" "uuid" NOT NULL,
    "friend_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "friends_check" CHECK (("user_id" <> "friend_id"))
);


ALTER TABLE "public"."friends" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_players" (
    "game_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "seat" integer NOT NULL,
    "chips" integer NOT NULL,
    "cards" "text"[],
    "folded" boolean DEFAULT false,
    "all_in" boolean DEFAULT false,
    "current_bet" integer DEFAULT 0,
    "total_bet_this_hand" integer DEFAULT 0,
    "is_dealer" boolean DEFAULT false,
    "is_small_blind" boolean DEFAULT false,
    "is_big_blind" boolean DEFAULT false,
    CONSTRAINT "game_players_seat_check" CHECK ((("seat" >= 1) AND ("seat" <= 6)))
);


ALTER TABLE "public"."game_players" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."games" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" NOT NULL,
    "small_blind" integer DEFAULT 1 NOT NULL,
    "big_blind" integer DEFAULT 2 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "players" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "buy_in" integer DEFAULT 200,
    "encrypted_deck" "text",
    "encrypted_hole_cards" "jsonb" DEFAULT '{}'::"jsonb",
    "game_type" "text" DEFAULT 'six_max'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "current_turn_seat" integer,
    "action_deadline" timestamp with time zone,
    "player_ids" "uuid"[] GENERATED ALWAYS AS ("public"."extract_player_ids"("players")) STORED,
    "is_private" boolean DEFAULT false,
    "host_id" "uuid",
    "is_paused" boolean DEFAULT false,
    "pending_requests" "jsonb" DEFAULT '[]'::"jsonb",
    "join_code" "text",
    CONSTRAINT "games_game_type_check" CHECK (("game_type" = ANY (ARRAY['six_max'::"text", 'heads_up'::"text", 'ten_max'::"text", 'ten_max_casual'::"text", 'six_max_casual'::"text", 'heads_up_casual'::"text"]))),
    CONSTRAINT "games_status_check" CHECK (("status" = ANY (ARRAY['waiting'::"text", 'starting'::"text", 'active'::"text", 'finished'::"text", 'complete'::"text"])))
);


ALTER TABLE "public"."games" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hand_histories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "hand_index" integer NOT NULL,
    "config" "jsonb" NOT NULL,
    "player_manifest" "jsonb" NOT NULL,
    "replay_data" "bytea" NOT NULL,
    "winner_id" "uuid",
    "final_pot" numeric,
    "played_at" timestamp with time zone DEFAULT "now"(),
    "stats" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."hand_histories" OWNER TO "postgres";


COMMENT ON TABLE "public"."hand_histories" IS 'Atomic hand logs containing full context and compressed replay data per hand';



COMMENT ON COLUMN "public"."hand_histories"."hand_index" IS 'Sequential hand number within the game session (0-indexed or 1-indexed)';



COMMENT ON COLUMN "public"."hand_histories"."config" IS 'Hand-specific configuration (blinds, antes, etc.) stored per-hand for atomic replay';



COMMENT ON COLUMN "public"."hand_histories"."player_manifest" IS 'Seat-to-player mapping (JSONB) stored per-hand for atomic replay without joins';



COMMENT ON COLUMN "public"."hand_histories"."replay_data" IS 'Compressed binary blob containing card distributions, bet amounts, and action sequences';



CREATE TABLE IF NOT EXISTS "public"."lesson_progress" (
    "user_id" "uuid" NOT NULL,
    "lesson_id" "uuid" NOT NULL,
    "current_page" integer DEFAULT 0 NOT NULL,
    "is_completed" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lesson_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lessons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "total_pages" integer DEFAULT 1 NOT NULL,
    "content" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "lessons_category_check" CHECK (("category" = ANY (ARRAY['beginner'::"text", 'intermediate'::"text", 'advanced'::"text"])))
);


ALTER TABLE "public"."lessons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text",
    "chips" integer DEFAULT 10000 NOT NULL,
    "theme" "text" DEFAULT 'light'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_superuser" boolean DEFAULT false,
    "debug_mode" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "color_theme" "text" DEFAULT 'emerald_felt'::"text" NOT NULL,
    "deck_preference" "text" DEFAULT 'standard'::"text" NOT NULL,
    CONSTRAINT "check_deck_preference" CHECK (("deck_preference" = ANY (ARRAY['standard'::"text", 'simplified'::"text"]))),
    CONSTRAINT "profiles_theme_check" CHECK (("theme" = ANY (ARRAY['light'::"text", 'dark'::"text"]))),
    CONSTRAINT "username_format" CHECK (("username" ~* '^[a-zA-Z0-9_]+$'::"text")),
    CONSTRAINT "username_length" CHECK ((("char_length"("username") >= 3) AND ("char_length"("username") <= 20)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."queue" (
    "id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "queue_type" "text" DEFAULT 'six_max'::"text",
    CONSTRAINT "queue_queue_type_check" CHECK (("queue_type" = ANY (ARRAY['six_max'::"text", 'heads_up'::"text", 'ten_max'::"text", 'ten_max_casual'::"text", 'six_max_casual'::"text", 'heads_up_casual'::"text"])))
);


ALTER TABLE "public"."queue" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."queue_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."queue_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."queue_id_seq" OWNED BY "public"."queue"."id";



CREATE TABLE IF NOT EXISTS "public"."range_presets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "range_string" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."range_presets" OWNER TO "postgres";


ALTER TABLE ONLY "public"."queue" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."queue_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."available_games"
    ADD CONSTRAINT "available_games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."available_games"
    ADD CONSTRAINT "available_games_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."bots"
    ADD CONSTRAINT "bots_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."bots"
    ADD CONSTRAINT "bots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_from_user_id_to_user_id_key" UNIQUE ("from_user_id", "to_user_id");



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friends"
    ADD CONSTRAINT "friends_pkey" PRIMARY KEY ("user_id", "friend_id");



ALTER TABLE ONLY "public"."game_players"
    ADD CONSTRAINT "game_players_pkey" PRIMARY KEY ("game_id", "user_id");



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hand_histories"
    ADD CONSTRAINT "hand_histories_game_id_hand_index_key" UNIQUE ("game_id", "hand_index");



ALTER TABLE ONLY "public"."hand_histories"
    ADD CONSTRAINT "hand_histories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("user_id", "lesson_id");



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."queue"
    ADD CONSTRAINT "queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."queue"
    ADD CONSTRAINT "queue_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."range_presets"
    ADD CONSTRAINT "range_presets_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_bots_strategy" ON "public"."bots" USING "btree" ("strategy");



CREATE INDEX "idx_friend_requests_from_user" ON "public"."friend_requests" USING "btree" ("from_user_id", "status");



CREATE INDEX "idx_friend_requests_to_user" ON "public"."friend_requests" USING "btree" ("to_user_id", "status");



CREATE INDEX "idx_friends_friend_id" ON "public"."friends" USING "btree" ("friend_id");



CREATE INDEX "idx_friends_user_id" ON "public"."friends" USING "btree" ("user_id");



CREATE INDEX "idx_games_action_deadline" ON "public"."games" USING "btree" ("action_deadline");



CREATE INDEX "idx_games_active" ON "public"."games" USING "btree" ("status") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_games_game_type" ON "public"."games" USING "btree" ("game_type");



CREATE INDEX "idx_games_host_id" ON "public"."games" USING "btree" ("host_id") WHERE ("host_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_games_join_code_unique" ON "public"."games" USING "btree" ("join_code") WHERE ("join_code" IS NOT NULL);



CREATE INDEX "idx_games_player_ids" ON "public"."games" USING "gin" ("player_ids");



CREATE INDEX "idx_games_players" ON "public"."games" USING "gin" ("players");



CREATE INDEX "idx_games_status" ON "public"."games" USING "btree" ("status");



CREATE INDEX "idx_games_type" ON "public"."games" USING "btree" ("game_type", "status");



CREATE INDEX "idx_games_type_created_at" ON "public"."games" USING "btree" ("game_type", "created_at");



CREATE INDEX "idx_games_updated_at" ON "public"."games" USING "btree" ("updated_at");



CREATE INDEX "idx_hh_game_id" ON "public"."hand_histories" USING "btree" ("game_id", "hand_index");



CREATE INDEX "idx_hh_played_at" ON "public"."hand_histories" USING "btree" ("played_at");



CREATE INDEX "idx_hh_players" ON "public"."hand_histories" USING "gin" ("player_manifest");



CREATE INDEX "idx_hh_winner" ON "public"."hand_histories" USING "btree" ("winner_id") WHERE ("winner_id" IS NOT NULL);



CREATE INDEX "idx_profiles_superuser" ON "public"."profiles" USING "btree" ("is_superuser");



CREATE INDEX "idx_queue_created_at" ON "public"."queue" USING "btree" ("created_at");



CREATE INDEX "idx_queue_type" ON "public"."queue" USING "btree" ("queue_type", "created_at");



CREATE INDEX "idx_queue_user_id" ON "public"."queue" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "update_games_updated_at" BEFORE UPDATE ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friends"
    ADD CONSTRAINT "friends_friend_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friends"
    ADD CONSTRAINT "friends_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_players"
    ADD CONSTRAINT "game_players_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_players"
    ADD CONSTRAINT "game_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."hand_histories"
    ADD CONSTRAINT "hand_histories_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."queue"
    ADD CONSTRAINT "queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Allow public read access" ON "public"."range_presets" FOR SELECT USING (true);



CREATE POLICY "Lessons are viewable by everyone" ON "public"."lessons" FOR SELECT USING (true);



CREATE POLICY "Participants can view their own hands" ON "public"."hand_histories" FOR SELECT USING (((("player_manifest" ->> '0'::"text") = ("auth"."uid"())::"text") OR (("player_manifest" ->> '1'::"text") = ("auth"."uid"())::"text") OR (("player_manifest" ->> '2'::"text") = ("auth"."uid"())::"text") OR (("player_manifest" ->> '3'::"text") = ("auth"."uid"())::"text") OR (("player_manifest" ->> '4'::"text") = ("auth"."uid"())::"text") OR (("player_manifest" ->> '5'::"text") = ("auth"."uid"())::"text") OR (("player_manifest" ->> '6'::"text") = ("auth"."uid"())::"text") OR (("player_manifest" ->> '7'::"text") = ("auth"."uid"())::"text") OR (("player_manifest" ->> '8'::"text") = ("auth"."uid"())::"text") OR (("player_manifest" ->> '9'::"text") = ("auth"."uid"())::"text")));



CREATE POLICY "Usernames are viewable by everyone" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert own progress" ON "public"."lesson_progress" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can join queue" ON "public"."queue" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can leave queue" ON "public"."queue" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own progress" ON "public"."lesson_progress" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view active games" ON "public"."games" FOR SELECT USING (true);



CREATE POLICY "Users can view all profiles" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Users can view game players" ON "public"."game_players" FOR SELECT USING (true);



CREATE POLICY "Users can view own progress" ON "public"."lesson_progress" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view queue" ON "public"."queue" FOR SELECT USING (true);



ALTER TABLE "public"."available_games" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "available_games_public_read" ON "public"."available_games" FOR SELECT USING (("active" = true));



ALTER TABLE "public"."bots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bots_public_read" ON "public"."bots" FOR SELECT USING (true);



ALTER TABLE "public"."friend_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."friends" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "friends_delete" ON "public"."friends" FOR DELETE USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "friend_id")));



CREATE POLICY "friends_insert" ON "public"."friends" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "friend_id")));



CREATE POLICY "friends_view_own" ON "public"."friends" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "friend_id")));



CREATE POLICY "friends_view_profiles" ON "public"."profiles" FOR SELECT USING ((("auth"."uid"() = "id") OR (EXISTS ( SELECT 1
   FROM "public"."friends"
  WHERE ((("friends"."user_id" = "auth"."uid"()) AND ("friends"."friend_id" = "profiles"."id")) OR (("friends"."user_id" = "profiles"."id") AND ("friends"."friend_id" = "auth"."uid"())))))));



ALTER TABLE "public"."game_players" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."games" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "games_anon_read_for_subs" ON "public"."games" FOR SELECT USING (true);



CREATE POLICY "games_players_only" ON "public"."games" USING (("auth"."uid"() IN ( SELECT (("elem"."value" ->> 'id'::"text"))::"uuid" AS "uuid"
   FROM "jsonb_array_elements"("games"."players") "elem"("value"))));



CREATE POLICY "games_players_read" ON "public"."games" FOR SELECT USING (("auth"."uid"() IN ( SELECT (("elem"."value" ->> 'id'::"text"))::"uuid" AS "uuid"
   FROM "jsonb_array_elements"("games"."players") "elem"("value")
  WHERE ((("elem"."value" ->> 'id'::"text") IS NOT NULL) AND ((("elem"."value" ->> 'isBot'::"text"))::boolean IS NOT TRUE)))));



ALTER TABLE "public"."hand_histories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lesson_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lessons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "no_queue_if_in_game" ON "public"."queue" FOR INSERT WITH CHECK ((NOT (EXISTS ( SELECT 1
   FROM "public"."games"
  WHERE (("games"."status" = ANY (ARRAY['active'::"text", 'starting'::"text"])) AND (("auth"."uid"() = ANY ("games"."player_ids")) OR (("games"."players" @> "jsonb_build_array"("jsonb_build_object"('userId', "auth"."uid"()))) OR ("games"."players" @> "jsonb_build_array"("jsonb_build_object"('id', "auth"."uid"()))) OR ("games"."players" @> "jsonb_build_array"("jsonb_build_object"('user_id', "auth"."uid"()))))))))));



COMMENT ON POLICY "no_queue_if_in_game" ON "public"."queue" IS 'Prevents users from joining queue if they are currently in an active or starting game';



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_read_usernames" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "profiles_users_own" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."queue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "queue_anon_read_for_subs" ON "public"."queue" FOR SELECT USING (true);



CREATE POLICY "queue_public_read" ON "public"."queue" FOR SELECT USING (true);



CREATE POLICY "queue_users_own" ON "public"."queue" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."range_presets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "requests_delete" ON "public"."friend_requests" FOR DELETE USING ((("auth"."uid"() = "from_user_id") OR ("auth"."uid"() = "to_user_id")));



CREATE POLICY "requests_insert" ON "public"."friend_requests" FOR INSERT WITH CHECK (("auth"."uid"() = "from_user_id"));



CREATE POLICY "requests_update" ON "public"."friend_requests" FOR UPDATE USING (("auth"."uid"() = "to_user_id"));



CREATE POLICY "requests_view_own" ON "public"."friend_requests" FOR SELECT USING ((("auth"."uid"() = "from_user_id") OR ("auth"."uid"() = "to_user_id")));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."bots";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."friend_requests";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."friends";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."queue";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."add_chips"("user_id" "uuid", "amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."add_chips"("user_id" "uuid", "amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_chips"("user_id" "uuid", "amount" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."commit_match"("player_ids" "uuid"[], "game_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."commit_match"("player_ids" "uuid"[], "game_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."commit_match"("player_ids" "uuid"[], "game_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."deduct_chips"("user_ids" "uuid"[], "amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."deduct_chips"("user_ids" "uuid"[], "amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_chips"("user_ids" "uuid"[], "amount" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."deduct_chips"("user_ids" "uuid"[], "amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."deduct_chips"("user_ids" "uuid"[], "amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_chips"("user_ids" "uuid"[], "amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."extract_player_ids"("players_jsonb" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."extract_player_ids"("players_jsonb" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."extract_player_ids"("players_jsonb" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_player_stats"("target_player_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_player_stats"("target_player_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_player_stats"("target_player_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_chips"("user_id" "uuid", "amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_chips"("user_id" "uuid", "amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_chips"("user_id" "uuid", "amount" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."payout_chips"("user_id" "uuid", "amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."payout_chips"("user_id" "uuid", "amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."payout_chips"("user_id" "uuid", "amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_join_code"("p_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_join_code"("p_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_join_code"("p_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."start_game_from_queue"("p_queue_type" "text", "p_player_ids" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."start_game_from_queue"("p_queue_type" "text", "p_player_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_game_from_queue"("p_queue_type" "text", "p_player_ids" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."available_games" TO "anon";
GRANT ALL ON TABLE "public"."available_games" TO "authenticated";
GRANT ALL ON TABLE "public"."available_games" TO "service_role";



GRANT ALL ON TABLE "public"."bots" TO "anon";
GRANT ALL ON TABLE "public"."bots" TO "authenticated";
GRANT ALL ON TABLE "public"."bots" TO "service_role";



GRANT ALL ON TABLE "public"."friend_requests" TO "anon";
GRANT ALL ON TABLE "public"."friend_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."friend_requests" TO "service_role";



GRANT ALL ON TABLE "public"."friends" TO "anon";
GRANT ALL ON TABLE "public"."friends" TO "authenticated";
GRANT ALL ON TABLE "public"."friends" TO "service_role";



GRANT ALL ON TABLE "public"."game_players" TO "anon";
GRANT ALL ON TABLE "public"."game_players" TO "authenticated";
GRANT ALL ON TABLE "public"."game_players" TO "service_role";



GRANT ALL ON TABLE "public"."games" TO "anon";
GRANT ALL ON TABLE "public"."games" TO "authenticated";
GRANT ALL ON TABLE "public"."games" TO "service_role";



GRANT ALL ON TABLE "public"."hand_histories" TO "anon";
GRANT ALL ON TABLE "public"."hand_histories" TO "authenticated";
GRANT ALL ON TABLE "public"."hand_histories" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_progress" TO "anon";
GRANT ALL ON TABLE "public"."lesson_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_progress" TO "service_role";



GRANT ALL ON TABLE "public"."lessons" TO "anon";
GRANT ALL ON TABLE "public"."lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."lessons" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."queue" TO "anon";
GRANT ALL ON TABLE "public"."queue" TO "authenticated";
GRANT ALL ON TABLE "public"."queue" TO "service_role";



GRANT ALL ON SEQUENCE "public"."queue_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."queue_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."queue_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."range_presets" TO "anon";
GRANT ALL ON TABLE "public"."range_presets" TO "authenticated";
GRANT ALL ON TABLE "public"."range_presets" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


