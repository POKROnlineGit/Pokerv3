"use client";

import { motion, useAnimation } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, memo, useRef } from "react";
import Image from "next/image";

// --- Assets & Icons ---

const FIXED_CARDS = ["Ah", "Kd", "Qc", "Js", "Th", "9s", "8h", "7d"];

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

// --- Animation Components ---

const FloatingCard = memo(function FloatingCard({
  card,
  index,
}: {
  card: string;
  index: number;
}) {
  const ellipsePositions = [
    { x: 15, y: 20 },
    { x: 35, y: 12 },
    { x: 55, y: 15 },
    { x: 75, y: 25 },
    { x: 85, y: 45 },
    { x: 70, y: 65 },
    { x: 50, y: 70 },
    { x: 25, y: 68 },
    { x: 10, y: 50 },
  ];
  const pos = ellipsePositions[index % ellipsePositions.length];
  const controls = useAnimation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            controls.start({
              y: [0, -40, 0],
              rotate: [0, 5, -5, 0],
              scale: [0.8, 1, 0.8],
              opacity: [0.15, 0.4, 0.15],
              transition: {
                duration: 10 + index,
                repeat: Infinity,
                ease: "easeInOut",
                delay: index * 0.5,
                type: "tween",
              },
            });
          } else {
            controls.stop();
          }
        });
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, [controls, index]);

  return (
    <motion.div
      ref={ref}
      className="absolute pointer-events-none select-none z-0"
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, willChange: "transform" }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={controls}
    >
      <div
        className="relative w-24 h-36 md:w-32 md:h-48"
        style={{ contain: "layout style paint" }}
      >
        <Image
          src={`/cards/${card}.png`}
          alt={card}
          fill
          className="object-contain opacity-70"
          loading="lazy"
          sizes="(max-width: 768px) 96px, 128px"
          unoptimized={false}
        />
      </div>
    </motion.div>
  );
});

const FloatingLogo = memo(function FloatingLogo({ index }: { index: number }) {
  const ellipsePositions = [
    { x: 20, y: 18 },
    { x: 45, y: 10 },
    { x: 70, y: 18 },
    { x: 88, y: 40 },
    { x: 80, y: 65 },
    { x: 50, y: 75 },
    { x: 20, y: 72 },
    { x: 5, y: 50 },
  ];
  const pos = ellipsePositions[index % ellipsePositions.length];
  const controls = useAnimation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            controls.start({
              y: [0, -30, 0],
              rotate: [0, 5, -5, 0],
              scale: [0.65, 0.8, 0.65],
              opacity: [0.1, 0.3, 0.1],
              transition: {
                duration: 12 + index * 2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: index * 0.5,
                type: "tween",
              },
            });
          } else {
            controls.stop();
          }
        });
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, [controls, index]);

  return (
    <motion.div
      ref={ref}
      className="absolute pointer-events-none select-none z-0"
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, willChange: "transform" }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={controls}
    >
      <div
        className="relative w-16 h-16 md:w-20 md:h-20 opacity-50"
        style={{ contain: "layout style paint" }}
      >
        <Image
          src="/logo/POKROnlineLogoSVG.svg"
          alt="POKROnline Logo"
          fill
          className="object-contain"
          loading="lazy"
          sizes="(max-width: 768px) 64px, 80px"
          unoptimized={false}
        />
      </div>
    </motion.div>
  );
});

const FeatureCard = memo(function FeatureCard({
  title,
  description,
  icon: Icon,
  delay,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ delay, duration: 0.8, ease: "easeOut" }}
      className="group relative p-8 rounded-3xl border border-white/10 bg-black/50 hover:bg-black/60 transition-colors duration-300 shadow-2xl"
      style={{ contain: "layout style paint" }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-start gap-6">
        <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-500/20 group-hover:border-emerald-400/50 group-hover:scale-110 transition-transform duration-300">
          <Icon />
        </div>

        <div className="space-y-3">
          <h3 className="text-2xl font-bold text-white group-hover:text-emerald-300 transition-colors">
            {title}
          </h3>
          <p className="text-gray-400 leading-relaxed font-light text-lg">
            {description}
          </p>
        </div>
      </div>
    </motion.div>
  );
});

