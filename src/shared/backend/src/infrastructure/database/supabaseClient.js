import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.supabase_url;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || process.env.supabase_anon_key;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_KEY || process.env.supabase_service_key;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL environment variable is required");
}

// Admin client with service key (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Realtime client for subscriptions
export const supabaseRealtime = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

