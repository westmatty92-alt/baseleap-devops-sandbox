# BE-EC1: jobs.details expand (release 1 of 2)

Status: **built, not verified**. The tests have not been run (see "Not verified").

## Changes
- `supabase/migrations/20261118000100_jobs_details_expand.sql` (additive only):
  - `details text` with `jobs_details_check` (null, or 1–2000 chars).
  - Trigger `jobs_details_sync` (before insert or update, function `app.jobs_sync_details()`):
    - Insert: whichever is set wins; both set and different → `details` wins.
    - Update: the changed column wins; both changed and different → `details` wins.
  - **Trigger order:** BEFORE triggers fire alphabetically. `jobs_details_sync` sorts before `jobs_guard`, so the guard
    sees the mirrored `notes` and bumps `version` once (FR-14). Insert defaults set by the guard are unaffected.
    `jobs_record_change` (after trigger) reads the final row.
  - Backfill is one statement (small table). It runs after the trigger exists and changes no guard-compared field,
    so no version bump, no `updated_at` change, and no audit/event rows.
  - Nothing is dropped, renamed or made NOT NULL. The rollback is commented at the bottom of the file.
- `src/lib/server/services/jobs.ts`:
  - Explicit select list with `details` (no more `*`).
  - Inserts write `details`; `toJob` maps `details` → API `notes`.
  - A `23514` on `jobs_details_check` is reported as field `notes`.
- `tests/api/jobs-details-sync.test.ts` (12 tests):
  - Trigger: notes→details, details→notes, clear either, both changed, no-op, only another column changed, the check.
  - One update = one bump, including an update by a technician through RLS.
  - API: POST and the board still say `notes`, and read both old-app and new-app writes.
- `docs/ops/pipeline-drills.md`: planted-breaks row for drill 5. Nothing planted; release 2 drops the trigger (and its
  function), then the column.

## Not verified (needs you)
- The local stack is up (`npx supabase start`, ports 554xx) and the new migration applied cleanly on a fresh DB.
- `npx tsc --noEmit -p .` is clean.
- **`npm test` has not passed.** The tests need `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
  `SUPABASE_SERVICE_ROLE_KEY` for the local stack, and this session refused every command that sets them
  (env prefix, `--env-file`). I did not work around it. Without env, all 51 tests fail on the missing URL.
  To run: `npx supabase status -o env`, export the three values, then `npm test`.
- Nothing is committed, because the step says to commit after the tests pass.
- The local stack is still running; stop it with `npx supabase stop`.

## Contract / ownership questions
- `src/types/database.ts` is generated and not mine. It lacks `details`, so the insert in `createJob` goes through a
  narrow `JobInsert` shim (commented in the file) and the tests use a loosely typed client. `npm run gen:types` should
  be run by the owner of that file, after which the shim can go.
- The API contract is unchanged: no new fields, endpoints or status codes.
