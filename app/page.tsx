import { createServerComponentClient } from "@/lib/api/supabase/client";
import { Dashboard } from "@/components/features/dashboard";
import { LandingPage } from "@/components/features/landing";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, chips")
      .eq("id", user.id)
      .single();

    return <Dashboard initialProfile={profile} />;
  }

  return <LandingPage />;
}
