"use client";

import { useRouter, usePathname } from "next/navigation";
import { Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface QueueStatusPopupProps {
  inQueue: boolean;
  matchFound: boolean;
  queueType: string | null;
}

export function QueueStatusPopup({
  inQueue,
  matchFound,
  queueType,
}: QueueStatusPopupProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Don't show popup on lobby or queue pages
  // (This prevents redundant UI, especially the "Game Found!" popup)
  // Exclude: /play (lobby) and /play/queue (queue page)

  // usePathname() returns pathname without query params
  // e.g., '/play/queue?type=heads_up' -> '/play/queue'
  // Use window.location.pathname as fallback for client-side routing edge cases
  const currentPath =
    pathname || (typeof window !== "undefined" ? window.location.pathname : "");

  // Hide popup on lobby page (exact match only)
  if (currentPath === "/play") return null;

  // Hide popup on queue page (exact pathname match, handles /play/queue with or without query params)
  // Only check pathname, not full URL, to avoid false matches
  if (currentPath.startsWith("/play/queue")) return null;

  // Don't show popup if not in queue and no match found
  if (!inQueue && !matchFound) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 cursor-pointer shadow-2xl transition-all duration-300 transform",
        matchFound ? "bg-emerald-600" : "bg-gray-900",
        "text-white px-6 py-4 rounded-xl border border-white/10 hover:scale-105 active:scale-95"
      )}
      onClick={() => {
        if (queueType) router.push(`/play/queue?type=${queueType}`);
      }}
    >
      <div className="flex items-center gap-3">
        {matchFound ? (
          <div className="bg-white/20 p-2 rounded-full">
            <ArrowRight className="h-5 w-5 animate-pulse" />
          </div>
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
        )}

        <div className="flex flex-col">
          <span className="font-bold text-sm">
            {matchFound ? "GAME FOUND!" : "IN QUEUE"}
          </span>
          <span className="text-xs text-white/70">
            {matchFound
              ? "Joining table..."
              : `Waiting for ${
                  queueType === "heads_up" ? "Heads Up" : "6-Max"
                }...`}
          </span>
        </div>
      </div>
    </div>
  );
}
