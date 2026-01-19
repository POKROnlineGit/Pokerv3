"use client";

import { usePathname } from "next/navigation";
import { useStatus } from "@/components/providers/StatusProvider";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Loader2, CheckCircle2, Info, WifiOff, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatusOverlay() {
  const { currentStatus } = useStatus();
  const pathname = usePathname();

  // Get current path for exclusion checks
  const currentPath =
    pathname || (typeof window !== "undefined" ? window.location.pathname : "");

  // Hide queue status on /play/online and /play/queue pages
  if (currentStatus?.id === "queue") {
    if (currentPath === "/play/online" || currentPath.startsWith("/play/queue")) {
      return null;
    }
  }

  // Hide tournament status on /play/tournaments pages
  if (currentStatus?.id === "tournament") {
    if (currentPath.startsWith("/play/tournaments")) {
      return null;
    }
  }

  // Critical statuses (disconnect) should always show, regardless of route
  if (!currentStatus) return null;

  // Get icon and colors based on status type
  const getStatusConfig = () => {
    switch (currentStatus.type) {
      case "error":
        return {
          icon: WifiOff,
          bgColor: "bg-red-600",
          borderColor: "border-red-700",
          textColor: "text-white",
          iconColor: "text-white",
        };
      case "warning":
        return {
          icon: Clock,
          bgColor: "bg-orange-600",
          borderColor: "border-orange-700",
          textColor: "text-white",
          iconColor: "text-white",
        };
      case "success":
        return {
          icon: CheckCircle2,
          bgColor: "bg-emerald-600",
          borderColor: "border-emerald-700",
          textColor: "text-white",
          iconColor: "text-white",
        };
      case "info":
        return {
          icon: Loader2,
          bgColor: "bg-gray-900",
          borderColor: "border-gray-800",
          textColor: "text-white",
          iconColor: "text-emerald-400",
        };
      default:
        return {
          icon: Info,
          bgColor: "bg-gray-900",
          borderColor: "border-gray-800",
          textColor: "text-white",
          iconColor: "text-white",
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;
  const isSpinning = currentStatus.type === "info" && Icon === Loader2;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        className={cn(
          "fixed bottom-6 right-6 z-50 shadow-2xl rounded-xl border-2 px-6 py-4 min-w-[18rem] max-w-md",
          config.bgColor,
          config.borderColor,
          config.textColor
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn("flex-shrink-0", config.iconColor)}>
            {isSpinning ? (
              <Icon className="h-5 w-5 animate-spin" />
            ) : (
              <Icon className="h-5 w-5" />
            )}
          </div>

          <div className="flex-1 flex flex-col gap-1">
            <span className="font-bold text-sm">{currentStatus.title}</span>
            {currentStatus.message && (
              <span className="text-xs opacity-90">{currentStatus.message}</span>
            )}
          </div>

          {currentStatus.action && (
            <button
              onClick={currentStatus.action.onClick}
              className={cn(
                "ml-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all",
                "bg-white/20 hover:bg-white/30 active:scale-95",
                "border border-white/30"
              )}
            >
              {currentStatus.action.label}
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

