"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, CheckCircle2 } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { ThemeBackground } from "@/components/theme/ThemeBackground";
import Image from "next/image";
import Link from "next/link";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get("email");
  const { currentTheme } = useTheme();
  const accentColor = currentTheme.colors.accent[0];

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
            <Mail
              className="h-12 w-12"
              style={{ color: accentColor }}
            />
          </div>
          <CardTitle className="text-2xl font-bold">Check Your Email</CardTitle>
          <CardDescription>
            We've sent a verification link to your email address
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {email && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">
                Verification email sent to:
              </p>
              <p className="font-medium">{email}</p>
            </div>
          )}

          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Next steps:</strong>
            </p>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Check your inbox for the verification email</li>
              <li>Click the verification link in the email</li>
              <li>You'll be redirected back to complete your signup</li>
            </ol>
          </div>

          <div className="pt-4">
            <Button
              className="w-full text-white"
              style={{
                backgroundColor: accentColor,
              }}
              onClick={() => router.push("/signin")}
            >
              Back to Sign In
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
