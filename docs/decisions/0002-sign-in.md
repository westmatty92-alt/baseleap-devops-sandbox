# 0002 — Sign-in: one email with a link and a 6-digit code, pre-provisioned users, server-side gate

**Status:** proposed
**Date:** 2026-11-14
**Driven by:** FR-1, FR-2, FR-8, FR-13 · US-001, US-005 (AC-005.4), US-011 · PRD OQ-10 · design-specs "Contract questions" item 1
**Implemented in:** `supabase/migrations/20261114000100_tenancy_team.sql` · `supabase/migrations/20261114000400_sign_in_rate_limits.sql` · `src/lib/server/services/auth.ts` · `src/app/(auth)/**` · `src/app/auth/confirm/route.ts` · `docs/architecture.md` "Sign-in (outside the JSON API)"

## Context
Only listed, active team members may sign in, by email, with no password (FR-1). The response must not reveal whether an email is listed, links work once and expire after 60 minutes, one request per email per 60 seconds, sessions last 30 days, and a removed person loses access within a minute (FR-2, FR-13). On iPhone, a web app added to the home screen keeps its own cookie storage, separate from Safari, so a link opened from the Mail app signs the person into Safari, not the installed app (OQ-10, AC-005.4).

## Decision
1. **One email, two ways in.** The Supabase "Magic Link" template carries both a link (`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`) and the 6-digit code (`{{ .Token }}`). In a browser tab, the person taps the link. In the installed iPhone app, they type the code on SCR-01, which completes the sign-in inside the installed app. Both expire after 60 minutes (Supabase default OTP expiry 3600 s) and are single-use.
2. **The link confirms on a button press, not on page load.** `/auth/confirm` shows a "Sign in" button that posts the token. Email scanners that prefetch links therefore can't use up the one-time token.
3. **Users are pre-provisioned; sign-ups are off.** "Allow new users to sign up" is disabled in Supabase Auth. When the owner adds a technician, the server creates the auth user with the admin API (`email_confirm: true`, no email sent) and links it to the `team_members` row. Sign-in calls `signInWithOtp` with `shouldCreateUser: false`.
4. **The server decides, and every outcome looks the same.** The sign-in form posts to a Next.js Server Action that calls `requestSignIn(email)` in `src/lib/server/services/auth.ts`. That function trims and lowercases the email, then applies the same rate limits to every address, listed or not (`public.hit_rate_limit`: 1 per email per 60 s, 10 per IP per 15 min). Only after that does it look up an active team member, and it calls Supabase Auth only for a listed one. Unlisted and listed emails get the same "sent" outcome. Supabase is never reachable for unlisted emails through our UI.
5. **Removal is immediate in data.** Every RLS policy resolves the caller through `app.current_member_id()`, which returns null for an inactive member, so a removed person reads nothing on their next request. The server also bans the auth user (`ban_duration`), which blocks refresh and new codes. Re-adding lifts the ban.
6. **Sessions:** `@supabase/ssr` cookies. Supabase "Time-box user sessions" is set to 720 h (30 days), which is a Pro-plan feature. If the org is not on Pro, the middleware enforces the 30 days from the session's `created_at` in our cookie and signs out after that.
7. **Sign-in is outside the JSON API.** The three sign-in steps (request, verify code, confirm link) happen before there is a session, so they are Server Actions and one route handler, specified in `docs/architecture.md`, not operations in `docs/openapi.yaml`. Every `/api/*` operation needs a session.

## Alternatives considered
### Magic link only, accept Safari (OQ-10 option B)
- **Pros:** the simplest flow; no extra field on SCR-01.
- **Cons:** on iPhone the installed app stays signed out. The person has to sign in in Safari and add the app to the home screen afterwards, and iOS copies cookies only once, at install time.
- **Why not:** fails AC-005.4, and technicians are the people this app is for.

### Browser calls Supabase Auth directly (`signInWithOtp` from the client)
- **Pros:** no server code for sign-in.
- **Cons:** with sign-ups disabled, Supabase answers an unlisted email with an error, so anyone watching the network can tell who is on the team (breaks FR-1 and AC-001.3).
- **Why not:** fails FR-1's "identical response".

### Sign-ups on, with a "before user created" auth hook that rejects unlisted emails
- **Pros:** no admin API call when adding a person.
- **Cons:** the hook's rejection is still a different response, and it's one more thing to deploy and secure.
- **Why not:** same enumeration problem, more moving parts.

### Passwords for test accounts
- **Pros:** easy automated sign-in.
- **Cons:** turns on a password sign-in path on production for everyone (NG-12, and a "sign-in shortcut").
- **Why not:** decision 0004 signs tests in with admin-generated codes instead.

## Consequences
- **Easier:** works the same on Android, desktop and iPhone; no shortcut exists in the app.
- **Harder:** SCR-01 needs a code-entry step after "sent". The designer said they'd add it if the method needs one (design-specs, contract question 1). This is a design change before Gate 2 closes. The service-role key is needed in the team service (create, ban and unban users).
- **Cost:** none in itself. Sending the email needs the SMTP account in decision 0003.
- **Risks:** when the email service is down, listed emails show "couldn't send" while unlisted ones show "sent" (AC-001.8 requires the message). That leaks during outages only. Accepted and recorded in `docs/SECURITY_MODEL.md`. → Attackers trying codes: Supabase rate-limits verification attempts. The 6-digit code expires in 60 minutes, and a new request replaces it.

## Sources
- Supabase passwordless email (OTP vs link, `shouldCreateUser`, 60 s request limit, 1 h expiry): https://supabase.com/docs/guides/auth/auth-email-passwordless (read 2026-11-14)
- Supabase email templates (`{{ .Token }}`, `{{ .TokenHash }}`, `{{ .ConfirmationURL }}`; prefetching problem): https://supabase.com/docs/guides/auth/auth-email-templates (read 2026-11-14)
- Supabase sessions (time-box and inactivity timeout are Pro-plan features; refresh tokens single-use): https://supabase.com/docs/guides/auth/sessions (read 2026-11-14)
- iOS home-screen apps keep separate storage from Safari: WebKit bug 181849 https://bugs.webkit.org/show_bug.cgi?id=181849 and https://progressier.com/pwa-capabilities/cookies-demo (read 2026-11-14; to be confirmed on a real iPhone, AC-005.4)
