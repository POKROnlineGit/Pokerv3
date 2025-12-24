-- Add color_theme column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS color_theme text DEFAULT 'emerald_felt' NOT NULL;

-- Update handle_new_user function to include color_theme
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, username, chips, theme, color_theme)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    10000,
    'light',
    'emerald_felt'
  );
  RETURN NEW;
END;
$$;

-- Set default for existing users who don't have color_theme set
UPDATE public.profiles 
SET color_theme = 'emerald_felt' 
WHERE color_theme IS NULL;

