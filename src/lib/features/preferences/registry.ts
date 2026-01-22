import { THEMES, getTheme } from '../theme/themes';
import { PreferenceConfig } from './types';

export const PREFERENCE_REGISTRY = {
  mode: {
    key: 'theme',
    defaultValue: 'dark' as const,
    validate: (v: unknown): v is 'light' | 'dark' => v === 'light' || v === 'dark',
    // Uses Tailwind .dark class, no CSS vars needed
  },
  colorTheme: {
    key: 'color_theme',
    defaultValue: 'emerald_felt',
    validate: (v: unknown): v is string => typeof v === 'string' && THEMES.some(t => t.id === v),
    getCSSVars: (value: unknown) => {
      const themeId = typeof value === 'string' ? value : 'emerald_felt';
      const theme = getTheme(themeId);
      const vars: Record<string, string> = {};
      theme.colors.primary.forEach((c, i) => vars[`--theme-primary-${i}`] = c);
      theme.colors.secondary.forEach((c, i) => vars[`--theme-secondary-${i}`] = c);
      theme.colors.accent.forEach((c, i) => {
        vars[`--theme-accent-${i}`] = c;
        // Alpha variants for UI elements (20% and 80% opacity)
        vars[`--theme-accent-${i}-20`] = c + '33';
        vars[`--theme-accent-${i}-cc`] = c + 'CC';
      });
      theme.colors.gradient.forEach((c, i) => vars[`--theme-gradient-${i}`] = c);
      vars['--theme-background'] = theme.colors.background;
      return vars;
    },
  },
} satisfies Record<string, PreferenceConfig>;

// Helper: Get DB column names for SELECT query
export function getPreferenceColumns(): string[] {
  return Object.values(PREFERENCE_REGISTRY).map(p => p.key);
}

// Helper: Generate all CSS vars from preferences
export function generateAllCSSVars(preferences: Record<string, unknown>): Record<string, string> {
  const allVars: Record<string, string> = {};
  for (const [name, config] of Object.entries(PREFERENCE_REGISTRY)) {
    if ('getCSSVars' in config && typeof config.getCSSVars === 'function') {
      const value = preferences[name] ?? config.defaultValue;
      Object.assign(allVars, config.getCSSVars(value));
    }
  }
  return allVars;
}

// Helper: Generate blocking script for SSR (XSS-safe)
export function generateCSSVarsScript(cssVars: Record<string, string>): string {
  // Only allow valid hex color values to prevent XSS
  const hexColorRegex = /^#[0-9A-Fa-f]{3,8}$/;
  return Object.entries(cssVars)
    .filter(([, v]) => hexColorRegex.test(v))
    .map(([k, v]) => `s.setProperty('${k}','${v}')`)
    .join(';');
}
