# STEP BE-EC2 — expand/contract drill, release 2 of 2: CONTRACT (drop `jobs.notes`)

Agent: bl-backend · Skills: be-data, be-testing (ops-release §3 read only)

## Context
Release 1 (`c7a5d86`, migration `20261118000100_jobs_details_expand.sql`) is live: the app reads and writes `details` only,
and the trigger `jobs_details_sync` (function `app.jobs_sync_details()`) mirrors `notes` ↔ `details`.
Nothing live uses `notes` any more.

## Release 2 must contain
1. Migration `supabase/migrations/<timestamp>_jobs_notes_contract.sql`:
   - drop the trigger `jobs_details_sync`, then the function `app.jobs_sync_details()`;
   - drop the column `notes` (its check constraint goes with it); check nothing else references `notes`
     (other functions, triggers, views, RLS policies, the audit/event trigger): grep the migrations, and say what you found.
   - nothing else changes.
2. App code: no change expected; confirm with a search that nothing reads or writes the `notes` **column**
   (the API field named `notes` stays: it maps from `details`). Remove the `JobInsert` shim only if the generated
   types allow it; otherwise leave it and say so.
3. Tests: retire the sync tests that write the old column; keep/adjust the ones proving the API still reads and
   writes `notes` (field) via `details` (column), and that one update = one version bump. Add a test that the
   `notes` column is gone.
4. Rollback note at the bottom of the migration (comment only): how to restore the column and backfill from `details`
   if ever needed, and that it is a **forward** migration, never a down-migration on production.

## Local database / verify
Local stack only (`npx supabase start/stop/db reset`, ports 554xx; never other containers). You can't load the
local keys yourself: when the code and tests are written, run `npx tsc --noEmit -p .` and stop; Claude runs `npm test`
with the local keys and commits. Write `.baseleap/reports/BE-EC2.md`. Don't commit, don't push.

## Owned files
supabase/migrations/** · src/lib/server/** · tests/** · .baseleap/reports/BE-EC2.md
