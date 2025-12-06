


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






CREATE OR REPLACE FUNCTION "public"."deduct_chips"("user_ids" "uuid"[], "amount" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE profiles
  SET chips = chips - amount
  WHERE id = ANY(user_ids) AND chips >= amount;
END;
$$;


ALTER FUNCTION "public"."deduct_chips"("user_ids" "uuid"[], "amount" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


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

SET default_tablespace = '';

SET default_table_access_method = "heap";


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
    "current_hand" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "players" "jsonb" DEFAULT '[]'::"jsonb",
    "state" "jsonb" DEFAULT '{}'::"jsonb",
    "buy_in" integer DEFAULT 200,
    "encrypted_deck" "text",
    "encrypted_hole_cards" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "games_status_check" CHECK (("status" = ANY (ARRAY['waiting'::"text", 'active'::"text", 'complete'::"text"])))
);


ALTER TABLE "public"."games" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lesson_progress" (
    "user_id" "uuid" NOT NULL,
    "lesson_id" integer NOT NULL,
    "completed" boolean DEFAULT false,
    "progress_percent" integer DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "lesson_progress_progress_percent_check" CHECK ((("progress_percent" >= 0) AND ("progress_percent" <= 100)))
);


ALTER TABLE "public"."lesson_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lessons" (
    "id" integer NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "content" "text",
    "lesson_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lessons" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."lessons_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."lessons_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."lessons_id_seq" OWNED BY "public"."lessons"."id";



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "chips" integer DEFAULT 10000 NOT NULL,
    "theme" "text" DEFAULT 'light'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_superuser" boolean DEFAULT false,
    "debug_mode" boolean DEFAULT false,
    CONSTRAINT "profiles_theme_check" CHECK (("theme" = ANY (ARRAY['light'::"text", 'dark'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."queue" (
    "id" integer NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
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



ALTER TABLE ONLY "public"."lessons" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."lessons_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."queue" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."queue_id_seq"'::"regclass");



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



ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("user_id", "lesson_id");



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."queue"
    ADD CONSTRAINT "queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."queue"
    ADD CONSTRAINT "queue_user_id_key" UNIQUE ("user_id");



CREATE INDEX "idx_friend_requests_from_user" ON "public"."friend_requests" USING "btree" ("from_user_id", "status");



CREATE INDEX "idx_friend_requests_to_user" ON "public"."friend_requests" USING "btree" ("to_user_id", "status");



CREATE INDEX "idx_friends_friend_id" ON "public"."friends" USING "btree" ("friend_id");



CREATE INDEX "idx_friends_user_id" ON "public"."friends" USING "btree" ("user_id");



CREATE INDEX "idx_games_active" ON "public"."games" USING "btree" ("status") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_games_players" ON "public"."games" USING "gin" ("players");



CREATE INDEX "idx_profiles_superuser" ON "public"."profiles" USING "btree" ("is_superuser");



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



ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."queue"
    ADD CONSTRAINT "queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can view lessons" ON "public"."lessons" FOR SELECT USING (true);



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can join queue" ON "public"."queue" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can leave queue" ON "public"."queue" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own progress" ON "public"."lesson_progress" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can upsert own progress" ON "public"."lesson_progress" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view active games" ON "public"."games" FOR SELECT USING (true);



CREATE POLICY "Users can view all profiles" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Users can view game players" ON "public"."game_players" FOR SELECT USING (true);



CREATE POLICY "Users can view own progress" ON "public"."lesson_progress" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view queue" ON "public"."queue" FOR SELECT USING (true);



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


CREATE POLICY "games_players_only" ON "public"."games" USING (("auth"."uid"() IN ( SELECT (("elem"."value" ->> 'id'::"text"))::"uuid" AS "uuid"
   FROM "jsonb_array_elements"("games"."players") "elem"("value"))));



ALTER TABLE "public"."lesson_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lessons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_read_usernames" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."queue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "requests_delete" ON "public"."friend_requests" FOR DELETE USING ((("auth"."uid"() = "from_user_id") OR ("auth"."uid"() = "to_user_id")));



CREATE POLICY "requests_insert" ON "public"."friend_requests" FOR INSERT WITH CHECK (("auth"."uid"() = "from_user_id"));



CREATE POLICY "requests_update" ON "public"."friend_requests" FOR UPDATE USING (("auth"."uid"() = "to_user_id"));



CREATE POLICY "requests_view_own" ON "public"."friend_requests" FOR SELECT USING ((("auth"."uid"() = "from_user_id") OR ("auth"."uid"() = "to_user_id")));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."friend_requests";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."friends";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."games";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."queue";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."deduct_chips"("user_ids" "uuid"[], "amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."deduct_chips"("user_ids" "uuid"[], "amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_chips"("user_ids" "uuid"[], "amount" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_chips"("user_id" "uuid", "amount" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_chips"("user_id" "uuid", "amount" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_chips"("user_id" "uuid", "amount" integer) TO "service_role";


















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



GRANT ALL ON TABLE "public"."lesson_progress" TO "anon";
GRANT ALL ON TABLE "public"."lesson_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_progress" TO "service_role";



GRANT ALL ON TABLE "public"."lessons" TO "anon";
GRANT ALL ON TABLE "public"."lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."lessons" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lessons_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lessons_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lessons_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."queue" TO "anon";
GRANT ALL ON TABLE "public"."queue" TO "authenticated";
GRANT ALL ON TABLE "public"."queue" TO "service_role";



GRANT ALL ON SEQUENCE "public"."queue_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."queue_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."queue_id_seq" TO "service_role";









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


