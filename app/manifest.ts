import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "pokronline - Learn & Play Poker",
    short_name: "pokronline",
    description:
      "Real-time multiplayer Texas Holdem poker. Play with friends or bots instantly.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#10b981",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
