"use client";

import React, { useEffect, useState } from "react";
import { PokerTable } from "@/components/game/PokerTable";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTheme } from "@/components/providers/ThemeProvider";
import { createClientComponentClient } from "@/lib/supabaseClient";

// A minimal dummy state to render an empty table
const AMBIENT_GAME_STATE: any = {
  id: "ambient",
  status: "WAITING",
  players: [],
  communityCards: [],
  pot: 0,
  dealerSeat: 0,
  currentRound: "PREFLOP",
  turnTimer: null,
  actions: [],
};

interface PlayLayoutProps {
  children: React.ReactNode;
  title?: string;
  footer?: React.ReactNode;
  tableContent?: React.ReactNode;
  actionPopup?: React.ReactNode; // Separate prop for ActionPopup to render outside stacking context
}

export function PlayLayout({
  children,
  title,
  footer,
  tableContent,
  actionPopup,
}: PlayLayoutProps) {
  const { currentTheme } = useTheme();
  const supabase = createClientComponentClient();

  // Initialize from cache to prevent flash
  const getCachedProfile = () => {
    if (typeof window === "undefined")
      return { username: null, chips: null, userId: null };
    try {
      const cached = localStorage.getItem("playLayout_profile");
      if (cached) {
        const parsed = JSON.parse(cached);
        // Check if cache is less than 5 minutes old
        if (parsed.timestamp && Date.now() - parsed.timestamp < 5 * 60 * 1000) {
          return parsed;
        }
      }
    } catch (e) {
      // Ignore cache errors
    }
    return { username: null, chips: null, userId: null };
  };

  const cached = getCachedProfile();
  const [username, setUsername] = useState<string | null>(cached.username);
  const [chips, setChips] = useState<number | null>(cached.chips);
  const [userId, setUserId] = useState<string | null>(cached.userId);

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
        // Clear cache on logout
        if (typeof window !== "undefined") {
          try {
            localStorage.removeItem("playLayout_profile");
          } catch (e) {
            // Ignore cache errors
          }
        }
        return;
      }

      setUserId(user.id);

      // Fetch initial profile
      const { data, error } = await supabase
        .from("profiles")
        .select("username, chips")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
        return;
      }

      if (data) {
        setUsername(data.username);
        setChips(data.chips);

        // Cache the profile data
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(
              "playLayout_profile",
              JSON.stringify({
                username: data.username,
                chips: data.chips,
                userId: user.id,
                timestamp: Date.now(),
              })
            );
          } catch (e) {
            // Ignore cache errors
          }
        }
      }
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
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new) {
            if (payload.new.username !== undefined) {
              setUsername(payload.new.username);
            }
            if (payload.new.chips !== undefined) {
              setChips(payload.new.chips);
            }

            // Update cache when profile changes
            if (typeof window !== "undefined") {
              try {
                const cached = localStorage.getItem("playLayout_profile");
                if (cached) {
                  const parsed = JSON.parse(cached);
                  localStorage.setItem(
                    "playLayout_profile",
                    JSON.stringify({
                      username:
                        payload.new.username !== undefined
                          ? payload.new.username
                          : parsed.username,
                      chips:
                        payload.new.chips !== undefined
                          ? payload.new.chips
                          : parsed.chips,
                      userId: parsed.userId,
                      timestamp: Date.now(),
                    })
                  );
                }
              } catch (e) {
                // Ignore cache errors
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  return (
    <div
      className="relative w-full h-screen overflow-hidden"
      style={{
        backgroundColor: currentTheme.colors.background,
        isolation: "isolate",
      }}
    >
      <div className="w-full h-full relative flex py-6">
        {/* Center: Poker Table - Centered between sidebar and matchmaking card */}
        <div
          className="flex-1 flex items-center justify-center relative min-w-0"
          style={{ zIndex: 1 }}
        >
          {tableContent ? (
            /* Active Game Mode: Render the provided table content */
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ zIndex: 1 }}
            >
              {tableContent}
            </div>
          ) : (
            /* Menu Mode: Render ambient background table */
            <div className="pointer-events-none w-full h-full flex items-center justify-center">
              <PokerTable
                gameState={AMBIENT_GAME_STATE}
                currentUserId="ambient-user"
                isHeadsUp={false}
              />
            </div>
          )}
        </div>

        {/* Right: Matchmaking Card - Fixed width */}
        <div
          className="flex items-center justify-center z-10 flex-shrink-0 w-[280px] pr-4"
          style={{ zIndex: 10 }}
        >
          <Card className="w-full h-[calc(100vh-14rem)] my-32 rounded-lg text-card-foreground shadow-sm bg-card backdrop-blur-sm border flex flex-col transition-none">
            {title && (
              <CardHeader className="flex-shrink-0 border-b py-2 rounded-t-lg transition-none">
                <CardTitle className="text-2xl font-bold text-white tracking-tight text-center transition-none">
                  {title}
                </CardTitle>
              </CardHeader>
            )}

            <ScrollArea className="flex-1 min-h-0 transition-none">
              <CardContent className="p-3 transition-none">
                {children}
              </CardContent>
            </ScrollArea>

            {/* Footer Section - Optional, renders above profile */}
            {footer && (
              <div className="flex-shrink-0 px-3 pt-2 pb-2 transition-none">
                {footer}
              </div>
            )}

            {/* Profile Section - Always rendered to prevent layout shift */}
            <div className="flex-shrink-0 border-t p-2 min-h-[3rem] rounded-b-lg transition-none">
              {username ? (
                <div className="space-y-1">
                  <div className="text-base font-medium text-white">
                    {username}
                  </div>
                  <div className="text-sm text-slate-400">
                    {chips !== null ? `${chips.toLocaleString()} chips` : "—"}
                  </div>
                </div>
              ) : (
                <div className="space-y-1 opacity-0">
                  <div className="text-base font-medium">Placeholder</div>
                  <div className="text-sm">Placeholder</div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Action Popup - Rendered outside stacking context to ensure it's always clickable */}
      {actionPopup}
    </div>
  );
}
