import { createServerComponentClient } from './supabaseClient'

/**
 * Simple server-side Supabase client
 * Wrapper around createServerComponentClient for cleaner API routes
 */
export async function createClient() {
  return await createServerComponentClient()
}

