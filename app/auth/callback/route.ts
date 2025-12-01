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
        .select("id")
        .eq("id", user.id)
        .single();

      if (!existingProfile) {
        await supabase.from("profiles").insert({
          id: user.id,
          username: user.email?.split("@")[0] || `user_${user.id.slice(0, 8)}`,
          chips: 10000,
          theme: "light",
        });
      }
    }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || requestUrl.origin;

  return NextResponse.redirect(new URL("/play", siteUrl));
}
