import { createServerComponentClient } from '@/lib/api/supabase/client';
import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    const supabase = await createServerComponentClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Trim username
    const normalizedUsername = username.trim();

    if (!normalizedUsername) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    // Query profiles with case-insensitive search
    // First try exact match (most common case)
    let { data, error } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('username', normalizedUsername)
      .neq('id', user.id)
      .maybeSingle();

    // If no exact match, try case-insensitive search
    if (!data && !error) {
      const { data: profiles, error: queryError } = await supabase
        .from('profiles')
        .select('id, username')
        .neq('id', user.id);

      if (queryError) {
        error = queryError;
      } else if (profiles && profiles.length > 0) {
        // Find case-insensitive match
        const match = profiles.find(
          (p) => p.username && p.username.toLowerCase() === normalizedUsername.toLowerCase()
        );
        data = match || null;
      }
    }

    if (error) {
      // Check if it's a "not found" error (PGRST116) or other error
      if (error.code === 'PGRST116' || error.message?.includes('No rows') || error.message?.includes('not found')) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      // Check if it's an RLS policy error
      if (error.code === '42501' || error.message?.includes('permission denied') || error.message?.includes('policy')) {
        return NextResponse.json({ 
          error: 'Permission denied. Please ensure RLS policies allow reading profiles.' 
        }, { status: 403 });
      }
      return NextResponse.json({ error: error.message || 'Search failed' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

