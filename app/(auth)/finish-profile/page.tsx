"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/api/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, User } from "lucide-react";
import { useTheme } from "@/components/providers/PreferencesProvider";
import { ThemeBackground } from "@/components/theme/ThemeBackground";
import Image from "next/image";
import { Filter } from "bad-words";
import { getErrorMessage } from "@/lib/utils";

export default function FinishProfilePage() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const router = useRouter();
  const supabase = createClientComponentClient();
  const { currentTheme } = useTheme();

  // Initialize profanity filter
  const filter = new Filter();

  // Check authentication and redirect if not authenticated
  useEffect(() => {
    let mounted = true;

    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (mounted) {
        setCheckingAuth(false);
        if (!user) {
          router.replace("/signin");
          return;
        }
      }
    };

    checkAuth();

    return () => {
      mounted = false;
    };
  }, [supabase, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Not authenticated. Please sign in.");
        setLoading(false);
        return;
      }

      // Sanitize username (trim but preserve case)
      const cleanUsername = username.trim();

      // 1. Profanity Check (check lowercase version for profanity)
      if (filter.isProfane(cleanUsername.toLowerCase())) {
        setError("Please choose an appropriate username.");
        setLoading(false);
        return;
      }

      // 2. Length & Format Check (5-15 chars, allow uppercase and lowercase)
      const usernameRegex = /^[a-zA-Z0-9_]{5,15}$/;
      if (!usernameRegex.test(cleanUsername)) {
        if (cleanUsername.length < 5) {
          setError("Username must be at least 5 characters.");
        } else if (cleanUsername.length > 15) {
          setError("Username must be no more than 15 characters.");
        } else {
          setError(
            "Username must contain only letters, numbers, and underscores."
          );
        }
        setLoading(false);
        return;
      }

      // 3. Check username uniqueness (case-insensitive)
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", cleanUsername)
        .neq("id", user.id)
        .single();

      if (existing) {
        setError("This username is already taken. Please choose another.");
        setLoading(false);
        return;
      }

      // 4. Check if profile exists, then INSERT or UPDATE accordingly
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .single();

      if (existingProfile) {
        // Profile exists, update it
        const { error: updateError, data: updateData } = await supabase
          .from("profiles")
          .update({ username: cleanUsername })
          .eq("id", user.id)
          .select();

        if (updateError) throw updateError;

        // Verify the update actually affected a row
        if (!updateData || updateData.length === 0) {
          throw new Error("Failed to update username. Profile may not exist.");
        }
      } else {
        // Profile doesn't exist, insert it
        const { error: insertError } = await supabase.from("profiles").insert({
          id: user.id,
          username: cleanUsername,
          chips: 10000,
          theme: "dark",
          is_superuser: false,
          debug_mode: false,
        });

        if (insertError) throw insertError;
      }

      // Success - redirect to home
      setLoading(false);
      router.push("/");
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Failed to update username. Please try again.");
      setLoading(false);
    }
  };

  // Don't render if checking auth
  if (checkingAuth) {
    return (
      <div className="min-h-screen relative flex items-center justify-center p-4">
        <ThemeBackground />
        <div className="flex items-center justify-center">
          <Loader2
            className="h-8 w-8 animate-spin"
            style={{ color: 'var(--theme-accent-0)' }}
          />
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
          <div className="mx-auto mb-4 flex items-center justify-center">
            <User className="h-12 w-12" style={{ color: 'var(--theme-accent-0)' }} />
          </div>
          <CardTitle className="text-2xl font-bold">
            Choose Your Username
          </CardTitle>
          <CardDescription>
            Pick a unique username to complete your profile
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <div
              className="mb-4 p-3 rounded text-sm text-center border"
              style={{
                backgroundColor: 'var(--theme-accent-0-20)',
                borderColor: 'var(--theme-accent-0)',
                color: 'var(--theme-accent-0)',
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                placeholder="PokerPro99"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={loading}
                minLength={5}
                maxLength={15}
                pattern="[a-zA-Z0-9_]{5,15}"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                5-15 characters (letters, numbers, and underscores only)
              </p>
            </div>

            <Button
              type="submit"
              className="w-full text-white"
              disabled={loading}
              style={{
                backgroundColor: 'var(--theme-accent-0)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--theme-accent-1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--theme-accent-0)';
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                "Complete Profile"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
