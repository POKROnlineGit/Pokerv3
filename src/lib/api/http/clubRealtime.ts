"use client";

import { useEffect, useState, useRef } from "react";
import { createClientComponentClient } from "@/lib/api/supabase/client";
import {
  ClubMessage,
  ClubMember,
} from "@/lib/types/club";
import { RealtimeChannel } from "@supabase/supabase-js";

interface ClubRealtimeOptions {
  onMessage?: (message: ClubMessage) => void;
  onMemberJoined?: (member: ClubMember) => void;
  onMemberLeft?: (userId: string) => void;
  onClubDeleted?: () => void;
}

/**
 * Hook to subscribe to club real-time events via Supabase Realtime
 * Replaces socket-based useClubEvents
 */
export function useClubRealtime(clubId?: string, options?: ClubRealtimeOptions) {
  const supabase = createClientComponentClient();
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [disbanded, setDisbanded] = useState(false);

  const { onMessage, onMemberJoined, onMemberLeft, onClubDeleted } = options || {};

  // Use refs to store callbacks to avoid re-subscribing when callbacks change
  const onMessageRef = useRef<ClubRealtimeOptions['onMessage']>(onMessage);
  const onMemberJoinedRef = useRef<ClubRealtimeOptions['onMemberJoined']>(onMemberJoined);
  const onMemberLeftRef = useRef<ClubRealtimeOptions['onMemberLeft']>(onMemberLeft);
  const onClubDeletedRef = useRef<ClubRealtimeOptions['onClubDeleted']>(onClubDeleted);

  // Update refs when callbacks change (doesn't trigger re-subscription)
  useEffect(() => {
    onMessageRef.current = onMessage;
    onMemberJoinedRef.current = onMemberJoined;
    onMemberLeftRef.current = onMemberLeft;
    onClubDeletedRef.current = onClubDeleted;
  });

  useEffect(() => {
    if (!clubId) return;

    let messagesChannel: RealtimeChannel | null = null;
    let membersChannel: RealtimeChannel | null = null;
    let clubChannel: RealtimeChannel | null = null;

    // Subscribe to new messages
    messagesChannel = supabase
      .channel(`club-messages-${clubId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "club_messages",
          filter: `club_id=eq.${clubId}`,
        },
        async (payload) => {
          const newMessage = payload.new as ClubMessage;

          // Fetch the username for this message
          const { data: profile } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", newMessage.user_id)
            .single();

          const messageWithProfile = {
            ...newMessage,
            profiles: profile || { username: "Unknown" },
          };

          onMessageRef.current?.(messageWithProfile);
        }
      )
      .subscribe();

    // Subscribe to member changes (joins/leaves)
    membersChannel = supabase
      .channel(`club-members-${clubId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "club_members",
          filter: `club_id=eq.${clubId}`,
        },
        async (payload) => {
          const newMember = payload.new as ClubMember;

          // Fetch username
          const { data: profile } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", newMember.user_id)
            .single();

          const memberWithProfile = {
            ...newMember,
            profiles: profile || { username: "Unknown" },
          };

          onMemberJoinedRef.current?.(memberWithProfile);

          // Update member count
          const { count } = await supabase
            .from("club_members")
            .select("*", { count: "exact", head: true })
            .eq("club_id", clubId);

          setMemberCount(count);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "club_members",
          filter: `club_id=eq.${clubId}`,
        },
        async (payload) => {
          const oldMember = payload.old as { user_id?: string };
          if (oldMember.user_id) {
            onMemberLeftRef.current?.(oldMember.user_id);
          }

          // Update member count
          const { count } = await supabase
            .from("club_members")
            .select("*", { count: "exact", head: true })
            .eq("club_id", clubId);

          setMemberCount(count);
        }
      )
      .subscribe();

    // Subscribe to club deletion
    clubChannel = supabase
      .channel(`club-${clubId}`)
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "clubs",
          filter: `id=eq.${clubId}`,
        },
        () => {
          setDisbanded(true);
          onClubDeletedRef.current?.();
        }
      )
      .subscribe();

    // Cleanup subscriptions on unmount
    return () => {
      if (messagesChannel) {
        supabase.removeChannel(messagesChannel);
      }
      if (membersChannel) {
        supabase.removeChannel(membersChannel);
      }
      if (clubChannel) {
        supabase.removeChannel(clubChannel);
      }
    };
  }, [clubId, supabase]);

  return {
    memberCount,
    disbanded,
  };
}
