export interface PreferenceConfig<T = unknown> {
  key: string;                                      // DB column name
  defaultValue: T;
  validate: (value: unknown) => value is T;
  getCSSVars?: (value: T) => Record<string, string>; // Optional CSS var generator
}

export type CardStyle = 'standard' | 'simplified_4color' | 'simplified_2color';

export interface UserPreferences {
  mode: 'light' | 'dark';
  colorTheme: string;
  cardStyle: CardStyle;
}

export type PreferenceName = keyof UserPreferences;
