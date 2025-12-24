"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Play,
  BookOpen,
  Settings,
  LogOut,
  Users,
  UserCircle,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClientComponentClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/components/providers/ThemeProvider";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClientComponentClient();
  const { currentTheme } = useTheme();
  const [pendingCount, setPendingCount] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<{
    username: string;
    chips: number;
    created_at: string;
  } | null>(null);

  // Get theme colors for sidebar elements (not background)
  const primaryColor = currentTheme.colors.primary[0];
  const accentColor = currentTheme.colors.accent[0];

  // Detect if we're on a game page
  const isGamePage = pathname?.match(/^\/play\/(game|local)\/[^/]+$/) !== null;

  // Minimized state: default to true on game pages, false otherwise
  const [isMinimized, setIsMinimized] = useState(isGamePage);

  // Update minimized state when route changes to/from game page
  useEffect(() => {
    setIsMinimized(isGamePage);
  }, [isGamePage]);

  const toggleSidebar = () => {
    setIsMinimized((prev) => !prev);
  };

  useEffect(() => {
    // Get current user
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser(user);
        // Fetch profile data
        supabase
          .from("profiles")
          .select("username, chips, created_at")
          .eq("id", user.id)
          .single()
          .then(({ data, error }) => {
            if (!error && data) {
              setProfile(data);
            }
          });
      }
    });
  }, [supabase]);

  useEffect(() => {
    if (!user) return;

    // Fetch initial pending count
    supabase
      .from("friend_requests")
      .select("id", { count: "exact", head: true })
      .eq("to_user_id", user.id)
      .eq("status", "pending")
      .then(({ count }) => {
        setPendingCount(count || 0);
      });

    // Subscribe to realtime updates
    const channel = supabase
      .channel("friend_requests")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friend_requests",
          filter: `to_user_id=eq.${user.id}`,
        },
        (payload) => {
          // Refetch count on any change
          supabase
            .from("friend_requests")
            .select("id", { count: "exact", head: true })
            .eq("to_user_id", user.id)
            .eq("status", "pending")
            .then(({ count }) => {
              setPendingCount(count || 0);
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    // Redirect to coming-soon and force a hard refresh to clear any cached state
    window.location.href = "/coming-soon";
  };

  const navItems = [
    { href: "/play", label: "Play Poker", icon: Play },
    { href: "/learn", label: "Learn", icon: BookOpen },
    {
      href: "/friends",
      label: "Friends",
      icon: Users,
      badge: pendingCount > 0 ? pendingCount : null,
    },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const sidebarVariants = {
    expanded: {
      width: "240px",
      transition: {
        duration: 0, // Instant transition
      },
    },
    minimized: {
      width: "64px",
      transition: {
        duration: 0, // Instant transition
      },
    },
  };

  // Instant content transition (no animation)
  const contentTransition = {
    duration: 0,
  };

  // Tooltip component for minimized sidebar items
  const Tooltip = ({
    children,
    text,
    show,
  }: {
    children: React.ReactNode;
    text: string;
    show: boolean;
  }) => {
    const [isHovered, setIsHovered] = useState(false);

    return (
      <div
        className="relative w-full flex items-center"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {children}
        <AnimatePresence>
          {show && isHovered && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="absolute left-full ml-2 z-[9999] px-3 py-2 bg-gray-900 text-white text-sm rounded-md shadow-xl whitespace-nowrap pointer-events-none"
              style={{
                top: "50%",
                transform: "translateY(-50%)",
              }}
            >
              {text}
              <div
                className="absolute right-full border-4 border-transparent border-r-gray-900"
                style={{
                  top: "50%",
                  right: "100%",
                  transform: "translateY(-50%)",
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <motion.aside
      className="flex flex-col h-screen border-r bg-card flex-shrink-0 z-50 overflow-visible"
      variants={sidebarVariants}
      animate={isMinimized ? "minimized" : "expanded"}
      initial={isMinimized ? "minimized" : "expanded"}
      style={{ willChange: "width" }}
    >
      <div
        className={cn("border-b overflow-hidden", isMinimized ? "p-4" : "p-6")}
      >
        <div className="relative flex items-center justify-center min-h-[36px]">
          <AnimatePresence mode="wait">
            {!isMinimized ? (
              <motion.div
                key="logo-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={contentTransition}
                className="flex items-center gap-3 w-full"
              >
                <Link href="/play" className="flex items-center gap-3 w-full">
                  <Image
                    src="/logo/POKROnlineLogoSVG.svg"
                    alt="POKROnline"
                    width={36}
                    height={36}
                    className="h-9 w-9 flex-shrink-0 object-contain"
                    priority
                  />
                  <span className="text-2xl font-bold whitespace-nowrap text-white">
                    POKROnline
                  </span>
                </Link>
              </motion.div>
            ) : (
              <motion.div
                key="logo-icon"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={contentTransition}
                className="flex justify-center items-center w-full"
              >
                <Link href="/play" className="flex items-center justify-center">
                  <Image
                    src="/logo/POKROnlineLogoSVG.svg"
                    alt="POKROnline"
                    width={36}
                    height={36}
                    className="h-9 w-9 object-contain"
                    priority
                  />
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <nav className="flex-1 flex flex-col p-4 overflow-visible min-h-0">
        <div className="flex flex-col space-y-2 flex-shrink-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            // Special handling for /play to exclude /play/profile
            let isActive = false;
            if (item.href === "/play") {
              // Match /play exactly or /play/game/... or /play/local/..., but not /play/profile
              isActive =
                pathname === "/play" ||
                pathname.startsWith("/play/game/") ||
                pathname.startsWith("/play/local/");
            } else {
              // For other routes, use startsWith but ensure /play/profile doesn't match /play
              isActive = pathname.startsWith(item.href);
            }
            return (
              <Tooltip key={item.href} text={item.label} show={isMinimized}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg transition-colors min-w-0 w-full",
                    isMinimized
                      ? "justify-center px-3 py-3"
                      : "justify-between px-4 py-3",
                    isActive
                      ? "text-white"
                      : "text-white/70 hover:text-white"
                  )}
                  style={isActive ? {
                    backgroundColor: `${accentColor}CC`,
                  } : {
                    '--hover-bg': `${accentColor}CC`,
                  } as React.CSSProperties}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = `${accentColor}CC`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <div
                    className={cn(
                      "flex items-center",
                      isMinimized ? "justify-center" : "gap-3"
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {!isMinimized && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={contentTransition}
                        className="whitespace-nowrap overflow-hidden"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </div>
                  {!isMinimized &&
                    item.badge !== null &&
                    item.badge !== undefined && (
                      <Badge variant="destructive" className="ml-auto">
                        {item.badge}
                      </Badge>
                    )}
                </Link>
              </Tooltip>
            );
          })}
          {/* Profile Link - At bottom of nav */}
          {profile && (
            <Tooltip
              text={`${
                profile.username
              } - ${profile.chips.toLocaleString()} chips`}
              show={isMinimized}
            >
              <Link
                href="/play/profile"
                className={cn(
                  "flex items-center gap-3 rounded-lg transition-colors min-w-0 w-full",
                  isMinimized ? "justify-center px-3 py-3" : "px-4 py-3",
                  pathname === "/play/profile"
                    ? "text-white"
                    : "text-white/70 hover:text-white"
                )}
                style={pathname === "/play/profile" ? {
                  backgroundColor: `${accentColor}CC`,
                } : {
                  '--hover-bg': `${accentColor}CC`,
                } as React.CSSProperties}
                onMouseEnter={(e) => {
                  if (pathname !== "/play/profile") {
                    e.currentTarget.style.backgroundColor = `${accentColor}CC`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (pathname !== "/play/profile") {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <UserCircle className="h-6 w-6 flex-shrink-0" />
                {!isMinimized && (
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {profile.username}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {profile.chips.toLocaleString()} chips • Joined:{" "}
                      {new Date(profile.created_at).toLocaleDateString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                        }
                      )}
                    </div>
                  </div>
                )}
              </Link>
            </Tooltip>
          )}
        </div>

        {/* Toggle Button - At bottom of nav with space */}
        <div className="mt-auto pt-6">
          <Tooltip
            text={isMinimized ? "Expand" : "Collapse"}
            show={isMinimized}
          >
            <button
              onClick={toggleSidebar}
              className={cn(
                "flex items-center gap-3 rounded-lg transition-colors min-w-0 w-full",
                isMinimized
                  ? "justify-center px-3 py-3"
                  : "justify-start px-4 py-3",
                "text-white/70 hover:text-white"
              )}
              style={{
                '--hover-bg': `${accentColor}CC`,
              } as React.CSSProperties}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = `${accentColor}CC`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <div
                className={cn(
                  "flex items-center",
                  isMinimized ? "justify-center" : "gap-3"
                )}
              >
                {isMinimized ? (
                  <ChevronRight className="h-5 w-5 flex-shrink-0" />
                ) : (
                  <>
                    <ChevronLeft className="h-5 w-5 flex-shrink-0" />
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={contentTransition}
                      className="whitespace-nowrap overflow-hidden"
                    >
                      Collapse
                    </motion.span>
                  </>
                )}
              </div>
            </button>
          </Tooltip>
        </div>
      </nav>

      <div
        className={cn("border-t overflow-visible", isMinimized ? "p-4" : "p-4")}
      >
        <Tooltip text="Sign Out" show={isMinimized}>
          <button
            onClick={handleSignOut}
            className={cn(
              "flex items-center gap-3 rounded-lg transition-colors min-w-0 w-full",
              isMinimized
                ? "justify-center px-3 py-3"
                : "justify-start px-4 py-3",
              "text-white/70 hover:text-white"
            )}
            style={{
              '--hover-bg': `${accentColor}CC`,
            } as React.CSSProperties}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = `${accentColor}CC`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {!isMinimized && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={contentTransition}
                className="whitespace-nowrap overflow-hidden"
              >
                Sign Out
              </motion.span>
            )}
          </button>
        </Tooltip>
      </div>
    </motion.aside>
  );
}
