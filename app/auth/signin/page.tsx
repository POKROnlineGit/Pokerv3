"use client";

import React, { useState, useEffect } from "react";
import { createClientComponentClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { ThemeBackground } from "@/components/ThemeBackground";
import Image from "next/image";

export default function SignInPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentTheme } = useTheme();
  const supabase = createClientComponentClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  
  // Redirect to signup if view=sign_up query param is present
  useEffect(() => {
    if (searchParams.get("view") === "sign_up") {
      router.replace("/auth/signup");
    }
  }, [searchParams, router]);

  // Redirect if already signed in
  useEffect(() => {
    let mounted = true;

    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted) {
        setCheckingAuth(false);
        if (user) {
          router.replace("/play");
          return;
        }
      }
    };

    checkAuth();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted && session?.user) {
        router.replace("/play");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, router]);

  // Get theme colors
  const primaryColor = currentTheme.colors.primary[0];
  const accentColor = currentTheme.colors.accent[0];

  const handleGoogleSignIn = async () => {
    setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      router.refresh();
      router.push('/play');
    } catch (err: any) {
      setError(err.message || "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  // Don't render if checking auth or if user is authenticated (will redirect)
  if (checkingAuth) {
    return (
      <div className="min-h-screen relative flex items-center justify-center p-4">
        <ThemeBackground />
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: currentTheme.colors.accent[0] }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      <ThemeBackground />
      
      <Card className="w-full max-w-md relative z-10 bg-card border-border">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex items-center justify-center">
            <Image
              src="/logo/POKROnlineLogoSVG.svg"
              alt="POKROnline"
              width={64}
              height={64}
              className="h-16 w-16 object-contain"
              priority
            />
      </div>
          <CardTitle className="text-2xl font-bold">Sign In</CardTitle>
          <CardDescription>Welcome back to the table</CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <div 
              className="mb-4 p-3 rounded text-sm text-center border"
              style={{
                backgroundColor: `${accentColor}20`,
                borderColor: accentColor,
                color: accentColor,
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
              <Button 
                type="submit" 
              className="w-full" 
                disabled={loading}
                style={{
                  backgroundColor: accentColor,
                  color: 'white',
                }}
                onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = currentTheme.colors.accent[1] || accentColor;
                }}
                onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = accentColor;
                }}
              >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Sign In"}
              </Button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full h-12 text-base"
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{
              borderColor: accentColor,
              color: accentColor,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = accentColor;
              e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = accentColor;
            }}
          >
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </Button>
        </CardContent>

        <CardFooter className="justify-center">
          <div className="text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link 
              href="/auth/signup" 
              className="hover:underline"
              style={{ color: accentColor }}
            >
              Sign Up
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
