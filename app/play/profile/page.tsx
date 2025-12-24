'use client'

import { createClientComponentClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/providers/ThemeProvider";

export default function ProfilePage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const { currentTheme } = useTheme();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-black relative">
        <div className="container mx-auto max-w-4xl p-6 flex items-center justify-center min-h-screen">
          <div className="text-white">Loading...</div>
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
    <div className="min-h-screen bg-black relative">
      {/* --- SCROLLABLE CONTENT LAYER --- */}
      <div className="relative z-10">
        <div className="p-6">
        <div className="container mx-auto max-w-4xl">
          {/* Header Section */}
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

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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
        </div>
      </div>
      </div>
    </div>
  );
}

