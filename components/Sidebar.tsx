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
  UserPlus,
  ChevronRight,
  ChevronLeft,
  Moon,
  Sun,
  Crown,
  Menu,
  X,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClientComponentClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useThemeToggle } from "@/components/ThemeToggle";
import { useIsMobile } from "@/lib/hooks";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClientComponentClient();
  const { currentTheme } = useTheme();
  const [pendingCount, setPendingCount] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [hoveredSubmenu, setHoveredSubmenu] = useState<string | null>(null);
  const { theme, toggleTheme, mounted: themeMounted } = useThemeToggle();
  const isMobile = useIsMobile();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  // Get theme colors for sidebar elements (not background)
  const primaryColor = currentTheme.colors.primary[0];
  const accentColor = currentTheme.colors.accent[0];

  // Minimized state: default to false
  const [isMinimized, setIsMinimized] = useState(false);

  const toggleSidebar = () => {
    setIsMinimized((prev) => !prev);
  };

  useEffect(() => {
    // Get current user
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
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
    // Redirect to home and force a hard refresh to clear any cached state
    window.location.href = "/";
  };

  const toggleAccordion = (href: string) => {
    setExpandedItems((prev) =>
      prev.includes(href)
        ? prev.filter((item) => item !== href)
        : [...prev, href]
    );
  };

  const closeMobileSidebar = () => {
    setIsMobileSidebarOpen(false);
  };

  const navItems = [
    {
      href: "/play",
      label: "Play",
      icon: Play,
      submenu: [
        { href: "/play/online", label: "Play Online" },
        { href: "/play/bots", label: "Play Bots" },
        { href: "/play/host", label: "Host Game" },
      ],
    },
    {
      href: "/learn",
      label: "Study",
      icon: BookOpen,
      submenu: [
        { href: "/learn", label: "Lessons" },
        { href: "/tools/range-analysis", label: "Range Evaluator" },
        { href: "/tools/equity-calculator", label: "Equity Evaluator" },
      ],
    },
    {
      href: "/friends",
      label: "Friends",
      icon: Users,
      badge: pendingCount > 0 ? pendingCount : null,
    },
    { href: "/profile", label: "Profile", icon: UserCircle },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const sidebarVariants = {
    expanded: {
      width: "160px",
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
        className="relative w-full"
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

  // Mobile hamburger button
  if (isMobile) {
    return (
      <>
        {/* Hamburger Button - Fixed top left */}
        <button
          onClick={() => setIsMobileSidebarOpen(true)}
          className="fixed top-4 left-4 z-[100] p-2 bg-[hsl(222.2,84%,4.9%)] text-white rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>

        {/* Mobile Sidebar Overlay */}
        <AnimatePresence>
          {isMobileSidebarOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/50 z-[9998]"
                onClick={closeMobileSidebar}
              />

              {/* Full-screen Sidebar */}
              <motion.aside
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed inset-0 z-[9999] bg-[hsl(222.2,84%,4.9%)] flex flex-col overflow-y-auto"
              >
                {/* Header with Close Button */}
                <div className="flex items-center justify-between p-4 border-b">
                  <Link
                    href={user ? "/play" : "/"}
                    onClick={closeMobileSidebar}
                    className="flex items-center"
                  >
                    <Image
                      src="/logo/POKROnlineLogoSVG.svg"
                      alt="POKROnline"
                      width={48}
                      height={48}
                      className="h-12 w-12 object-contain"
                      priority
                    />
                  </Link>
                  <button
                    onClick={closeMobileSidebar}
                    className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                    aria-label="Close menu"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                {/* Navigation Items */}
                <nav className="flex-1 flex flex-col py-4">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    let isActive =
                      item.href === "/play"
                        ? pathname === "/play" ||
                          pathname === "/play/online" ||
                          (pathname?.startsWith("/play/") &&
                            !pathname?.startsWith("/play/bots"))
                        : pathname === item.href ||
                          pathname?.startsWith(`${item.href}/`);

                    if (item.submenu && !isActive) {
                      isActive = item.submenu.some((subItem) => {
                        return (
                          pathname === subItem.href ||
                          pathname?.startsWith(`${subItem.href}/`)
                        );
                      });
                    }

                    const isExpanded = expandedItems.includes(item.href);

                    return (
                      <div key={item.href} className="w-full">
                        {item.submenu ? (
                          // Accordion item with submenu
                          <>
                            <button
                              onClick={() => toggleAccordion(item.href)}
                              className="flex items-center justify-between w-full px-4 py-3 text-white hover:bg-white/5 transition-colors"
                              style={
                                isActive
                                  ? { backgroundColor: `${accentColor}CC` }
                                  : undefined
                              }
                            >
                              <div className="flex items-center gap-3">
                                <Icon className="h-5 w-5" />
                                <span>{item.label}</span>
                                {!item.submenu &&
                                  (item as any).badge !== null &&
                                  (item as any).badge !== undefined && (
                                    <Badge variant="destructive">
                                      {(item as any).badge}
                                    </Badge>
                                  )}
                              </div>
                              <ChevronDown
                                className={cn(
                                  "h-5 w-5 transition-transform",
                                  isExpanded && "rotate-180"
                                )}
                              />
                            </button>
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="bg-black/20">
                                    {item.submenu.map((subItem) => {
                                      const isSubActive =
                                        pathname === subItem.href ||
                                        pathname?.startsWith(
                                          `${subItem.href}/`
                                        );
                                      return (
                                        <Link
                                          key={subItem.href}
                                          href={subItem.href}
                                          onClick={closeMobileSidebar}
                                          className={cn(
                                            "flex items-center px-4 py-3 pl-12 text-white hover:bg-white/5 transition-colors"
                                          )}
                                          style={
                                            isSubActive
                                              ? {
                                                  backgroundColor: `${accentColor}CC`,
                                                }
                                              : undefined
                                          }
                                        >
                                          <span>{subItem.label}</span>
                                        </Link>
                                      );
                                    })}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </>
                        ) : (
                          // Regular item without submenu
                          <Link
                            href={item.href}
                            onClick={closeMobileSidebar}
                            className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/5 transition-colors"
                            style={
                              isActive
                                ? { backgroundColor: `${accentColor}CC` }
                                : undefined
                            }
                          >
                            <Icon className="h-5 w-5" />
                            <span>{item.label}</span>
                            {item.badge !== null &&
                              item.badge !== undefined && (
                                <Badge
                                  variant="destructive"
                                  className="ml-auto"
                                >
                                  {item.badge}
                                </Badge>
                              )}
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </nav>

                {/* Theme Toggle */}
                <div className="border-t p-4">
                  <button
                    onClick={toggleTheme}
                    className="flex items-center gap-3 w-full px-4 py-3 text-white hover:bg-white/5 transition-colors rounded-lg"
                    disabled={!themeMounted}
                  >
                    {theme === "light" ? (
                      <Moon className="h-5 w-5" />
                    ) : (
                      <Sun className="h-5 w-5" />
                    )}
                    <span>
                      {theme === "light" ? "Dark Mode" : "Light Mode"}
                    </span>
                  </button>
                </div>

                {/* Auth Section */}
                <div className="border-t p-4">
                  {user ? (
                    <button
                      onClick={() => {
                        handleSignOut();
                        closeMobileSidebar();
                      }}
                      className="flex items-center gap-3 w-full px-4 py-3 text-white hover:bg-white/5 transition-colors rounded-lg"
                    >
                      <LogOut className="h-5 w-5" />
                      <span>Sign Out</span>
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <Link
                        href="/auth/signin"
                        onClick={closeMobileSidebar}
                        className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/5 transition-colors rounded-lg"
                      >
                        <UserCircle className="h-5 w-5" />
                        <span>Log In</span>
                      </Link>
                      <Link
                        href="/auth/signup"
                        onClick={closeMobileSidebar}
                        className="flex items-center justify-center px-4 py-3 text-white transition-all rounded-lg"
                        style={{
                          background:
                            "linear-gradient(to right, #059669, #15803d)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            "linear-gradient(to right, #10b981, #16a34a)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background =
                            "linear-gradient(to right, #059669, #15803d)";
                        }}
                      >
                        <span>Create Account</span>
                      </Link>
                    </div>
                  )}
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </>
    );
  }

  // Desktop sidebar
  return (
    <motion.aside
      className="hidden md:flex relative flex-col h-screen border-r bg-[hsl(222.2,84%,4.9%)] flex-shrink-0 z-50 overflow-visible"
      variants={sidebarVariants}
      animate={isMinimized ? "minimized" : "expanded"}
      initial={isMinimized ? "minimized" : "expanded"}
      style={{ willChange: "width" }}
    >
      <div
        className={cn(
          "border-b overflow-hidden",
          isMinimized ? "px-2 py-3" : "p-3"
        )}
      >
        <div className="relative flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key="logo"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={contentTransition}
              className="flex justify-center items-center w-full"
            >
              <Link
                href={user ? "/play" : "/"}
                className="flex items-center justify-center"
              >
                <Image
                  src="/logo/POKROnlineLogoSVG.svg"
                  alt="POKROnline"
                  width={48}
                  height={48}
                  className="h-12 w-12 object-contain"
                  priority
                />
              </Link>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <nav className="flex-1 flex flex-col overflow-visible min-h-0">
        <div className="flex flex-col flex-shrink-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            // Check if current pathname matches the item's href
            // For /play, also match /play/* paths (game pages, queue, etc.) except /play/bots
            // For items with submenus, also check if any submenu item is active
            let isActive =
              item.href === "/play"
                ? pathname === "/play" ||
                  pathname === "/play/online" ||
                  (pathname?.startsWith("/play/") &&
                    !pathname?.startsWith("/play/bots"))
                : pathname === item.href ||
                  pathname?.startsWith(`${item.href}/`);

            // If item has submenu, check if any submenu item is active
            if (item.submenu && !isActive) {
              isActive = item.submenu.some((subItem) => {
                return (
                  pathname === subItem.href ||
                  pathname?.startsWith(`${subItem.href}/`)
                );
              });
            }

            return (
              <Tooltip
                key={item.href}
                text={item.label}
                show={isMinimized && !item.submenu}
              >
                <div className="relative w-full">
                  <Link
                    href={item.href}
                    className="flex items-center min-w-0 w-full text-white hover:bg-white/5 transition-colors relative"
                    style={{
                      minHeight: "48px",
                      paddingLeft: "12px", // px-3 = 12px - fixed left padding
                      paddingRight: "12px", // px-3 = 12px - fixed right padding
                      paddingTop: "12px",
                      paddingBottom: "12px",
                      ...(isActive
                        ? { backgroundColor: `${accentColor}CC` }
                        : {}),
                    }}
                    onMouseEnter={() => {
                      if (item.submenu) {
                        setHoveredSubmenu(item.href);
                      } else {
                        setHoveredSubmenu(null);
                      }
                    }}
                    onMouseLeave={() => {
                      if (item.submenu) {
                        setHoveredSubmenu(null);
                      }
                    }}
                  >
                    {/* Fixed-width icon container - always 40px wide, centered when minimized */}
                    <div
                      className="flex items-center justify-center flex-shrink-0"
                      style={{
                        width: isMinimized ? "40px" : "40px",
                        marginLeft: isMinimized ? "0" : "0",
                      }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    {!isMinimized && (
                      <>
                        <span className="ml-3 whitespace-nowrap overflow-hidden flex-1">
                          {item.label}
                        </span>
                        {item.badge !== null && item.badge !== undefined && (
                          <Badge
                            variant="destructive"
                            className="ml-auto flex-shrink-0"
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </>
                    )}
                  </Link>
                </div>
              </Tooltip>
            );
          })}
        </div>

        {/* Theme Toggle - Above collapse button */}
        <div className="mt-auto pt-6">
          <Tooltip
            text={
              isMinimized
                ? theme === "light"
                  ? "Dark"
                  : "Light"
                : theme === "light"
                ? "Switch to Dark Mode"
                : "Switch to Light Mode"
            }
            show={isMinimized}
          >
            <button
              onClick={toggleTheme}
              className="flex items-center min-w-0 w-full text-white hover:bg-white/5 transition-colors relative"
              style={{
                minHeight: "48px",
                paddingLeft: "12px",
                paddingRight: "12px",
                paddingTop: "12px",
                paddingBottom: "12px",
              }}
              disabled={!themeMounted}
            >
              {/* Fixed-width icon container - always 40px wide */}
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{ width: "40px" }}
              >
                {theme === "light" ? (
                  <Moon className="h-5 w-5" />
                ) : (
                  <Sun className="h-5 w-5" />
                )}
              </div>
              {!isMinimized && (
                <span className="ml-3 whitespace-nowrap overflow-hidden">
                  {theme === "light" ? "Dark" : "Light"}
                </span>
              )}
            </button>
          </Tooltip>
        </div>

        {/* Toggle Button - At bottom of nav */}
        <div>
          <Tooltip text={isMinimized ? "Grow" : "Shrink"} show={isMinimized}>
            <button
              onClick={toggleSidebar}
              className="flex items-center min-w-0 w-full text-white hover:bg-white/5 transition-colors relative"
              style={{
                minHeight: "48px",
                paddingLeft: "12px",
                paddingRight: "12px",
                paddingTop: "12px",
                paddingBottom: "12px",
              }}
            >
              {/* Fixed-width icon container - always 40px wide */}
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{ width: "40px" }}
              >
                {isMinimized ? (
                  <ChevronRight className="h-5 w-5" />
                ) : (
                  <ChevronLeft className="h-5 w-5" />
                )}
              </div>
              {!isMinimized && (
                <span className="ml-3 whitespace-nowrap overflow-hidden">
                  Shrink
                </span>
              )}
            </button>
          </Tooltip>
        </div>
      </nav>

      <div
        className={cn(
          "border-t overflow-visible",
          isMinimized ? "px-0 py-2" : "px-0 py-2"
        )}
      >
        {user ? (
          // Logged in: Show Sign Out button
          <Tooltip text="Sign Out" show={isMinimized}>
            <div className="relative w-full">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleSignOut();
                }}
                className="flex items-center min-w-0 text-white hover:bg-white/5 transition-colors relative rounded-lg"
                style={{
                  minHeight: "48px",
                  paddingTop: "12px",
                  paddingBottom: "12px",
                  paddingLeft: "4px",
                  paddingRight: "4px",
                  marginLeft: "8px",
                  marginRight: "8px",
                }}
              >
                {/* Fixed-width icon container - always 40px wide */}
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{ width: "40px" }}
                >
                  <LogOut className="h-5 w-5" />
                </div>
                {!isMinimized && (
                  <span className="ml-3 whitespace-nowrap overflow-hidden">
                    Sign Out
                  </span>
                )}
              </a>
            </div>
          </Tooltip>
        ) : (
          // Logged out: Show Log In and Create Account buttons
          <div className={cn("flex flex-col gap-2")}>
            <Tooltip text="Log In" show={isMinimized}>
              <div className="relative w-full">
                <Link
                  href="/auth/signin"
                  className="flex items-center min-w-0 text-white hover:bg-white/5 transition-colors relative rounded-lg"
                  style={{
                    minHeight: "48px",
                    paddingTop: "12px",
                    paddingBottom: "12px",
                    paddingLeft: "4px",
                    paddingRight: "4px",
                    marginLeft: "8px",
                    marginRight: "8px",
                  }}
                >
                  {/* Fixed-width icon container - always 40px wide */}
                  <div
                    className="flex items-center justify-center flex-shrink-0"
                    style={{
                      width: "40px",
                    }}
                  >
                    <UserCircle className="h-5 w-5" />
                  </div>
                  {!isMinimized && (
                    <span className="ml-3 whitespace-nowrap overflow-hidden">
                      Log In
                    </span>
                  )}
                </Link>
              </div>
            </Tooltip>
            {!isMinimized && (
              <Link
                href="/auth/signup"
                className={cn(
                  "flex items-center justify-center text-white transition-all rounded-lg"
                )}
                style={{
                  minHeight: "48px",
                  paddingTop: "12px",
                  paddingBottom: "12px",
                  paddingLeft: "12px",
                  paddingRight: "12px",
                  marginLeft: "8px",
                  marginRight: "8px",
                  background: "linear-gradient(to right, #059669, #15803d)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "linear-gradient(to right, #10b981, #16a34a)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    "linear-gradient(to right, #059669, #15803d)";
                }}
              >
                <span className="whitespace-nowrap">Create</span>
              </Link>
            )}
            {isMinimized && (
              <Tooltip text="Create" show={isMinimized}>
                <Link
                  href="/auth/signup"
                  className={cn(
                    "flex items-center justify-center text-white transition-all rounded-lg"
                  )}
                  style={{
                    minHeight: "48px",
                    paddingTop: "12px",
                    paddingBottom: "12px",
                    paddingLeft: "12px",
                    paddingRight: "12px",
                    marginLeft: "8px",
                    marginRight: "8px",
                    background: "linear-gradient(to right, #059669, #15803d)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      "linear-gradient(to right, #10b981, #16a34a)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      "linear-gradient(to right, #059669, #15803d)";
                  }}
                >
                  <UserPlus className="h-5 w-5 flex-shrink-0" />
                </Link>
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {/* Submenu Sidebar */}
      {hoveredSubmenu &&
        (() => {
          const item = navItems.find((nav) => nav.href === hoveredSubmenu);
          if (!item?.submenu) return null;

          return (
            <aside
              className="absolute top-0 h-full border-r bg-[hsl(222.2,84%,4.9%)] flex-shrink-0 z-[9999] overflow-visible"
              style={{
                width: "180px",
                left: "100%",
                marginLeft: "1px",
              }}
              onMouseEnter={() => {
                setHoveredSubmenu(hoveredSubmenu);
              }}
              onMouseLeave={() => {
                setHoveredSubmenu(null);
              }}
            >
              <nav className="flex flex-col h-full">
                {item.submenu.map((subItem) => {
                  let isSubActive =
                    pathname === subItem.href ||
                    pathname?.startsWith(`${subItem.href}/`);
                  return (
                    <Link
                      key={subItem.href}
                      href={subItem.href}
                      className={cn(
                        "flex items-center px-4 py-3 min-w-0 w-full text-white hover:bg-white/5 transition-colors"
                      )}
                      style={
                        isSubActive
                          ? {
                              backgroundColor: `${accentColor}CC`,
                            }
                          : undefined
                      }
                    >
                      <span className="whitespace-nowrap">{subItem.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </aside>
          );
        })()}
    </motion.aside>
  );
}
