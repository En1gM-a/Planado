# Google Calendar Edge Function setup

This function keeps Google provider tokens off the phone and encrypts them before database storage.

1. Enable **Google Calendar API** in the same Google Cloud project used by Supabase Auth.
2. Add `https://www.googleapis.com/auth/calendar.readonly` to the OAuth consent screen data-access scopes.
3. Add Planado testers while the Google OAuth app is in testing mode.
4. Create a long random encryption secret and configure the function secrets:

```powershell
npx supabase secrets set GOOGLE_CLIENT_ID="YOUR_GOOGLE_WEB_CLIENT_ID" GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_WEB_CLIENT_SECRET" GOOGLE_TOKEN_ENCRYPTION_KEY="A_LONG_RANDOM_SECRET"
```

5. Deploy the function with JWT verification enabled:

```powershell
npx supabase functions deploy google-calendar
```

Never put the Google client secret or token encryption secret in `.env`, `app.json`, EAS public variables, or the mobile app.
