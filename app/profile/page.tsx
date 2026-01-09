'use client'

import { createClientComponentClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HandHistoryList } from "@/components/replay/HandHistoryList";
import { UserCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useIsMobile } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/providers/ThemeProvider";

export default function ProfilePage() {
  const isMobile = useIsMobile();
  const supabase = createClientComponentClient();
  const router = useRouter();
  const { currentTheme } = useTheme();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [hands, setHands] = useState<any[]>([]);
  const [stats, setStats] = useState<{
    hands_played: number;
    hands_won: number;
    vpip_count: number;
    pfr_count: number;
  }>({
    hands_played: 0,
    hands_won: 0,
    vpip_count: 0,
    pfr_count: 0,
  });

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
        router.push("/play/online");
        return;
      }

      setProfile(data);
      setLoading(false);
    };
    loadProfile();
  }, [supabase, router]);

  // Fetch Player Stats via RPC
  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      const { data, error } = await supabase.rpc("get_player_stats", {
        target_player_id: user.id,
      });

      if (error) {
        console.error("Error fetching player stats:", error);
        return;
      }

      if (data) {
        // Debug: Log the data to see what we're getting
        console.log("RPC Stats Data:", data);
        console.log("VPIP count type:", typeof data.vpip_count, "value:", data.vpip_count);
        console.log("PFR count type:", typeof data.pfr_count, "value:", data.pfr_count);
        
        // Handle potential boolean values or different field names
        const vpipValue = data.vpip_count !== undefined ? Number(data.vpip_count) : (data.vpip !== undefined ? Number(data.vpip) : 0);
        const pfrValue = data.pfr_count !== undefined ? Number(data.pfr_count) : (data.pfr !== undefined ? Number(data.pfr) : 0);
        
        setStats({
          hands_played: Number(data.hands_played) || 0,
          hands_won: Number(data.hands_won) || 0,
          vpip_count: vpipValue,
          pfr_count: pfrValue,
        });
      }
    };

    fetchStats();
  }, [user, supabase]);

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
          <div className={cn("container mx-auto py-6 max-w-7xl flex items-center justify-center min-h-screen", isMobile ? "px-4" : "px-14")}>
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

  return (
    <div className="min-h-screen relative">
      {/* --- SCROLLABLE CONTENT LAYER --- */}
      <div className="relative z-10">
        <div className={cn("container mx-auto py-6 max-w-7xl h-[calc(100vh-3rem)] flex flex-col", isMobile ? "px-4" : "px-14")}>
          <h1 className={cn("text-3xl font-bold mb-6", isMobile && "text-center")}>Profile</h1>
          {/* Profile Header */}
          <Card className="mb-6 bg-card backdrop-blur-sm border flex-shrink-0">
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
          <Tabs defaultValue="stats" className="w-full flex-1 flex flex-col min-h-0">
            <TabsList className="flex-shrink-0 w-fit">
              <TabsTrigger value="stats">Stats</TabsTrigger>
              <TabsTrigger value="hands">Hands</TabsTrigger>
            </TabsList>

            <TabsContent value="stats" className="space-y-4 mt-4 flex-shrink-0">
              {/* Stats Grid */}
              {(() => {
                // Calculate percentages
                const vpip = stats.hands_played > 0 ? (stats.vpip_count / stats.hands_played * 100) : 0;
                const pfr = stats.hands_played > 0 ? (stats.pfr_count / stats.hands_played * 100) : 0;

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="bg-card backdrop-blur-sm border">
                      <CardHeader>
                        <CardTitle className="text-lg">Hands Played / Hands Won</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-bold">
                          {stats.hands_played.toLocaleString()} / {stats.hands_won.toLocaleString()}
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="bg-card backdrop-blur-sm border">
                      <CardHeader>
                        <CardTitle className="text-lg">VPIP</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-bold">
                          {vpip.toFixed(1)}%
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="bg-card backdrop-blur-sm border">
                      <CardHeader>
                        <CardTitle className="text-lg">PFR</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-3xl font-bold">
                          {pfr.toFixed(1)}%
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="hands" className="mt-4 flex-1 flex flex-col min-h-0">
              {user ? (
                <HandHistoryList hands={hands} currentUserId={user.id} />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 space-y-3 text-center border rounded-lg bg-card text-muted-foreground">
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

