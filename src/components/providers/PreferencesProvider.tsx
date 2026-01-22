"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { createClientComponentClient } from "@/lib/api/supabase/client";
import { Theme, THEMES, getTheme } from "@/lib/features/theme/themes";
import { UserPreferences } from "@/lib/features/preferences/types";
import { PREFERENCE_REGISTRY, generateAllCSSVars } from "@/lib/features/preferences/registry";

interface PreferencesContextType {
  // New preferences API
  preferences: UserPreferences;
  setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => Promise<void>;
  isLoading: boolean;
  // Convenience accessors
  mode: 'light' | 'dark';
  setMode: (m: 'light' | 'dark') => Promise<void>;
  colorTheme: string;
  setColorTheme: (t: string) => Promise<void>;
  // Backward compatibility with useTheme hook
  currentTheme: Theme;
  setTheme: (themeId: string) => Promise<void>;
  availableThemes: Theme[];
}

const PreferencesContext = createContext<PreferencesContextType>({
  preferences: {
    mode: PREFERENCE_REGISTRY.mode.defaultValue,
    colorTheme: PREFERENCE_REGISTRY.colorTheme.defaultValue,
  },
  setPreference: async () => {},
  isLoading: false,
  mode: PREFERENCE_REGISTRY.mode.defaultValue,
  setMode: async () => {},
  colorTheme: PREFERENCE_REGISTRY.colorTheme.defaultValue,
  setColorTheme: async () => {},
  currentTheme: getTheme(PREFERENCE_REGISTRY.colorTheme.defaultValue),
  setTheme: async () => {},
  availableThemes: THEMES,
});

export const usePreferences = () => useContext(PreferencesContext);

// Backward compatible hook - export useTheme for existing components
export const useTheme = () => {
  const ctx = usePreferences();
  return {
    currentTheme: ctx.currentTheme,
    setTheme: ctx.setTheme,
    isLoading: ctx.isLoading,
    availableThemes: ctx.availableThemes,
  };
};

interface PreferencesProviderProps {
  children: React.ReactNode;
  initialPreferences?: Partial<UserPreferences>;
}

export function PreferencesProvider({ children, initialPreferences }: PreferencesProviderProps) {
  const [preferences, setPreferences] = useState<UserPreferences>({
    mode: initialPreferences?.mode ?? PREFERENCE_REGISTRY.mode.defaultValue,
    colorTheme: initialPreferences?.colorTheme ?? PREFERENCE_REGISTRY.colorTheme.defaultValue,
  });
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClientComponentClient();

  // Apply CSS vars for all preferences that have them
  const applyCSSVars = useCallback((prefs: UserPreferences) => {
    const vars = generateAllCSSVars(prefs as unknown as Record<string, unknown>);
    const root = document.documentElement;
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  }, []);

  // Apply mode (light/dark class)
  const applyMode = useCallback((mode: 'light' | 'dark') => {
    document.documentElement.classList.toggle('dark', mode === 'dark');
  }, []);

  // Generic preference setter
  const setPreference = useCallback(async <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => {
    const config = PREFERENCE_REGISTRY[key];
    if (!config.validate(value)) {
      console.warn(`Invalid value for preference ${key}:`, value);
      return;
    }

    // Optimistic update
    setPreferences(prev => {
      const next = { ...prev, [key]: value };
      // Always apply CSS vars (handles preferences with getCSSVars)
      applyCSSVars(next);
      if (key === 'mode') applyMode(value as 'light' | 'dark');
      return next;
    });

    // Persist to DB
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error } = await supabase
          .from("profiles")
          .update({ [config.key]: value })
          .eq("id", user.id);

        if (error) {
          console.error(`Error saving preference ${key}:`, error);
        }
      }
    } catch (error) {
      console.error(`Error saving preference ${key}:`, error);
    }
  }, [supabase, applyCSSVars, applyMode]);

  // Load preferences on auth state change (login/logout)
  useEffect(() => {
    const loadPreferences = async () => {
      setIsLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from("profiles")
            .select("theme, color_theme")
            .eq("id", user.id)
            .single();

          if (error) {
            console.error("Error loading preferences:", error);
          } else if (data) {
            const newPrefs: UserPreferences = {
              mode: PREFERENCE_REGISTRY.mode.validate(data.theme) ? data.theme : PREFERENCE_REGISTRY.mode.defaultValue,
              colorTheme: PREFERENCE_REGISTRY.colorTheme.validate(data.color_theme) ? data.color_theme : PREFERENCE_REGISTRY.colorTheme.defaultValue,
            };
            setPreferences(newPrefs);
            applyCSSVars(newPrefs);
            applyMode(newPrefs.mode);
          }
        } else {
          // Not logged in, use defaults
          const defaultPrefs: UserPreferences = {
            mode: PREFERENCE_REGISTRY.mode.defaultValue,
            colorTheme: PREFERENCE_REGISTRY.colorTheme.defaultValue,
          };
          setPreferences(defaultPrefs);
          applyCSSVars(defaultPrefs);
          applyMode(defaultPrefs.mode);
        }
      } catch (error) {
        console.error("Error loading preferences:", error);
      } finally {
        setIsLoading(false);
      }
    };

    // Listen for auth state changes (login/logout) - only reload on actual changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      // Only reload preferences on login/logout, not on token refresh
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        loadPreferences();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, applyCSSVars, applyMode]);

  const currentTheme = getTheme(preferences.colorTheme);

  const value: PreferencesContextType = {
    preferences,
    setPreference,
    isLoading,
    // Convenience accessors
    mode: preferences.mode,
    setMode: (m: 'light' | 'dark') => setPreference('mode', m),
    colorTheme: preferences.colorTheme,
    setColorTheme: (t: string) => setPreference('colorTheme', t),
    // Backward compatibility
    currentTheme,
    setTheme: (themeId: string) => setPreference('colorTheme', themeId),
    availableThemes: THEMES,
  };

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}
