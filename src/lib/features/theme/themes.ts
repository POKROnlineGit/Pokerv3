export interface Theme {
  id: string; // The key stored in the DB
  name: string;
  description: string;
  colors: {
    primary: string[];   // Main felt colors
    secondary: string[]; // UI elements/borders
    gradient: string[];  // Background gradients (deprecated, kept for compatibility)
    accent: string[];    // Highlights/Buttons
    background: string;  // Simple background color (propagates to all pages)
  };
}

export const THEMES: Theme[] = [
    {
      id: "emerald_felt",
      name: "Emerald Felt",
      description: "Green and black - matches current coming soon page",
      colors: {
        primary: ["#047857", "#065F46", "#064E3B", "#022C22"], // Updated to match accent tone
        secondary: ["#06B6D4", "#0891B2", "#0E7490"],
        gradient: ["#064E3B", "#022C22", "#000000"],
        accent: ["#047857", "#065F46", "#064E3B"], // Further toned down - darker, more muted greens
        background: "#1F2937", // Simple gray background
      },
    },
    {
      id: "emerald_felt_dark",
      name: "Emerald Felt - Darker",
      description: "Deeper, moodier green - more sophisticated poker room feel",
      colors: {
        primary: ["#065F46", "#064E3B", "#022C22", "#021713"], // Updated to match accent tone
        secondary: ["#0E7490", "#0C4A6E", "#075985"],
        gradient: ["#022C22", "#021713", "#000000"],
        accent: ["#065F46", "#064E3B", "#022C22"], // Further toned down - darker, more muted greens
        background: "#1F2937", // Simple gray background
      },
    },
    {
      id: "emerald_felt_bright",
      name: "Emerald Felt - Bright",
      description: "Vibrant green - energetic and modern poker table",
      colors: {
        primary: ["#047857", "#065F46", "#064E3B", "#022C22"], // Updated to match accent tone
        secondary: ["#22D3EE", "#06B6D4", "#0891B2"],
        gradient: ["#047857", "#064E3B", "#000000"],
        accent: ["#047857", "#065F46", "#064E3B"], // Further toned down - darker, more muted greens
        background: "#1F2937", // Simple gray background
      },
    },
  {
    id: "maroon_royal",
    name: "Maroon Royal",
    description: "Maroon, red, and black - matches current site primary colors",
    colors: {
      primary: ["#9A1F40", "#861A38", "#6B152C", "#5B1125"],
      secondary: ["#7F1D1D", "#6B152C", "#5B1125"],
      gradient: ["#7F1D1D", "#450A0A", "#000000"],
      accent: ["#861A38", "#9A1F40", "#6B152C"],
      background: "#1F2937", // Simple gray background
    },
  },
  {
    id: "maroon_royal_deep",
    name: "Maroon Royal - Deep",
    description: "Darker maroon - luxurious high-stakes room atmosphere",
    colors: {
      primary: ["#7F1D1D", "#6B152C", "#5B1125", "#450A0A"],
      secondary: ["#6B152C", "#5B1125", "#450A0A"],
      gradient: ["#5B1125", "#3F0A0A", "#000000"],
      accent: ["#6B152C", "#7F1D1D", "#5B1125"],
      background: "#1F2937", // Simple gray background
    },
  },
  {
    id: "maroon_royal_crimson",
    name: "Maroon Royal - Crimson",
    description: "Brighter red tones - bold and confident casino vibe",
    colors: {
      primary: ["#DC2626", "#B91C1C", "#991B1B", "#7F1D1D"],
      secondary: ["#991B1B", "#7F1D1D", "#6B152C"],
      gradient: ["#991B1B", "#7F1D1D", "#000000"],
      accent: ["#B91C1C", "#DC2626", "#991B1B"],
      background: "#1F2937", // Simple gray background
    },
  },
  {
    id: "golden_casino",
    name: "Golden Casino",
    description: "Gold, amber, and black - classic poker table and casino aesthetic",
    colors: {
      primary: ["#D97706", "#B45309", "#92400E", "#78350F"],
      secondary: ["#DC2626", "#B91C1C", "#991B1B"],
      gradient: ["#78350F", "#451A03", "#000000"],
      accent: ["#F59E0B", "#FBBF24", "#FCD34D"],
      background: "#1F2937", // Simple gray background
    },
  },
];

export const DEFAULT_THEME_ID = "emerald_felt";

export const getTheme = (id?: string | null): Theme => {
  return THEMES.find((t) => t.id === id) || THEMES.find(t => t.id === DEFAULT_THEME_ID)!;
};

