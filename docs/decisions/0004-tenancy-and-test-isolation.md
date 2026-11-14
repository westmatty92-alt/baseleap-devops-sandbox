# 0004 — Tenancy, and keeping automated tests off the real board

**Status:** proposed
**Date:** 2026-11-14
**Driven by:** FR-15, FR-18 · US-006 (AC-006.5, AC-006.6) · PRD OQ-9, Roles & permissions ("keep the tenant boundary in the data model") · metrics-spec "test accounts identifiable"
**Implemented in:** `supabase/migrations/20261114000100_tenancy_team.sql` (`organizations`, `org_id` everywhere) · `supabase/tests/rls/*.sql` · `tests/e2e/**` helper (QA) · bootstrap script (backend + devops)

## Context
`npm run e2e` must run the owner → Tech A → Tech B loop on staging and production, sign in without a person reading email, and leave nothing visible to the client's real team (AC-006.6). Jobs can't be deleted (NG-6), so test jobs on the real board would stay forever. Any sign-in shortcut must be unusable by real users on production. The PRD also asks for a tenant boundary even though v1 has one client.

## Decision
1. **Every tenant-owned table carries `org_id`**, and every RLS policy checks it through `app.current_org_id()`. A person belongs to exactly one org; their email decides which.
2. **The e2e suite runs in its own org.** Each environment has a second org, "Baseleap E2E", with `is_test = true`, its own owner and two technicians on test addresses. Test jobs live there. RLS makes them invisible to Northside's team, on production too, which meets AC-006.6 without deleting anything. Events from this org carry `is_test = true` and are excluded from metrics.
3. **Tests sign in without email, and without any code path in the app.** The Playwright setup project uses the service-role key, held only as a CI secret, to call `auth.admin.generateLink({ type: 'magiclink', email })`. That returns a one-time token and sends no email. The setup then opens `/auth/confirm` with that token, like a person tapping the link. Before generating, the helper checks that the email belongs to an `is_test` org and refuses otherwise. The app itself has no test login route, no password path and no bypass flag.
4. **Bootstrap.** Both orgs and their owners are created by a one-off bootstrap script run by devops with the service role. The real owner's email comes from Matthew (PRD Dependencies). The e2e technicians are added the same way. Re-running the script makes no changes if the rows already exist.

## Alternatives considered
### Test jobs on the real board, cancelled afterwards (OQ-9 option B)
- **Pros:** tests the exact real data path.
- **Cons:** cancelled jobs stay visible forever (NG-6), and the client sees test noise every day.
- **Why not:** fails AC-006.6.

### A test-only sign-in route enabled by an environment flag
- **Pros:** simple for QA.
- **Cons:** one wrong flag on production is an auth bypass for everyone.
- **Why not:** the PRD's stop-and-escalate list forbids a production sign-in shortcut.

### Reading the email from a test inbox (Mailosaur and similar)
- **Pros:** fully black-box.
- **Cons:** paid service, slower and flaky, and it uses up the daily send cap.
- **Why not:** cost, and the admin-generated token tests the same confirm path.

## Consequences
- **Easier:** repeatable runs (AC-006.5); a second client later needs no schema change.
- **Harder:** the CI secret store holds the service-role key for staging and production. That key is already a server-side secret; CI access is limited to the e2e job's environment (devops).
- **Cost:** none.
- **Risks:** the e2e org drifts from real behaviour → it runs the same code and policies; only the data differs. → Service-role key leak from CI → GitHub environment protection and secret scanning (bl-security), and rotate on any suspicion.

## Sources
- Supabase `auth.admin.generateLink` (generates links and OTPs for sending through your own channel): https://supabase.com/docs/reference/javascript/auth-admin-generatelink (read 2026-11-14)
