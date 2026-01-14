import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Equity Calculator",
  description:
    "No sign in required. Calculate poker hand equity instantly. Compare your hand against opponents' hands or ranges, with or without board cards. Get accurate equity percentages for any poker scenario.",
  keywords: [
    "poker equity",
    "equity calculator",
    "poker calculator",
    "hand equity",
    "poker odds",
    "poker tools",
    "equity evaluator",
    "poker math",
    "win probability",
    "poker strategy",
  ],
  openGraph: {
    title: "Equity Calculator | POKROnline",
    description:
      "No sign in required. Calculate poker hand equity instantly. Compare your hand against opponents' hands or ranges, with or without board cards.",
  },
};

export default function EquityCalculatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
