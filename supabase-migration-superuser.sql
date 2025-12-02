-- Run this in Supabase SQL Editor
-- Adds super user and debug mode columns to profiles table

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_superuser BOOLEAN DEFAULT false;

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS debug_mode BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_superuser ON profiles(is_superuser);

-- Update the trigger function to include new columns with defaults
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, chips, theme, is_superuser, debug_mode)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    10000,
    'light',
    false,
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