export default function ComingSoonPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const denied = searchParams.get("denied");
  const [mounted, setMounted] = useState(false);

  // Parallax hook could be added here if needed, but fixed background handles most of it.

  useEffect(() => {
    setMounted(true);
    if (denied) {
      const toast = document.createElement("div");
      toast.className =
        "fixed top-4 right-4 bg-red-900/90 border border-red-500 text-white px-6 py-4 rounded-xl shadow-2xl z-50 animate-in slide-in-from-top-5 backdrop-blur-md";
      toast.innerHTML =
        '<span class="font-bold mr-2">Access Denied</span> Super user only.';
      document.body.appendChild(toast);

      setTimeout(() => {
        toast.classList.add("animate-out", "fade-out");
        setTimeout(() => toast.remove(), 4000);
      }, 4000);
    }
  }, [denied]);

  const handleDeveloperLogin = () => {
    router.push("/auth/signin");
  };

  const scrollToFeatures = () => {
    document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
  };

  if (!mounted) return <div className="min-h-screen bg-green-950" />;

  return (
    <div className="min-h-screen bg-black relative font-sans selection:bg-emerald-500/30">
      {/* --- FIXED BACKGROUND LAYER --- */}
      <div
        className="fixed inset-0 z-0 overflow-hidden"
        style={{ willChange: "contents" }}
      >
        {/* Radial Gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900 via-green-950 to-black" />

        {/* Noise Texture - CSS-based for better performance */}
        <div
          className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Floating Elements (Cards & Logos) */}
        {FIXED_CARDS.map((card, index) => (
          <FloatingCard key={`${card}-${index}`} card={card} index={index} />
        ))}
        {[...Array(6)].map((_, i) => (
          <FloatingLogo key={`logo-${i}`} index={i} />
        ))}

        {/* Vignette */}
        <div className="absolute inset-0 bg-radial-gradient from-transparent to-black/80 pointer-events-none" />
      </div>

      {/* --- SCROLLABLE CONTENT LAYER --- */}
      <div className="relative z-10 flex flex-col">
        {/* 1. HERO SECTION (Min Height Screen) */}
        <div className="min-h-screen flex flex-col items-center justify-center px-4 relative">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="relative bg-black/30 border border-white/10 p-8 md:p-16 rounded-3xl shadow-2xl max-w-4xl w-full text-center overflow-hidden"
            style={{ contain: "layout style paint" }}
          >
            {/* Title Area */}
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="mb-8 relative flex flex-col items-center justify-center gap-6"
            >
              <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-emerald-200 to-emerald-600 drop-shadow-2xl tracking-tighter">
                POKROnline
              </h1>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-emerald-500/20 blur-3xl rounded-full w-64 h-64 -z-10" />
            </motion.div>

            {/* Status Badge */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="inline-block mb-8"
            >
              <span className="px-4 py-1.5 rounded-full bg-emerald-900/50 border border-emerald-500/30 text-emerald-300 text-sm font-semibold tracking-wider uppercase shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                Under Development
              </span>
            </motion.div>

            {/* Tagline */}
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="text-xl md:text-3xl text-gray-200 mb-12 font-light leading-relaxed"
            >
              The <span className="font-bold text-white">Poker</span> platform
              for players of all skill levels.
            </motion.p>

            {/* Action Area */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="flex flex-col items-center gap-6"
            >
              <Button
                onClick={handleDeveloperLogin}
                className="px-8 py-6 text-lg font-bold bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-500 hover:to-green-600 text-white rounded-xl shadow-xl hover:shadow-2xl hover:shadow-emerald-900/50 transition-all duration-300 border border-emerald-400/20"
              >
                <span className="flex items-center gap-2">
                  Developer Login
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
                className="text-emerald-400/60 hover:text-emerald-300 text-sm font-medium animate-bounce mt-4"
              >
                Scroll to explore ▼
              </button>
            </motion.div>
          </motion.div>
        </div>

        {/* 2. FEATURES SECTION (Scrolls over background) */}
        <div
          id="features"
          className="min-h-screen py-20 px-6 flex flex-col items-center justify-center pb-12"
        >
          <div className="max-w-7xl mx-auto w-full">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-20"
            >
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                Master the Game
              </h2>
              <p className="text-xl text-gray-400 max-w-2xl mx-auto">
                Built for enthusiasts, by enthusiasts. POKROnline provides the
                complete suite of tools to elevate your game.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <FeatureCard
                delay={0}
                title="Learn"
                icon={Icons.Learn}
                description="New to poker? Interested in learning the rules? We offer comprehensive tutorials and interactive lessons covering everything from hand rankings to advanced game theory concepts."
              />

              <FeatureCard
                delay={0.1}
                title="Play"
                icon={Icons.Play}
                description="Jump into the action instantly. Host private games for your friends or queue up for online matchmaking in 6-Max and Heads-Up formats with zero latency."
              />

              <FeatureCard
                delay={0.2}
                title="Analyze"
                icon={Icons.Analyze}
                description="Don't just play—improve. Analyze your game history after the fact to identify leaks, visualize your win-rate, and understand the mathematics behind your biggest pots."
              />

              <FeatureCard
                delay={0.3}
                title="Practice"
                icon={Icons.Practice}
                description="Refine your strategy without the risk. Get placed in specific scenarios—like navigating a 3-bet pot out of position—and see how you perform against optimal play."
              />
            </div>

            {/* Footer */}
            <div className="mt-12 text-center border-t border-white/10 pt-6">
              <p className="text-emerald-500/40 text-sm">
                © 2025 POKROnline. All cards dealt fairly.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
