"use client";

import { Card } from "@/components/Card";

interface HandRanking {
  name: string;
  cards: string[];
  rank: number;
}

// Texas Hold'em hand rankings with example hands
const HOLDEM_HAND_RANKINGS: HandRanking[] = [
  {
    name: "Royal Flush",
    cards: ["Ah", "Kh", "Qh", "Jh", "Th"],
    rank: 1,
  },
  {
    name: "Straight Flush",
    cards: ["9h", "8h", "7h", "6h", "5h"],
    rank: 2,
  },
  {
    name: "Four of a Kind",
    cards: ["Ac", "Ad", "Ah", "As", "Kc"],
    rank: 3,
  },
  {
    name: "Full House",
    cards: ["Ac", "Ad", "Ah", "Kc", "Kd"],
    rank: 4,
  },
  {
    name: "Flush",
    cards: ["Ah", "Kh", "9h", "6h", "3h"],
    rank: 5,
  },
  {
    name: "Straight",
    cards: ["9c", "8d", "7h", "6s", "5c"],
    rank: 6,
  },
  {
    name: "Three of a Kind",
    cards: ["Ac", "Ad", "Ah", "Kc", "Qd"],
    rank: 7,
  },
  {
    name: "Two Pair",
    cards: ["Ac", "Ad", "Kc", "Kd", "Qh"],
    rank: 8,
  },
  {
    name: "One Pair",
    cards: ["Ac", "Ad", "Kh", "Qc", "9d"],
    rank: 9,
  },
  {
    name: "High Card",
    cards: ["Ah", "Kd", "Qc", "9s", "6h"],
    rank: 10,
  },
];

interface HandRankingsSidebarProps {
  isVisible: boolean;
  isHoldem: boolean;
  currentHandStrength?: string | null;
}

/**
 * Extract base hand type from hand strength description
 * Examples:
 * - "Pair (Kings)" -> "One Pair"
 * - "Quads (Aces)" -> "Four of a Kind"
 * - "Set (Kings)" -> "Three of a Kind"
 * - "Royal Flush" -> "Royal Flush"
 */
function extractHandType(handStrength: string | null | undefined): string | null {
  // Safety check: handle null, undefined, empty string, or non-string values
  if (!handStrength || typeof handStrength !== "string") return null;

  // Direct matches
  if (handStrength.startsWith("Royal Flush")) return "Royal Flush";
  if (handStrength.startsWith("Straight Flush")) return "Straight Flush";
  if (handStrength.startsWith("Full House")) return "Full House";
  if (handStrength.startsWith("Flush")) return "Flush";
  if (handStrength.startsWith("Straight")) return "Straight";
  if (handStrength.startsWith("Two Pair")) return "Two Pair";
  if (handStrength.startsWith("High Card")) return "High Card";

  // Normalize variations
  if (handStrength.startsWith("Quads")) return "Four of a Kind";
  if (handStrength.startsWith("Set")) return "Three of a Kind";
  if (handStrength.startsWith("Pair")) return "One Pair";

  return null;
}

export function HandRankingsSidebar({
  isVisible,
  isHoldem,
  currentHandStrength,
}: HandRankingsSidebarProps) {
  if (!isHoldem || !isVisible) {
    return null;
  }

  const currentHandType = extractHandType(currentHandStrength);

  return (
    <div className="absolute top-28 right-4 bottom-24 w-72 z-40 overflow-hidden">
      <div className="h-full bg-transparent rounded-lg p-4 overflow-y-auto">
        <h2 className="text-xl font-bold mb-4 text-foreground text-center">Hand Rankings</h2>
        <div className="space-y-3">
          {HOLDEM_HAND_RANKINGS.map((hand) => {
            const isCurrentHand = currentHandType === hand.name;
            return (
              <div
                key={hand.rank}
                className={`rounded-md p-2 transition-colors ${
                  isCurrentHand
                    ? "bg-primary/20 border border-primary/40"
                    : ""
                }`}
              >
                <h3
                  className={`text-sm font-semibold mb-1 mt-0 ${
                    isCurrentHand ? "text-primary" : "text-foreground"
                  }`}
                >
                  {hand.name}
                </h3>
                <div className="flex gap-0 -mt-0.5 -mb-1" style={{ transform: "scale(0.6)" }}>
                  {hand.cards.map((card, index) => (
                    <div
                      key={`${card}-${index}`}
                      style={{ marginLeft: index > 0 ? "-1.5rem" : "0" }}
                    >
                      <Card card={card as any} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

