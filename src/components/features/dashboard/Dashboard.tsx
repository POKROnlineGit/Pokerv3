"use client";

import {
  Globe2,
  Bot,
  Trophy,
  Crown,
  BookOpen,
  Calculator,
  Grid3X3,
  Users,
  Building2,
  BarChart3,
} from "lucide-react";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardSection } from "./DashboardSection";
import { QuickLinkCard } from "./QuickLinkCard";

interface DashboardProps {
  initialProfile?: {
    username: string | null;
    chips: number | null;
  } | null;
}

export function Dashboard({ initialProfile }: DashboardProps) {
  return (
    <div
      className="min-h-screen p-6"
      style={{ backgroundColor: "var(--theme-background)" }}
    >
      <div className="max-w-5xl mx-auto">
        <DashboardHeader
          initialUsername={initialProfile?.username}
          initialChips={initialProfile?.chips}
        />

        <div className="space-y-8">
          <DashboardSection title="Play">
            <QuickLinkCard
              href="/play/online"
              icon={Globe2}
              title="Play Online"
              description="Quick match against other players"
            />
            <QuickLinkCard
              href="/play/bots"
              icon={Bot}
              title="Play Bots"
              description="Practice against AI opponents"
            />
            <QuickLinkCard
              href="/play/tournaments"
              icon={Trophy}
              title="Tournaments"
              description="Host or join multi-table events"
            />
            <QuickLinkCard
              href="/play/host"
              icon={Crown}
              title="Host Game"
              description="Create a private game"
            />
          </DashboardSection>

          <DashboardSection title="Study">
            <QuickLinkCard
              href="/learn"
              icon={BookOpen}
              title="Lessons"
              description="Learn poker fundamentals"
            />
            <QuickLinkCard
              href="/tools/equity-calculator"
              icon={Calculator}
              title="Equity Calculator"
              description="Calculate hand vs hand equity"
            />
            <QuickLinkCard
              href="/tools/range-analysis"
              icon={Grid3X3}
              title="Range Analysis"
              description="Analyze preflop ranges"
            />
          </DashboardSection>

          <DashboardSection title="Social">
            <QuickLinkCard
              href="/social/friends"
              icon={Users}
              title="Friends"
              description="Manage your friends list"
            />
            <QuickLinkCard
              href="/social/clubs"
              icon={Building2}
              title="Clubs"
              description="Join or create a club"
            />
          </DashboardSection>

          <DashboardSection title="Stats">
            <QuickLinkCard
              href="/profile/preflop-stats"
              icon={BarChart3}
              title="Preflop Stats"
              description="Analyze your preflop tendencies"
            />
          </DashboardSection>
        </div>
      </div>
    </div>
  );
}
