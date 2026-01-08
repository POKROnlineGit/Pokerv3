import type { Metadata } from "next";
import { Inter, Oswald } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { createServerComponentClient } from "@/lib/supabaseClient";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { GameRedirectProvider } from "@/components/GameRedirectProvider";
import { QueueProvider } from "@/components/providers/QueueProvider";
import { StatusProvider } from "@/components/providers/StatusProvider";
import { StatusOverlay } from "@/components/ui/StatusOverlay";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ThemeBackground } from "@/components/ThemeBackground";

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
// Make sure NEXT_PUBLIC_APP_URL is set in your .env.local / Vercel settings
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://pokronline.com";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "POKROnline - Learn & Play Poker",
    template: "%s | Pokr",
  },
  description:
    "Join POKROnline for fast-paced, real-time Texas Holdem action. Suitable for players of all skill levels. Learn the rules, practice with curated puzzles, and play online to test your skill. No download required.",
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
  applicationName: "POKROnline",
  authors: [{ name: "POKROnline Team" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: BASE_URL,
    siteName: "POKROnline",
    title: "POKROnline - Learn & Play Poker",
    description: "Play Texas Holdem instantly in your browser.",
    images: [
      {
        url: `${BASE_URL}/icon.png`,
        width: 512,
        height: 512,
        alt: "POKROnline Logo",
      },
    ],
  },
  icons: {
    icon: [
      // Google prefers PNG for search results
      { url: "/icon.png", type: "image/png", sizes: "any" },
      { url: "/icon.ico", sizes: "any" },
      { url: "/logo/POKROnlineLogoSVG.svg", type: "image/svg+xml" },
    ],
    shortcut: "/icon.png",
    apple: "/icon.png",
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

  // Get user theme preference - default to dark
  let theme = "dark";

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("theme")
      .eq("id", user.id)
      .single();
    if (profile?.theme === "light" || profile?.theme === "dark") {
      theme = profile.theme;
    }
  }

  // Show sidebar for all users (persistent sidebar)
  const showSidebar = true;

  return (
    <html lang="en" className={theme} suppressHydrationWarning>
      <head>
        {/* Structure Data for Rich Snippets (VideoGame Schema) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "VideoGame",
              name: "POKROnline",
              genre: [
                "Card Game",
                "Poker",
                "Casino Game",
                "Learn Poker",
                "Game Theory",
              ],
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
        <ThemeProvider>
          <ThemeBackground />
          <GameRedirectProvider />
          <StatusProvider>
            <QueueProvider>
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
            </QueueProvider>
          </StatusProvider>
        </ThemeProvider>
        <GoogleAnalytics gaId="G-TP41LB8QH9" />
      </body>
    </html>
  );
}
