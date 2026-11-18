-- 20261118000100_jobs_details_expand.sql
-- Purpose: release 1 of 2 (EXPAND) of renaming public.jobs.notes -> public.jobs.details.
--          The API field stays `notes`; only the column is renamed. Additive only: nothing is dropped,
--          renamed or made NOT NULL, so the old app (writes `notes`) and the new app (writes `details`)
--          both work while either is live. Release 2 (CONTRACT) drops the trigger, then the column `notes`.
-- Serves:  FR-14 (one real change = one version bump) is preserved; see the trigger-order note below.

begin;

-- 1. New column, same check as `notes` (null, or 1-2000 chars).
alter table public.jobs add column if not exists details text;
alter table public.jobs drop constraint if exists jobs_details_check;
alter table public.jobs add constraint jobs_details_check check (details is null or char_length(details) between 1 and 2000);

-- 2. Two-way sync, row level, before insert or update.
--    INSERT: whichever of notes/details is set wins; both set and different -> details (new app) wins.
--    UPDATE: the column that changed wins; both changed and different -> details (new app) wins.
create or replace function app.jobs_sync_details() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.details is null then
      new.details := new.notes;
    elsif new.notes is distinct from new.details then
      new.notes := new.details;   -- covers notes null while details set, and both set but different
    end if;
    return new;
  end if;

  -- UPDATE
  if new.details is distinct from old.details then
    new.notes := new.details;     -- new app wrote details (or both changed: details wins)
  elsif new.notes is distinct from old.notes then
    new.details := new.notes;     -- old app wrote notes only
  end if;
  return new;
end $$;

-- Trigger order matters. BEFORE triggers fire alphabetically by name, and app.jobs_guard() (trigger
-- `jobs_guard`) decides the version bump by comparing `notes`. So the sync must run first:
-- `jobs_details_sync` < `jobs_guard`. A details-only write is then already mirrored into `notes` when the
-- guard looks at it, and one real change bumps the version exactly once. The after-trigger
-- jobs_record_change reads the final row and is unaffected.
drop trigger if exists jobs_details_sync on public.jobs;
create trigger jobs_details_sync before insert or update on public.jobs
  for each row execute function app.jobs_sync_details();

-- 3. Backfill: one statement, fine for a small table. The sync trigger is already in place, and the update
--    changes no field the guard compares (notes is unchanged), so versions and updated_at do not move
--    and no audit/event rows are written.
update public.jobs set details = notes where details is null and notes is not null;

commit;

-- rollback
-- begin;
-- drop trigger if exists jobs_details_sync on public.jobs;
-- drop function if exists app.jobs_sync_details();
-- alter table public.jobs drop column if exists details;   -- only before the new app is live: `details` is then the only copy of new writes
-- commit;
