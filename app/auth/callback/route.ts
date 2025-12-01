import { createServerComponentClient } from "@/lib/supabaseClient";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = await createServerComponentClient();
    await supabase.auth.exchangeCodeForSession(code);

    // Create or update profile
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id, is_superuser")
        .eq("id", user.id)
        .single();

      if (!existingProfile) {
        await supabase.from("profiles").insert({
          id: user.id,
          username: user.email?.split("@")[0] || `user_${user.id.slice(0, 8)}`,
          chips: 10000,
          theme: "light",
          is_superuser: false,
          debug_mode: false,
        });
      }

      // Check if user is super user
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_superuser")
        .eq("id", user.id)
        .single();

      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || requestUrl.origin;

      if (!profile?.is_superuser) {
        // Not a super user, redirect to coming-soon with denied message
        return NextResponse.redirect(new URL("/coming-soon?denied=1", siteUrl));
      }

      // Super user, allow access
      return NextResponse.redirect(new URL("/play", siteUrl));
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || requestUrl.origin;
  return NextResponse.redirect(new URL("/coming-soon", siteUrl));
}
