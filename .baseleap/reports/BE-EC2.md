# BE-EC2 — expand/contract drill, release 2 of 2 (CONTRACT)

Status: code and tests written; `npx tsc --noEmit -p .` passes. **Not run:** `npm test` / local DB (needs local keys; Claude runs it). Nothing committed or pushed.

## ACTION NEEDED before `npm test`
1. **Delete `tests/api/jobs-details-sync.test.ts`** (`git rm`). It writes the old column, so it fails after the migration. My shell `rm` was refused by the permission prompt, so the file is still there. I replaced it with `tests/api/jobs-notes-contract.test.ts`.
2. **`supabase/tests/rls/jobs.sql` (pgTAP, lines 47, 56–59) still writes and reads `jobs.notes`.** It will fail after this migration. It is outside my owned files (`supabase/migrations/**`), so I did not touch it. Change `notes` to `details` on those lines (4 statements).
3. **`src/types/database.ts` is generated and not mine.** It still lists `notes` and lacks `details`. Run `npm run gen:types` after the migration is applied locally.

## Deviation from "nothing else changes" (needs your OK)
The grep found that **two functions read `new.notes`/`old.notes`**, so dropping the column alone would break every UPDATE on `jobs` at run time. plpgsql resolves columns lazily, so the migration would apply cleanly and then fail:
- `app.jobs_guard()` (`20261114000300_jobs.sql:107-109`) compares `notes` to decide the version bump.
- `app.jobs_record_change()` (`:160`) compares `notes` to build `fields_changed`.

The new migration `supabase/migrations/20261118000200_jobs_notes_contract.sql` does this, in order:
1. Recreates both functions with `notes` → `details`. They are otherwise identical to the originals. The audit/event label stays `'notes'` (the API field name), so audit and event payloads do not change.
2. Drops trigger `jobs_details_sync`, then function `app.jobs_sync_details()`.
3. Drops column `notes`. Its check constraint goes with it.

The rollback note is a comment at the bottom. It says this is a forward migration only and never a down-migration on production. It gives the steps to re-add the column, backfill from `details`, and restore the sync and the two functions.

## What else references `notes` (grep of migrations)
- `20261114000300_jobs.sql`: the column definition, `jobs_guard`, `jobs_record_change`, and a comment on the technician policy. The policy itself does not reference the column.
- `20261114000200_audit_events.sql`: a comment only.
- `20261118000100_jobs_details_expand.sql`: the sync function and comments.
- No views, no RLS policy expressions, and no other triggers reference it.
- The trigger-order note from release 1 (`jobs_details_sync` < `jobs_guard`) no longer applies.

## App code
- Nothing reads or writes the `notes` **column**. In `src/lib/server/services/jobs.ts`, `JOB_SELECT` and the insert use `details`. `toJob` maps `r.details` to the API field `notes`, and the validation-error mapping turns `details` into `notes`.
- The `JobInsert` shim (`Database[...]['Insert'] & { details? }`) stays, and I did not edit the service. The generated `database.ts` still lacks `details`. Once types are regenerated the shim can go in a trivial follow-up.
- No source change in `src/lib/server/**`.

## Tests (`tests/api/jobs-notes-contract.test.ts`)
Retired: the whole sync suite (insert and update via `notes`, both-different, clearing either, trigger mirroring).

Kept or adjusted:
- Selecting or writing the `notes` column errors, and `details` works. This proves the column is gone.
- `POST /api/jobs` returns `notes`, never `details`, and the row stores `details`.
- The board returns `notes` from `details`.
- One real change gives one version bump. Writing the same value does not bump, and clearing bumps once.
- `details` keeps the 1–2000 character check.
- A technician's RLS update of `details` bumps once.
- The audit row for a `details` change has `fields_changed: ['notes']`.

Existing `jobs-create` and `jobs-status` tests use the API field `notes` and are unchanged.

## AC → test map
FR-14 (one change, one version bump) is covered by the "one update = one version bump" block. The auth matrix is unchanged (no route changes).

## Contract questions
None. `docs/openapi.yaml` is untouched and the API shape is unchanged.
