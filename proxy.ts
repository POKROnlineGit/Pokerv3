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

  // Allow access to coming-soon and auth routes
  if (
    url.pathname.startsWith("/coming-soon") ||
    url.pathname.startsWith("/auth")
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

  // If not logged in, redirect to coming-soon
  if (!user) {
    return NextResponse.redirect(new URL("/coming-soon", request.url));
  }

  // If logged in, check if super user
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_superuser")
    .eq("id", user.id)
    .single();

  // Log error for debugging (only in production to help diagnose)
  if (profileError) {
    console.error("[Proxy] Profile query error:", profileError);
    // If we can't fetch the profile, deny access for security
    return NextResponse.redirect(new URL("/coming-soon", request.url));
  }

  // If profile doesn't exist or not super user, redirect to coming-soon
  if (!profile || !profile.is_superuser) {
    return NextResponse.redirect(new URL("/coming-soon", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

