import type { Metadata } from "next";
import { Inter, Oswald } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { createServerComponentClient } from "@/lib/supabaseClient";
import { ToastProvider } from "@/components/ToastProvider";
import { GameRedirectProvider } from "@/components/GameRedirectProvider";
import { QueueProvider } from "@/components/providers/QueueProvider";

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter",
});
const oswald = Oswald({ 
  subsets: ["latin"],
  weight: "700",
  variable: "--font-oswald",
});

export const metadata: Metadata = {
  title: "POKROnline - Learn & Play Texas Hold'em",
  description: "Play and learn No-Limit Texas Hold'em poker for free",
  icons: {
    icon: "/logo/POKROnlineLogoSVG.svg",
    shortcut: "/logo/POKROnlineLogoSVG.svg",
    apple: "/logo/POKROnlineLogoSVG.svg",
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

  // Get user theme preference and check super user status
  let theme = "light";
  let isSuperUser = false;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("theme, is_superuser")
      .eq("id", user.id)
      .single();
    if (profile?.theme) {
      theme = profile.theme;
    }
    isSuperUser = profile?.is_superuser || false;
  }

  // Only show sidebar for authenticated super users
  // This ensures sidebar is hidden when:
  // - User is logged out (user is null)
  // - User is not a super user (isSuperUser is false)
  const showSidebar = Boolean(user && isSuperUser);

  return (
    <html lang="en" className={theme}>
      <body className={inter.className}>
        <GameRedirectProvider />
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
          </ToastProvider>
        </QueueProvider>
      </body>
    </html>
  );
}
