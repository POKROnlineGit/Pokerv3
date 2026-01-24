'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@/lib/api/supabase/client';

interface UserProfileData {
  username: string | null;
  chips: number | null;
  isLoading: boolean;
}

const CACHE_KEY = 'userProfile_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CachedProfile {
  username: string | null;
  chips: number | null;
  userId: string | null;
  timestamp: number;
}

function getCachedProfile(): CachedProfile {
  if (typeof window === 'undefined') {
    return { username: null, chips: null, userId: null, timestamp: 0 };
  }
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedProfile;
      // Check if cache is less than 5 minutes old
      if (parsed.timestamp && Date.now() - parsed.timestamp < CACHE_TTL) {
        return parsed;
      }
    }
  } catch {
    // Ignore cache errors
  }
  return { username: null, chips: null, userId: null, timestamp: 0 };
}

function setCachedProfile(profile: Omit<CachedProfile, 'timestamp'>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        ...profile,
        timestamp: Date.now(),
      })
    );
  } catch {
    // Ignore cache errors
  }
}

function clearCachedProfile(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Ignore cache errors
  }
}

export function useUserProfile(): UserProfileData {
  const supabase = createClientComponentClient();

  // Initialize from cache to prevent flash
  const cached = getCachedProfile();
  const [username, setUsername] = useState<string | null>(cached.username);
  const [chips, setChips] = useState<number | null>(cached.chips);
  const [userId, setUserId] = useState<string | null>(cached.userId);
  const [isLoading, setIsLoading] = useState(!cached.username);

  // Fetch user profile
  useEffect(() => {
    const fetchProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setUsername(null);
        setChips(null);
        setUserId(null);
        setIsLoading(false);
        clearCachedProfile();
        return;
      }

      setUserId(user.id);

      // Fetch initial profile
      const { data, error } = await supabase
        .from('profiles')
        .select('username, chips')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        setIsLoading(false);
        return;
      }

      if (data) {
        setUsername(data.username);
        setChips(data.chips);
        setCachedProfile({
          username: data.username,
          chips: data.chips,
          userId: user.id,
        });
      }
      setIsLoading(false);
    };

    fetchProfile();

    // Subscribe to auth changes
    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange(() => {
      fetchProfile();
    });

    return () => {
      authSub.unsubscribe();
    };
  }, [supabase]);

  // Set up realtime subscription for profile updates
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`profile_updates_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new) {
            const newUsername = payload.new.username as string | undefined;
            const newChips = payload.new.chips as number | undefined;

            if (newUsername !== undefined) {
              setUsername(newUsername);
            }
            if (newChips !== undefined) {
              setChips(newChips);
            }

            // Update cache when profile changes
            const currentCached = getCachedProfile();
            setCachedProfile({
              username: newUsername !== undefined ? newUsername : currentCached.username,
              chips: newChips !== undefined ? newChips : currentCached.chips,
              userId: currentCached.userId,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  return { username, chips, isLoading };
}
