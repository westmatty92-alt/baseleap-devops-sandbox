# 0005 — Write rules, concurrency, idempotency and audit live in the database

**Status:** proposed
**Date:** 2026-11-14
**Driven by:** FR-2, FR-9, FR-10, FR-11, FR-14, FR-18 · AC-003.6, AC-007.4, AC-007.8, AC-007.9, AC-008.6, AC-009.5 · metrics-spec "server side, no double fire" · design-specs contract question 2
**Implemented in:** `supabase/migrations/20261114000200_audit_events.sql` · `supabase/migrations/20261114000300_jobs.sql` · `docs/openapi.yaml` (`version`, `client_request_id`, 409 `stale_version`)

## Context
A technician may change only status and notes, only on their own jobs, and never a cancelled one (FR-9, FR-11). RLS can say which rows a person may update, but not which columns. Saves from an old view must be refused (FR-14). A double tap must create one job and record one change (AC-003.6, AC-007.9). Every change must record who and when (FR-18), and events must fire server-side exactly once. Supabase's Data API is reachable from the browser with the user's own token, so any rule that lives only in route handlers can be skipped.

## Decision
- **Column rules in a trigger.** `app.jobs_guard()` runs before every insert and update on `jobs`. It refuses technician changes to anything but `status` and `notes`, refuses Cancelled for technicians, keeps ids immutable, checks the assignee is an active technician of the same org, and forces new jobs to Scheduled. It raises named SQLSTATEs (`BLA01` to `BLA05`) that the API maps to responses (`docs/architecture.md` "Error mapping").
- **Optimistic concurrency with `version`.** Each real change increments `jobs.version`, done by the trigger. Every write from the API carries the version the screen was showing and updates `where id = $1 and version = $2`. No row updated, but the job is visible → 409 `stale_version`, with the latest job in the body.
- **Idempotency.** Create carries a `client_request_id` generated when the form opens (unique per org). A repeat returns the job already created, with 200. Setting a status the job already has, or cancelling a cancelled job, is a 200 no-op whatever the version, so a double tap or an old view records nothing twice. A no-op update leaves `version` alone.
- **Audit and events by trigger.** `app.jobs_record_change()` and `app.team_members_record_change()` write `audit_log` (append-only) and `events` in the same transaction as the change. They hold ids, field names and statuses only. A change is recorded exactly when it is saved, whatever code path made it.
- **The day board is one list, not paged.** The house convention is cursor pagination on every list. The board deliberately returns the whole day (FR-6: at least 50 jobs, "no page 2", AC-004.7), with a server cap of 500 and a `truncated` flag. The team and technician lists follow the convention.

## Alternatives considered
### Rules in route handlers only
- **Pros:** one language; easier to unit test.
- **Cons:** a technician with their own token can PATCH `/rest/v1/jobs` directly and change the address.
- **Why not:** FR-2 says "enforced by the system… and in the database".

### Column-level GRANTs instead of a trigger
- **Pros:** declarative.
- **Cons:** owner and technician are the same Postgres role (`authenticated`), so grants can't tell them apart.
- **Why not:** doesn't express the rule.

### `updated_at` timestamp as the concurrency token
- **Pros:** no extra column.
- **Cons:** timestamp precision and clock issues; a no-op save would still move it.
- **Why not:** an integer is exact and easy to send in a form.

## Consequences
- **Easier:** the backend can't forget an audit row or an event; RLS tests prove the rules (`supabase/tests/rls/jobs.sql`).
- **Harder:** some logic lives in PL/pgSQL, which the backend must read. Error codes are part of the contract between the database and the API.
- **Cost:** none.
- **Risks:** trigger bugs block writes → covered by RLS tests in CI on the Supabase preview branch (scaffold step, `npm run db:test`).

## Sources
- PostgreSQL row security (policies apply after BEFORE triggers' changes; WITH CHECK on the new row): https://www.postgresql.org/docs/current/ddl-rowsecurity.html (read 2026-11-14)
