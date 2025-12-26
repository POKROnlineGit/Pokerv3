'use client'

import { createClientComponentClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HandHistoryList } from "@/components/replay/HandHistoryList";
import { UserCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/providers/ThemeProvider";

export default function ProfilePage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const { currentTheme } = useTheme();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [hands, setHands] = useState<any[]>([]);

  // Get theme colors
  const primaryColor = currentTheme.colors.primary[0];
  const gradientColors = currentTheme.colors.gradient;
  const centerColor = currentTheme.colors.primary[2] || currentTheme.colors.primary[1];

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/signin");
        return;
      }

      setUser(user);

      const { data, error } = await supabase
        .from("profiles")
        .select("username, chips, created_at")
        .eq("id", user.id)
        .single();

      if (error || !data) {
        router.push("/play");
        return;
      }

      setProfile(data);
      setLoading(false);
    };
    loadProfile();
  }, [supabase, router]);

  // Fetch Hand History (Client-Side)
  // The RLS policy on 'hand_histories' automatically ensures users only see their own hands.
  useEffect(() => {
    if (!user) return;

    const fetchHands = async () => {
      const { data, error } = await supabase
        .from("hand_histories")
        .select("id, game_id, hand_index, final_pot, winner_id, played_at, replay_data, player_manifest, config")
        .order("played_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Error fetching hand history:", error);
        return;
      }

      setHands(data || []);
    };

    fetchHands();
  }, [user, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen relative">
        <div className="relative z-10">
          <div className="container mx-auto p-6 max-w-4xl flex items-center justify-center min-h-screen">
            <div className="text-white">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  const joinDate = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Unknown";

  // Placeholder stats (to be replaced with real data later)
  const stats = {
    handsPlayed: 0,
    winRate: "0%",
    biggestPotWon: 0,
    bestHand: "N/A",
  };

  // Placeholder recent games (to be replaced with real data later)
  const recentGames: Array<{
    id: string;
    date: string;
    result: string;
    chips: number;
  }> = [];

  return (
    <div className="min-h-screen relative">
      {/* --- SCROLLABLE CONTENT LAYER --- */}
      <div className="relative z-10">
        <div className="container mx-auto p-6 max-w-4xl">
          <h1 className="text-3xl font-bold mb-6">Profile</h1>
          {/* Profile Header */}
          <Card className="mb-6 bg-card">
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="p-4 bg-primary/10 rounded-full">
                  <UserCircle className="h-16 w-16 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-3xl mb-2">{profile.username}</CardTitle>
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <div>
                      <span className="text-sm">Total Chips: </span>
                      <span className="text-lg font-semibold text-foreground">
                        {profile.chips.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm">Member Since: </span>
                      <span className="text-lg font-semibold text-foreground">
                        {joinDate}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Tabs */}
          <Tabs defaultValue="stats" className="w-full">
            <TabsList>
              <TabsTrigger value="stats">Stats</TabsTrigger>
              <TabsTrigger value="hands">Hands</TabsTrigger>
            </TabsList>

            <TabsContent value="stats" className="space-y-4 mt-4">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg">Hands Played</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{stats.handsPlayed.toLocaleString()}</p>
                  </CardContent>
                </Card>

                <Card className="bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg">Win Rate</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{stats.winRate}</p>
                  </CardContent>
                </Card>

                <Card className="bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg">Biggest Pot Won</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">
                      {stats.biggestPotWon.toLocaleString()} chips
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg">Best Hand</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{stats.bestHand}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Games */}
              <Card className="bg-card">
                <CardHeader>
                  <CardTitle>Recent Games</CardTitle>
                </CardHeader>
                <CardContent>
                  {recentGames.length > 0 ? (
                    <div className="space-y-2">
                      {recentGames.map((game) => (
                        <div
                          key={game.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                        >
                          <div>
                            <p className="font-medium">{game.date}</p>
                            <p className="text-sm text-muted-foreground">{game.result}</p>
                          </div>
                          <p className="font-semibold">
                            {game.chips > 0 ? "+" : ""}
                            {game.chips.toLocaleString()} chips
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      No recent games. Start playing to see your game history!
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="hands" className="mt-4">
              {user ? (
                <HandHistoryList hands={hands} currentUserId={user.id} />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 space-y-3 text-center border rounded-lg bg-card/50 text-muted-foreground">
                  <p className="text-lg font-medium">Loading...</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

