# QA4-002: no way to remove the test organisations a run creates (cleanup keeps every org)

- **Severity:** Minor (test hygiene on local and staging; no user-facing effect). Becomes Important on staging if runs pile up.
- **Class:** server / data (by design today: NG-6, append-only audit)
- **Owner agent:** bl-backend (migration and function); bl-architect to approve the exception to "nobody deletes jobs or audit rows".
- **AC:** none. Supports the test rules in decision 0004 (`is_test` tenants, cleaned up after a run).
- **Signature suggestion:** `data:test-org-undeletable-restrict-fk-append-only-audit`

## Steps to reproduce
1. Run the e2e suite locally (`tests/e2e/run-local.sh`); setup creates org `E2E <run id>` with an owner and two technicians.
2. At the end the cleanup project runs `delete from organizations where id = <that org>` with the service role.
3. It is refused; the run prints `orgs deleted 0, kept 2`.

## Expected
A run can remove exactly the `is_test` orgs it created, so a clean run leaves 0 kept.

## Actual (why, from the migrations)
- `jobs.org_id` and `team_members.org_id` are `on delete restrict`, and `jobs.*_member_id` are `restrict` (NG-6: jobs are never deleted).
- `audit_log` and `events` reference the org with `on delete cascade`, but `audit_log` has a `BEFORE UPDATE OR DELETE` trigger (`audit_log_append_only`, BLA06) that raises, so the cascade aborts. Every org with a team member has audit rows, so this applies to all test orgs.
- The service role bypasses RLS, not FKs or triggers. QA cannot change migrations and must not connect as a superuser or disable triggers.

## Proposed fix
A `security definer` function, e.g. `app.purge_test_org(p_org uuid)`, executable by `service_role` only (revoked from `anon`, `authenticated`, `public`). It must refuse unless `organizations.is_test` is true and the name starts with `E2E `, then delete in order: events, audit_log (bypassing the append-only trigger inside the function in a controlled way), jobs, team_members, organization. It should not be reachable from any API route. Tell QA the function name and QA will call it from `cleanupManifest()` (`tests/e2e/support/admin.ts`) and assert 0 kept.

## Evidence
`.baseleap/inputs/qa3-local-run.log` line 478 (`cleanup: … orgs deleted 0, kept 2`); `supabase/migrations/20261114000200_audit_events.sql` (append-only trigger), `…000300_jobs.sql` and `…000100_tenancy_team.sql` (restrict FKs). The next run's log will include a `cleanup problem: org <code>: …` line with the database's own error code, to confirm which constraint fires first.
