import { createServerComponentClient } from '@/lib/api/supabase/client';
import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/utils';

export async function POST(req: Request) {
  try {
    const { friendId } = await req.json();

    if (!friendId) {
      return NextResponse.json({ error: 'Friend ID required' }, { status: 400 });
    }

    const supabase = await createServerComponentClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.id === friendId) {
      return NextResponse.json({ error: 'Cannot send friend request to yourself' }, { status: 400 });
    }

    // Check if already friends
    const { data: existingFriend } = await supabase
      .from('friends')
      .select('*')
      .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)
      .single();

    if (existingFriend) {
      return NextResponse.json({ error: 'Already friends' }, { status: 400 });
    }

    // Check if request already exists
    const { data: existingRequest } = await supabase
      .from('friend_requests')
      .select('*')
      .or(`and(from_user_id.eq.${user.id},to_user_id.eq.${friendId}),and(from_user_id.eq.${friendId},to_user_id.eq.${user.id})`)
      .eq('status', 'pending')
      .single();

    if (existingRequest) {
      return NextResponse.json({ error: 'Friend request already exists' }, { status: 400 });
    }

    const { error } = await supabase
      .from('friend_requests')
      .insert({
        from_user_id: user.id,
        to_user_id: friendId,
        status: 'pending'
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

