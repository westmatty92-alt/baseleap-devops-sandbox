# Security Model: Tech Job Board (Northside Plumbing)

**Status:** proposed (locked at Gate 2) · **Reviewed against by:** bl-security (Phase 4) · **Decisions:** 0002 (sign-in), 0004 (tenancy and test isolation), 0005 (write rules in the database)

## System and scope
Covers the Next.js app on Vercel (pages, Server Actions, `/api/*` route handlers, `/auth/confirm`, `middleware.ts`, the service worker), the Supabase project (Postgres, RLS, triggers, functions, Auth settings and email template) and the e2e sign-in helper in CI. It doesn't cover GoHighLevel, Google Calendar or QuickBooks (not connected in v1), the SMTP provider's own security, or Vercel and Supabase platform security.

Data held: customers' names, phone numbers and addresses and free-text notes (on jobs); staff names and emails (on team members). No payments, no passwords, no files.

## Trust boundaries
| Boundary | Untrusted side | Control |
|---|---|---|
| Browser → `/api/*` | body, query, path ids, headers, cookies | `requireMember()` (session → active member) on every handler, then the role check from the matrix below; generated zod schemas, strict (unknown fields rejected); user-scoped Supabase client so RLS applies |
| Browser → sign-in Server Actions and `/auth/confirm` | email, code, token hash, IP | Server-side normalisation; identical outcome for listed and unlisted emails; `hit_rate_limit` per email (1 / 60 s) and per IP (10 / 15 min); Next.js Server Action origin check; confirm needs a POST (prefetch-safe) |
| Browser → Supabase Data API directly (anon key + the user's JWT) | every request; a signed-in technician can call PostgREST themselves | RLS on every table, the guard triggers (`app.jobs_guard`, `app.team_members_guard`), revoked delete and truncate, no client grants on `audit_log`, `events`, `rate_limits`; server-only functions have execute revoked from `anon` and `authenticated` |
| Browser → Supabase Auth directly | OTP requests for any email | Sign-ups disabled, so unlisted emails can't create accounts. Supabase's own 60 s per-email limit. Removed members are banned |
| Service worker → device storage | cached responses | Caches only `/offline` and static shell assets; never `/api/*`, never HTML that contains job data |
| CI → production (e2e) | the service-role key in CI | Held only in the GitHub environment for the e2e job; the helper refuses emails outside an `is_test` org |
| Job and team text → screens | titles, names, addresses, notes typed by people | Rendered as plain text (React text nodes, `white-space: pre-wrap`); no `dangerouslySetInnerHTML`, no markdown, no HTML email of user text |

## Permission matrix
Enforced three times: the API handler (403), RLS (rows) and the guard triggers (columns and transitions). "Own" = `jobs.assigned_member_id` is the caller. Everything is scoped to the caller's org; another org's rows behave as if they don't exist (404 / empty).

| Resource · operation | Signed out | Technician | Owner | Removed member |
|---|---|---|---|---|
| Board / job · read (`GET /board`, `GET /jobs/{id}`) | — (redirect to sign-in) | all jobs in org | all jobs in org | — (401) |
| Job · create (`POST /jobs`) | — | — (403) | ✔, assigned to an active technician of the org (not themselves, OQ-8) | — |
| Job · edit fields, reassign (`PATCH /jobs/{id}`) | — | `notes` only, own, not cancelled | ✔ any field, any job | — |
| Job · status (`PUT /jobs/{id}/status`) | — | own, not cancelled: scheduled / in_progress / done | ✔ any status, including restore from cancelled | — |
| Job · cancel (`POST /jobs/{id}/cancel`) | — | — (403) | ✔ | — |
| Job · delete | — | — (405; DB delete revoked) | — (405; DB delete revoked) | — |
| Team list · read (`GET /team`, emails) | — | — (403; RLS lets them read names for the board, and the API returns names only) | ✔ | — |
| Technicians · read (`GET /technicians`) | — | — (403) | ✔ | — |
| Team · add / reactivate (`POST /team`) | — | — (403) | ✔ technicians only | — |
| Team · remove (`POST /team/{id}/remove`) | — | — (403) | ✔ technicians; never themselves (403) | — |
| Team · delete, change role | — | — | — (no route; trigger refuses role change) | — |
| Events · record (`POST /events`) | — | own `board_viewed` / `board_load_failed` | same | — |
| `audit_log`, `events`, `rate_limits` · read | — | — | — (Baseleap staff with database access only) | — |
| Sign in (request code or link) | ✔ (same response for all) | ✔ | ✔ | refused silently (same response) |

## Security invariants (each must hold; each is checkable)
1. RLS is enabled, with at least one policy, on every table in `public`, in the migration that creates it. Check: `scripts/check-architecture.mjs` and `supabase/tests/rls/*.sql`.
2. `SUPABASE_SERVICE_ROLE_KEY` is read only in `src/lib/server/admin.ts`, and in CI by the e2e setup (`tests/e2e/**`). The admin client is called only from `src/lib/server/services/auth.ts` (active-member lookup by email, sign-in events, ban check), `src/lib/server/services/team.ts` (create, ban, unban and delete-orphan auth users; the cross-org email check) and `scripts/bootstrap-orgs.mjs`. Job reads and writes never use it. The key never appears in client bundles, `NEXT_PUBLIC_*`, logs or fixtures.
3. Every route under `src/app/api/` except `health` rejects requests without a session that maps to an **active** team member (401), and checks the role from the matrix before acting (403). A removed member gets 401 on their next request.
4. The sign-in request gives the same visible outcome and response shape for listed, unlisted, removed and malformed emails, except "wait", which applies the same way to every email, and "failed" during an email-provider outage (accepted risk below). Unlisted emails never reach Supabase Auth.
5. Supabase Auth has sign-ups disabled. Auth users are created only by the team service or the bootstrap script. Every `team_members.user_id` belongs to the auth user with the same email (`BLA05`).
6. A technician can't change any job column except `status` and `notes`, can't touch a job not assigned to them or a cancelled job, and can't set Cancelled. This holds even when they call the Supabase Data API directly. Check: `supabase/tests/rls/jobs.sql`.
7. No one can delete a job, a team member or an audit row: delete is revoked on `jobs` and `team_members`, no delete policies exist, and `audit_log` raises on update or delete.
8. A row in one org is never readable or writable from another org (`org_id = app.current_org_id()` in every policy; assignees must be in the same org). The e2e org's data is invisible to Northside's members, on production too.
9. No personal data in analytics events, audit details or logs: ids, dates, counts, enums, field names and statuses only. `record_client_event` rebuilds the properties server-side and rejects free text.
10. The app makes no calls to GoHighLevel, Google Calendar or QuickBooks, and stores no credentials for them (decision 0007).
11. User-entered text is never interpreted as HTML or markup anywhere it is shown (AC-003.8). No `dangerouslySetInnerHTML` in `src/`.
12. The service worker never caches `/api/*` responses or pages with job data (NG-9). Check: the `public/sw.js` fetch handler only matches the offline route and static assets.
13. No test or debug sign-in path exists in the app on any environment. The only automated sign-in is the CI helper using an admin-generated token for `is_test` org emails (decision 0004).
14. API responses for jobs and the board carry `Cache-Control: no-store`. Response headers on all pages: `X-Frame-Options: DENY` / `frame-ancestors 'none'` (no embedding; no GHL embed in v1), `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff`.

## Auth and sessions
- Supabase Auth email OTP: one email carries a link and a 6-digit code (decision 0002). Single use, 60-minute expiry, 1 request per email per 60 s (ours and Supabase's).
- Sessions: `@supabase/ssr` cookies (`Secure`, `SameSite=Lax`, `Path=/`). Supabase time-box 720 h (Pro), or the middleware cap from `SESSION_MAX_AGE_DAYS`. Refresh tokens are single-use with reuse detection (Supabase default).
- Removal: `is_active = false` stops data access on the next request (RLS helpers return null), and the auth user is banned, which stops refresh and new codes. FR-2's 1 minute is met with margin.
- No GHL embed: the app is never framed (invariant 14), so there are no third-party cookie concerns.

## Personal data
| Data | Where | Who can read | Retention | Deletion request |
|---|---|---|---|---|
| Customer name, phone, address, notes | `jobs` | Active members of the org | Kept (NG-6; OQ-11 open) | Baseleap blanks the fields by hand, using an owner-authorised SQL update. Recorded in the audit trail as `job.updated` field names |
| Staff name, email | `team_members`, `auth.users` | Name: org members. Email: owner (API) and Baseleap | While the client uses the app | Baseleap deactivates the member, then deletes the auth user (`user_id` → null) and replaces the email with a placeholder on request |
| Hashed email / IP | `rate_limits` | Nobody via the API | 1 day | Automatic |
| Ids in events | `events` | Baseleap staff | 13 months | Automatic |

## Finding classes (what counts as a problem here)
- **Critical:** a technician changing a field other than status or notes, or another technician's job; any job or team delete; cross-org read or write; reading data while signed out or after removal; any sign-in bypass or test login path in the app; service-role key in client code or logs; sign-up enabled.
- **Important:** listed and unlisted emails distinguishable by response or timing beyond the accepted outage case; missing rate limit on sign-in or `/api/events`; PII in logs, events or audit details; API responses cached by the service worker or the browser; HTML injection through job text.
- **Minor:** missing security headers on static pages; verbose error details (SQL text, stack) in problem+json.

## Out of scope / accepted risk
- **Outage enumeration:** while the email provider is down, a listed email gets "We couldn't send the link" and an unlisted one gets "sent" (AC-001.8 requires the message). Accepted: outage-only, and still rate-limited.
- **Timing:** the listed path calls Supabase Auth, so it is slower than the unlisted path. Mitigation: the server pads every sign-in request to a minimum response time of 1.5 s. Residual risk accepted.
- **Technicians can read team member emails** through the Data API (RLS allows reading the team list, PRD decision 0003 "everyone reads the team list"). The API returns emails only to the owner. Accepted for a 4-person team. Tightening it would need a view or a column split (raise as a change if wanted).
- **Shared phones:** a 30-day session on an unlocked phone shows customer data to whoever holds it. Accepted. Mitigated by sign-out and by removal.
- **Compromise of a team member's mailbox** gives sign-in. Accepted (inherent to email sign-in, NG-12).

## Known limitations & compensating controls
- **iPhone installed app:** links open in Safari. Compensating control: the 6-digit code typed inside the installed app (AC-005.4, verified by hand on a real iPhone).
- **Session cap needs Supabase Pro:** if the org is on Free, `middleware.ts` enforces 30 days from the session's start and signs the person out.
- **Service-role key in CI** for e2e sign-in: limited to the e2e job's GitHub environment. The helper refuses non-test emails. Rotate the key if CI is compromised.
