"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/api/supabase/client";
import { PreflopStatsPage } from "@/components/features/preflopStats";

export default function PreflopStatsRoute() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/signin");
        return;
      }

      setUserId(user.id);
      setLoading(false);
    };

    checkAuth();
  }, [supabase, router]);

  if (loading || !userId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return <PreflopStatsPage userId={userId} />;
}
