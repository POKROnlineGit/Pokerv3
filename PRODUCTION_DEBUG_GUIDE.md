# Production Debug Guide - Super User Redirect Issue

## Problem

Super users are being redirected to `/coming-soon` in production even after signing in, but it works locally.

## Possible Causes

### 1. **Database State Issue**

The `is_superuser` field might not be set to `true` in your production database.

**Check:**

```sql
-- Run this in Supabase SQL Editor (production)
SELECT id, username, email, is_superuser, debug_mode
FROM profiles
WHERE id = 'your-user-id';
```

**Fix:**

```sql
-- Set yourself as super user
UPDATE profiles
SET is_superuser = true
WHERE id = 'your-user-id';
```

### 2. **RLS Policy Issue**

The middleware uses the anon key, so it needs RLS policies that allow reading profiles.

**Check:** The policy `"Users can view all profiles"` with `USING (true)` should work, but verify it exists in production.

### 3. **Cookie/Session Issue**

Production might have different cookie settings (domain, secure, sameSite).

**Check:**

- Vercel environment variables are set correctly
- `NEXT_PUBLIC_SITE_URL` is set to your production domain
- Cookies are being set with correct domain

### 4. **Error in Middleware Query**

The profile query might be failing silently.

**Check:** Look at Vercel function logs for the error message we added:

```
[Middleware] Profile query error: ...
```

## Debugging Steps

1. **Check Vercel Logs:**

   - Go to Vercel Dashboard → Your Project → Functions
   - Look for middleware execution logs
   - Check for the error message: `[Middleware] Profile query error:`

2. **Verify Database:**

   ```sql
   -- Check if your user exists and is super user
   SELECT id, username, is_superuser
   FROM profiles
   WHERE id IN (
     SELECT id FROM auth.users WHERE email = 'your-email@example.com'
   );
   ```

3. **Test Middleware Directly:**

   - Add temporary logging to see what's happening
   - Check if `getUser()` is returning the user
   - Check if the profile query is succeeding

4. **Environment Variables:**
   - Verify `NEXT_PUBLIC_SUPABASE_URL` is correct
   - Verify `NEXT_PUBLIC_SUPABASE_ANON_KEY` is correct
   - Verify `NEXT_PUBLIC_SITE_URL` is set to `https://pokronline.com`

## Quick Fix

If you just need to get in quickly, you can temporarily bypass the middleware check by adding your user ID to an allowlist, but this is NOT recommended for production.

## Next Steps

1. Check Vercel logs for the error message
2. Verify your user has `is_superuser = true` in production database
3. Check that RLS policies are correctly applied in production
4. Verify environment variables are set correctly in Vercel
