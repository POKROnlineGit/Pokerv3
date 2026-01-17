"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClientComponentClient } from "@/lib/api/supabase/client";
import { Theme, THEMES, DEFAULT_THEME_ID, getTheme } from "@/lib/features/theme/themes";

interface ThemeContextType {
  currentTheme: Theme;
  setTheme: (themeId: string) => Promise<void>;
  isLoading: boolean;
  availableThemes: Theme[];
}

const ThemeContext = createContext<ThemeContextType>({
  currentTheme: getTheme(DEFAULT_THEME_ID),
  setTheme: async () => {},
  isLoading: true,
  availableThemes: THEMES,
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentThemeId, setCurrentThemeId] = useState<string>(DEFAULT_THEME_ID);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClientComponentClient();

  // Load theme preference on mount and when auth state changes
  const loadTheme = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from("profiles")
          .select("color_theme")
          .eq("id", user.id)
          .single();

        if (error) {
          console.error("Error loading theme:", error);
        } else if (data?.color_theme) {
          // Validate theme exists, fallback to default if invalid
          const themeExists = THEMES.some(t => t.id === data.color_theme);
          setCurrentThemeId(themeExists ? data.color_theme : DEFAULT_THEME_ID);
        }
      } else {
        // Not logged in, use default
        setCurrentThemeId(DEFAULT_THEME_ID);
      }
    } catch (error) {
      console.error("Error loading theme:", error);
      setCurrentThemeId(DEFAULT_THEME_ID);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadTheme();

    // Listen for auth state changes (login/logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadTheme();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadTheme, supabase]);

  // Handle theme change
  const setTheme = useCallback(async (themeId: string) => {
    // Validate theme exists
    const themeExists = THEMES.some(t => t.id === themeId);
    if (!themeExists) {
      console.warn(`Theme ${themeId} not found, using default`);
      return;
    }

    // Optimistic update
    setCurrentThemeId(themeId);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase
          .from("profiles")
          .update({ color_theme: themeId })
          .eq("id", user.id);

        if (error) {
          console.error("Error saving theme preference:", error);
          // Revert on error
          loadTheme();
        }
      }
    } catch (error) {
      console.error("Error saving theme preference:", error);
      // Revert on error
      loadTheme();
    }
  }, [supabase, loadTheme]);

  const currentTheme = getTheme(currentThemeId);

  return (
    <ThemeContext.Provider
      value={{
        currentTheme,
        setTheme,
        isLoading,
        availableThemes: THEMES,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

