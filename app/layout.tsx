import type { Metadata } from "next";
import { Inter, Oswald } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { createServerComponentClient } from "@/lib/api/supabase/client";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { GameRedirectProvider } from "@/components/layout/GameRedirectProvider";
import { ActiveStatusProvider } from "@/components/providers/ActiveStatusProvider";
import { StatusProvider } from "@/components/providers/StatusProvider";
import { StatusOverlay } from "@/components/ui/StatusOverlay";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { ThemeBackground } from "@/components/theme/ThemeBackground";
import {
  PREFERENCE_REGISTRY,
  getPreferenceColumns,
  generateAllCSSVars,
  generateCSSVarsScript,
} from "@/lib/features/preferences";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});
const oswald = Oswald({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-oswald",
});

// 1. Define the Base URL
// Make sure NEXT_PUBLIC_SITE_URL is set in your .env.local / Vercel settings
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://pokronline.com";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "PokrOnline - Learn & Play Poker",
    template: "%s | PokrOnline",
  },
  description:
    "Join PokrOnline for fast-paced, real-time Texas Holdem action. Suitable for players of all skill levels. Learn the rules, practice with curated puzzles, and play online to test your skill. No download required.",
  keywords: [
    "poker",
    "pokr",
    "texas holdem",
    "online poker",
    "multiplayer card game",
    "poker bots",
    "web poker",
    "learn poker",
    "gto",
    "game theory optimal",
    "poker strategy",
    "poker training",
    "poker practice",
    "poker lessons",
    "poker tips",
    "poker tricks",
    "poker secrets",
  ],
  applicationName: "PokrOnline",
  authors: [{ name: "PokrOnline Team" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: BASE_URL,
    siteName: "PokrOnline",
    title: "PokrOnline - Learn & Play Poker",
    description: "Play Texas Holdem instantly in your browser.",
    images: [
      {
        url: `https://pokronline.com/icon.png`,
        width: 512,
        height: 512,
        alt: "PokrOnline Logo",
      },
    ],
  },
  icons: {
    icon: [
      // Google prefers PNG for search results
      {
        url: `https://pokronline.com/icon.png`,
        type: "image/png",
        sizes: "any",
      },
      { url: `https://pokronline.com/favicon.ico`, sizes: "any" },
    ],
    shortcut: `https://pokronline.com/icon.png`,
    apple: `https://pokronline.com/icon.png`,
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerComponentClient();

  // Use getUser() to authenticate the session with Supabase Auth server
  // This is more secure than getSession() which only reads from storage
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch all preferences in one query using the registry
  const columns = getPreferenceColumns().join(", ");
  let profile: { theme?: string; color_theme?: string } | null = null;

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select(columns)
      .eq("id", user.id)
      .single();
    if (data && typeof data === 'object' && !('error' in data)) {
      profile = data as { theme?: string; color_theme?: string };
    }
  }

  // Build preferences object with defaults from registry
  const preferences = {
    mode: (profile?.theme as 'light' | 'dark') ?? PREFERENCE_REGISTRY.mode.defaultValue,
    colorTheme: (profile?.color_theme as string) ?? PREFERENCE_REGISTRY.colorTheme.defaultValue,
  };

  // Validate mode
  if (preferences.mode !== 'light' && preferences.mode !== 'dark') {
    preferences.mode = PREFERENCE_REGISTRY.mode.defaultValue;
  }

  // Generate CSS vars and script for SSR
  const cssVars = generateAllCSSVars(preferences);
  const cssVarsScript = generateCSSVarsScript(cssVars);

  // Show sidebar for all users (persistent sidebar)
  const showSidebar = true;

  return (
    <html lang="en" className={preferences.mode === 'dark' ? 'dark' : ''} suppressHydrationWarning>
      <head>
        {/* Blocking script to set CSS vars before paint - prevents FOUC */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var s=document.documentElement.style;${cssVarsScript}})();`,
          }}
        />
        {/* Structure Data for Rich Snippets (VideoGame Schema) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "VideoGame",
              name: "PokrOnline",
              genre: ["Card Game", "Poker", "Learn Poker", "Game Theory"],
              description:
                "A platform to learn the rules of poker, develop your skills with puzzles and lessons, and play online with our beautiful interface.",
              applicationCategory: "Game",
              operatingSystem: "Any",
              playMode: "MultiPlayer",
              url: BASE_URL,
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
              },
            }),
          }}
        />
      </head>
      <body className={inter.className}>
        <PreferencesProvider initialPreferences={preferences}>
          <ThemeBackground />
          <GameRedirectProvider />
          <StatusProvider>
            <ActiveStatusProvider>
              <ToastProvider>
                {showSidebar ? (
                  <div className="flex h-screen">
                    <Sidebar />
                    <main className="flex-1 overflow-auto">{children}</main>
                  </div>
                ) : (
                  <main>{children}</main>
                )}
                <StatusOverlay />
              </ToastProvider>
            </ActiveStatusProvider>
          </StatusProvider>
        </PreferencesProvider>
        <GoogleAnalytics gaId="G-TP41LB8QH9" />
      </body>
    </html>
  );
}
