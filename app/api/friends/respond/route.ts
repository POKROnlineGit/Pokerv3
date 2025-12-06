import { createServerComponentClient } from '@/lib/supabaseClient';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { requestId, accept } = await req.json();

    if (!requestId || typeof accept !== 'boolean') {
      return NextResponse.json({ error: 'Request ID and accept status required' }, { status: 400 });
    }

    const supabase = await createServerComponentClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const status = accept ? 'accepted' : 'rejected';

    // Update the request status
    const { data: request, error: updateError } = await supabase
      .from('friend_requests')
      .update({ status })
      .eq('id', requestId)
      .eq('to_user_id', user.id)
      .eq('status', 'pending') // Only update pending requests
      .select()
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ 
        error: 'Failed to update request',
        details: updateError.message 
      }, { status: 500 });
    }

    if (!request) {
      return NextResponse.json({ error: 'Request not found or already processed' }, { status: 400 });
    }

    // If accepted, create mutual friend relationships
    if (accept) {
      // Check if friendship already exists (prevent duplicates)
      const { data: existingFriendship } = await supabase
        .from('friends')
        .select('*')
        .or(`and(user_id.eq.${user.id},friend_id.eq.${request.from_user_id}),and(user_id.eq.${request.from_user_id},friend_id.eq.${user.id})`)
        .maybeSingle();

      if (existingFriendship) {
        // Friendship already exists, just return success
        return NextResponse.json({ success: true });
      }

      // Insert both directions for mutual friendship
      const { error: friendError } = await supabase
        .from('friends')
        .insert([
          { user_id: request.from_user_id, friend_id: user.id },
          { user_id: user.id, friend_id: request.from_user_id }
        ]);

      if (friendError) {
        // If friendship insert fails, revert the request status
        await supabase
          .from('friend_requests')
          .update({ status: 'pending' })
          .eq('id', requestId);
        
        return NextResponse.json({ 
          error: 'Failed to create friendship',
          details: friendError.message 
        }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
}

