import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Range Evaluator",
  description:
    "No sign in required. Analyze poker hand ranges with our range evaluator. Select hands, set board cards, and get detailed statistics on hand type distribution and valid combinations.",
  keywords: [
    "poker range",
    "range analyzer",
    "poker range evaluator",
    "hand range analysis",
    "poker tools",
    "range builder",
    "poker strategy",
    "hand selection",
  ],
  openGraph: {
    title: "Range Evaluator | POKROnline",
    description:
      "No sign in required. Analyze poker hand ranges with our range evaluator. Select hands, set board cards, and get detailed statistics on hand type distribution and valid combinations.",
  },
};

export default function RangeAnalysisLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
