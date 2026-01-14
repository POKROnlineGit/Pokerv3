"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// --- Assets & Icons ---

const Icons = {
  Learn: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-8 h-8 text-emerald-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
  Play: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-8 h-8 text-emerald-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" />
    </svg>
  ),
  Analyze: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-8 h-8 text-emerald-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  Practice: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-8 h-8 text-emerald-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
};

// --- Feature Card Component ---

function FeatureCard({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <div className="relative p-8 rounded-3xl border border-white/10 bg-gray-900 hover:border-emerald-400/30 hover:bg-gray-800 shadow-2xl hover:shadow-emerald-900/20 transition-all duration-300 cursor-pointer">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-100 rounded-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-start gap-6">
        <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-400/50 hover:border-emerald-300/70 scale-110 transition-all duration-300">
          <Icon />
        </div>

        <div className="space-y-3">
          <h3 className="text-2xl font-bold text-emerald-300 hover:text-emerald-200 transition-colors duration-300">
            {title}
          </h3>
          <p className="text-gray-400 leading-relaxed font-light text-lg">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handlePlayNow = () => {
    router.push("/play");
  };

  const scrollToFeatures = () => {
    document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
  };

  if (!mounted) return <div className="min-h-screen bg-green-950" />;

  return (
    <div className="min-h-screen relative font-sans selection:bg-emerald-500/30">
      {/* --- SCROLLABLE CONTENT LAYER --- */}
      <div className="relative z-10 flex flex-col">
        {/* 1. HERO SECTION (Min Height Screen) */}
        <div className="min-h-screen flex flex-col items-center justify-center px-4 relative">
          <div className="relative bg-gray-900 border border-white/10 p-8 md:p-16 rounded-3xl shadow-2xl max-w-4xl w-full text-center overflow-hidden">
            {/* Title Area */}
            <div className="mb-8 relative flex flex-col items-center justify-center gap-6">
              <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-emerald-600 to-green-700 drop-shadow-2xl tracking-tighter">
                PokrOnline
              </h1>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-emerald-500/20 blur-3xl rounded-full w-64 h-64 -z-10" />
            </div>

            {/* Tagline */}
            <p className="text-xl md:text-3xl text-gray-200 mb-12 font-light leading-relaxed">
              Learn, Study, and dominate <span className="font-bold text-white">Poker</span>.
            </p>

            {/* Action Area */}
            <div className="flex flex-col items-center gap-6">
              <Button
                onClick={handlePlayNow}
                className="px-8 py-6 text-lg font-bold bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-500 hover:to-green-600 text-white rounded-xl shadow-xl transition-all duration-300 border border-emerald-400/20"
              >
                <span className="flex items-center gap-2">
                  Play Now
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </span>
              </Button>

              <button
                onClick={scrollToFeatures}
                className="text-sm font-medium mt-4 animate-bounce bg-gradient-to-b from-emerald-600 to-green-700 bg-clip-text text-transparent"
              >
                Scroll to explore ▼
              </button>
            </div>
          </div>
        </div>

        {/* 2. FEATURES SECTION (Scrolls over background) */}
        <div
          id="features"
          className="min-h-screen py-20 px-6 flex flex-col items-center justify-center pb-12"
        >
          <div className="max-w-7xl mx-auto w-full">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                Master the Game
              </h2>
              <p className="text-xl text-gray-400 max-w-2xl mx-auto">
                Built for enthusiasts, by enthusiasts. PokrOnline provides the
                complete suite of tools to elevate your game.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <FeatureCard
                title="Learn"
                icon={Icons.Learn}
                description="New to poker? Interested in learning the rules? We offer comprehensive tutorials and interactive lessons covering everything from hand rankings to advanced game theory concepts."
              />

              <FeatureCard
                title="Play"
                icon={Icons.Play}
                description="Jump into the action instantly. Host private games for your friends or queue up for online matchmaking in 6-Max and Heads-Up formats with zero latency."
              />

              <FeatureCard
                title="Analyze"
                icon={Icons.Analyze}
                description="Don't just play—improve. Analyze your game history after the fact to identify leaks, visualize your win-rate, and understand the mathematics behind your biggest pots."
              />

              <FeatureCard
                title="Practice"
                icon={Icons.Practice}
                description="Refine your strategy without the risk. Get placed in specific scenarios—like navigating a 3-bet pot out of position—and see how you perform against optimal play."
              />
            </div>

            {/* Footer */}
            <div className="mt-12 text-center border-t border-white/10 pt-6">
              <p className="text-emerald-500/40 text-sm">
                © 2025 PokrOnline. All cards dealt fairly.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
