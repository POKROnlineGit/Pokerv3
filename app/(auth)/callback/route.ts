import { createServerClient } from "@/lib/api/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/play";

  if (code) {
    const supabase = await createServerClient();
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
          // Get username from user metadata (set during signup) or fallback to email prefix
          const username = user.user_metadata?.username || user.email?.split("@")[0] || `user_${user.id.slice(0, 8)}`;
          
          await supabase.from("profiles").insert({
            id: user.id,
            username: username,
            chips: 10000,
            theme: "dark",
            is_superuser: false,
            debug_mode: false,
            deck_preference: "standard",
          });
        }

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || requestUrl.origin;
        // Redirect authenticated users to the specified return URL
        return NextResponse.redirect(new URL(next, siteUrl));
      }
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || requestUrl.origin;
    return NextResponse.redirect(new URL("/", siteUrl));
}
