# STEP BE-EC1 — expand/contract drill, release 1 of 2: rename `jobs.notes` → `jobs.details` (EXPAND)

Agent: bl-backend · Skills: be-data, be-services, be-testing (and ops-release §3, read only)

## Goal
Rename the database column `public.jobs.notes` to `public.jobs.details` without a single failed request while
either app version is live. The **API contract does not change**: the JSON field stays `notes` (only the column is renamed).
This is release 1 (expand). Release 2 (contract: drop `notes`) is a later step, after release 1 is live.

## Release 1 must contain
1. **Migration** `supabase/migrations/<timestamp>_jobs_details_expand.sql` (one file, additive only):
   - add `details text` with the **same check** as `notes` (null, or 1–2000 chars);
   - backfill `details = notes` where `details is null` (small table: one statement is fine; say so);
   - a trigger keeping the two in sync on insert/update **in both directions** (old app writes `notes`, new app writes
     `details`; whichever was set wins; if both are set and differ on an update, the changed one wins). Make sure it
     doesn't fight the existing `version`-bump trigger (FR-14: one real change = one version bump) or the guard
     trigger on inserts. Read the existing jobs migration first.
   - nothing dropped, renamed or made NOT NULL. No data loss.
2. **App code**: reads and writes `details` only (select lists, inserts, updates, mapping to the API's `notes` field).
3. **Tests** (be-testing), runnable locally:
   - the trigger: write via `notes` → read `details`; write via `details` → read `notes`; one update = one version bump;
   - the existing jobs tests still pass with the new code.
4. Note in `docs/ops/pipeline-drills.md` → Planted breaks/notes: nothing planted; record that release 2 must drop the trigger, then the column.

## Local database
You may run the local stack for this repo only: `npx supabase start`, `npx supabase db reset` (local), `npx supabase stop`.
This repo's `supabase/config.toml` uses its own ports (554xx) and project id. **Never touch any other container**
(especially `supabase_*_moravian-portal-local`). If ports clash or Docker isn't available, stop and report; don't change config.
Remote database commands are refused by the guard: don't try them.

## Verify
`npm test` (and the db tests you add) green locally; `npx tsc --noEmit -p .` clean. Commit on `ops/pipeline`
(`git add <your paths>`, then `git commit -m "STEP BE-EC1: jobs.details expand"`), one plain command per call. Don't push.

## Owned files
supabase/migrations/** · src/lib/server/** · src/app/api/jobs/** · src/app/api/board/** · tests/** · docs/ops/pipeline-drills.md · .baseleap/reports/BE-EC1.md
