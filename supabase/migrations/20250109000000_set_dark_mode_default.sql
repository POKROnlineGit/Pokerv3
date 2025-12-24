-- Set dark mode as default for new users
-- This updates the handle_new_user function to set theme to 'dark' instead of 'light'

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, chips, theme, color_theme)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    10000,
    'dark', -- Changed from 'light' to 'dark' as default
    'emerald_felt' -- Default for color theme
  );
  RETURN NEW;
END;
$$;

