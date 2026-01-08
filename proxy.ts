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

  // Allow access to auth routes
  if (url.pathname.startsWith("/auth")) {
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
    // If not logged in, redirect to sign in
    if (!user) {
      return NextResponse.redirect(new URL("/auth/signin", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
