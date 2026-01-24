"use client";

import { useUserProfile } from "@/lib/hooks/useUserProfile";

interface DashboardHeaderProps {
  initialUsername?: string | null;
  initialChips?: number | null;
}

export function DashboardHeader({
  initialUsername,
  initialChips,
}: DashboardHeaderProps) {
  const { username, chips, isLoading } = useUserProfile();

  // Use real-time data if available, fall back to initial server-rendered values
  const displayUsername = username ?? initialUsername ?? "Player";
  const displayChips = chips ?? initialChips ?? 0;

  return (
    <div className="mb-8">
      <h1 className="text-2xl font-bold text-white">
        Welcome back, {isLoading ? "..." : displayUsername}!
      </h1>
      <p className="text-slate-400 mt-1">
        {isLoading ? "..." : displayChips.toLocaleString()} chips
      </p>
    </div>
  );
}
