import { createServerComponentClient } from "@/lib/api/supabase/client";
import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/utils";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createServerComponentClient();
    
    const { data, error } = await supabase
      .from('available_games')
      .select('*')
      .eq('active', true)
      .order('max_players', { ascending: false });

    if (error) {
      console.error('[Variants API] Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // Ensure we always return an array
    return NextResponse.json(data || []);
  } catch (error: unknown) {
    console.error('[Variants API] Unexpected error:', error);
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

