import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Use getUser() to authenticate the session with Supabase Auth server
  // This is more secure than getSession() which only reads from storage
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl;

  // Allow access to auth routes (signin, signup, callback, verify-email, finish-profile)
  if (
    url.pathname === "/signin" ||
    url.pathname === "/signup" ||
    url.pathname === "/callback" ||
    url.pathname === "/verify-email" ||
    url.pathname === "/finish-profile"
  ) {
    return response;
  }

  // Allow access to static files and API routes
  if (
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/favicon.ico") ||
    url.pathname.match(/\.(ico|png|jpg|jpeg|svg|gif|webp)$/)
  ) {
    return response;
  }

  // Public routes - accessible without authentication
  if (
    url.pathname === "/" ||
    url.pathname.startsWith("/learn") ||
    url.pathname.startsWith("/tools")
  ) {
    return response;
  }

  // Protected routes - require authentication
  if (
    url.pathname.startsWith("/play") ||
    url.pathname.startsWith("/profile") ||
    url.pathname.startsWith("/settings") ||
    url.pathname.startsWith("/friends")
  ) {
    // If not logged in, redirect to sign in with next parameter
    if (!user) {
      const signInUrl = new URL("/signin", request.url);
      signInUrl.searchParams.set("next", url.pathname);
      return NextResponse.redirect(signInUrl);
    }

    // Check if user has a username (unless already on finish-profile page)
    if (url.pathname !== "/finish-profile") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single();

      // If username is null or empty, redirect to finish-profile page
      if (!profile?.username || profile.username.trim() === "") {
        const finishProfileUrl = new URL("/finish-profile", request.url);
        finishProfileUrl.searchParams.set("next", url.pathname);
        return NextResponse.redirect(finishProfileUrl);
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
