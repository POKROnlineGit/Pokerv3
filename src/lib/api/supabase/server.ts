import { createServerComponentClient } from "./client";

/**
 * Simple server-side Supabase client
 * Wrapper around createServerComponentClient for cleaner API routes
 */
export async function createClient() {
  return await createServerComponentClient();
}

/**
 * Alias for createClient for consistency with naming conventions
 */
export async function createServerClient() {
  return await createServerComponentClient();
}

/**
 * Re-export createServerComponentClient for direct use
 */
export { createServerComponentClient };
