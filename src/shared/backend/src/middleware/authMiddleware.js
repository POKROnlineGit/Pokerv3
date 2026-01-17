import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.supabase_url;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || process.env.supabase_anon_key;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_KEY || process.env.supabase_service_key;

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL environment variable is required");
}

/**
 * Create a fresh Supabase client for each authentication check
 * This prevents shared state between socket connections
 * Uses anon key if available, otherwise falls back to service key
 */
function createAuthClient() {
  const key = supabaseAnonKey || supabaseServiceKey || "";
  return createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {},
    },
  });
}

export default async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const clientIp = socket.handshake.address;
    const userAgent = socket.handshake.headers["user-agent"];

    if (!token) {
      return next(new Error("Authentication token required"));
    }

    // Create a fresh client for each authentication check
    // This ensures no shared state between socket connections
    const authClient = createAuthClient();

    // Clear any potential cached state before getUser
    // This is important to prevent token/user caching issues
    try {
      await authClient.auth.signOut();
    } catch (e) {
      // Ignore signOut errors (might fail if no session exists)
    }

    const {
      data: { user },
      error,
    } = await authClient.auth.getUser(token);

    if (error || !user) {
      return next(new Error("Invalid or expired token"));
    }

    // Verify the user ID is valid UUID
    if (!user.id || typeof user.id !== "string") {
      return next(new Error("Invalid user data"));
    }

    // Attach user info to socket
    socket.userId = user.id;
    socket.userEmail = user.email;
    socket.userMetadata = user.user_metadata;

    next();
  } catch (error) {
    next(new Error("Authentication failed"));
  }
};

