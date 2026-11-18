-- 20261118000200_jobs_notes_contract.sql
-- Purpose: release 2 of 2 (CONTRACT) of renaming public.jobs.notes -> public.jobs.details.
--          Drops the sync trigger + function, then the column `notes`. The API field stays `notes`
--          (mapped from `details` in the service).
-- Found by grep: besides the sync function, two functions read `notes` and would fail on every UPDATE once
--          the column is gone: app.jobs_guard() (version-bump comparison) and app.jobs_record_change()
--          (fields_changed). No view, RLS policy or other trigger references it. Both functions are
--          recreated below, identical to 20261114000300_jobs.sql except `notes` -> `details`; the
--          audit/event field label stays 'notes' (API field name), so audit and event payloads do not change.

begin;

-- 1. Repoint the two functions at `details` BEFORE the column goes (plpgsql resolves columns at run time).
create or replace function app.jobs_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := app.current_member_id();
  v_role  text := app.member_role();
begin
  if tg_op = 'INSERT' then
    new.status     := 'scheduled';          -- FR-9: new jobs start Scheduled
    new.version    := 1;
    new.created_at := now();
    new.updated_at := new.created_at;
    if v_actor is not null then
      new.created_by := v_actor;
      new.updated_by := v_actor;
    else
      new.updated_by := coalesce(new.updated_by, new.created_by);
    end if;
    perform app.assert_assignable(new.org_id, new.assigned_member_id);
    return new;
  end if;

  -- UPDATE
  if new.id <> old.id or new.org_id <> old.org_id or new.client_request_id <> old.client_request_id
     or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception using errcode = 'BLA04', message = 'immutable_field';
  end if;

  if v_actor is not null and v_role is distinct from 'owner' then
    if old.assigned_member_id <> v_actor then
      raise exception using errcode = 'BLA02', message = 'not_your_job';
    end if;
    if old.status = 'cancelled' or new.status = 'cancelled' then
      raise exception using errcode = 'BLA03', message = 'job_cancelled';
    end if;
    if (new.title, new.customer_name, new.customer_phone, new.address, new.job_date, new.start_time, new.assigned_member_id)
       is distinct from
       (old.title, old.customer_name, old.customer_phone, old.address, old.job_date, old.start_time, old.assigned_member_id) then
      raise exception using errcode = 'BLA02', message = 'field_not_allowed';
    end if;
  end if;

  if new.assigned_member_id <> old.assigned_member_id then
    perform app.assert_assignable(new.org_id, new.assigned_member_id);
  end if;

  if (new.title, new.customer_name, new.customer_phone, new.address, new.details, new.job_date, new.start_time, new.assigned_member_id, new.status)
     is distinct from
     (old.title, old.customer_name, old.customer_phone, old.address, old.details, old.job_date, old.start_time, old.assigned_member_id, old.status) then
    new.version    := old.version + 1;
    new.updated_at := now();
    new.updated_by := coalesce(v_actor, new.updated_by);
  else
    -- no real change: keep version and timestamps so a double tap is a true no-op
    new.version    := old.version;
    new.updated_at := old.updated_at;
    new.updated_by := old.updated_by;
  end if;
  return new;
end $$;

create or replace function app.jobs_record_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor      uuid := coalesce(app.current_member_id(), new.updated_by);
  v_actor_role text;
  v_today      date;
  v_fields     text[] := array[]::text[];
begin
  select tm.role into v_actor_role from public.team_members tm where tm.id = v_actor;

  if tg_op = 'INSERT' then
    select (now() at time zone o.time_zone)::date into v_today from public.organizations o where o.id = new.org_id;
    perform app.write_audit(new.org_id, v_actor, 'job', new.id, 'job.created',
      jsonb_build_object('assigned_member_id', new.assigned_member_id, 'job_date', new.job_date));
    perform app.write_event(new.org_id, v_actor, 'job_created', 'server', jsonb_build_object(
      'job_id', new.id, 'created_by', v_actor, 'assigned_tech_id', new.assigned_member_id,
      'job_date', new.job_date, 'lead_days', new.job_date - v_today));
    return new;
  end if;

  if new.version = old.version then
    return new;   -- no-op update: nothing recorded
  end if;

  if new.title          is distinct from old.title          then v_fields := array_append(v_fields, 'title'); end if;
  if new.customer_name  is distinct from old.customer_name  then v_fields := array_append(v_fields, 'customer_name'); end if;
  if new.customer_phone is distinct from old.customer_phone then v_fields := array_append(v_fields, 'customer_phone'); end if;
  if new.address        is distinct from old.address        then v_fields := array_append(v_fields, 'address'); end if;
  if new.start_time     is distinct from old.start_time     then v_fields := array_append(v_fields, 'start_time'); end if;
  if new.job_date       is distinct from old.job_date       then v_fields := array_append(v_fields, 'job_date'); end if;
  if new.details        is distinct from old.details        then v_fields := array_append(v_fields, 'notes'); end if;   -- label = API field name

  if cardinality(v_fields) > 0 then
    perform app.write_audit(new.org_id, v_actor, 'job', new.id, 'job.updated', jsonb_build_object('fields_changed', to_jsonb(v_fields)));
    perform app.write_event(new.org_id, v_actor, 'job_updated', 'server', jsonb_build_object(
      'job_id', new.id, 'actor_id', v_actor, 'actor_role', v_actor_role, 'fields_changed', to_jsonb(v_fields)));
  end if;

  if new.status is distinct from old.status then
    perform app.write_audit(new.org_id, v_actor, 'job', new.id, 'job.status_changed',
      jsonb_build_object('from_status', old.status, 'to_status', new.status));
    perform app.write_event(new.org_id, v_actor, 'job_status_changed', 'server', jsonb_build_object(
      'job_id', new.id, 'actor_id', v_actor, 'actor_role', v_actor_role,
      'from_status', old.status, 'to_status', new.status));
  end if;

  if new.assigned_member_id is distinct from old.assigned_member_id then
    perform app.write_audit(new.org_id, v_actor, 'job', new.id, 'job.reassigned',
      jsonb_build_object('from_member_id', old.assigned_member_id, 'to_member_id', new.assigned_member_id));
    perform app.write_event(new.org_id, v_actor, 'job_reassigned', 'server', jsonb_build_object(
      'job_id', new.id, 'actor_id', v_actor, 'from_tech_id', old.assigned_member_id, 'to_tech_id', new.assigned_member_id));
  end if;
  return new;
end $$;

-- 2. Sync no longer needed: trigger first, then its function.
drop trigger if exists jobs_details_sync on public.jobs;
drop function if exists app.jobs_sync_details();

-- 3. Drop the old column (its check constraint goes with it).
alter table public.jobs drop column if exists notes;

commit;

-- rollback: FORWARD migration only. Ship it as a new migration file; never run a down-migration on production.
-- begin;
-- alter table public.jobs add column notes text check (notes is null or char_length(notes) between 1 and 2000);
-- update public.jobs set notes = details where details is not null;   -- backfill from details
-- -- only if the old app must run again: recreate app.jobs_sync_details() and trigger jobs_details_sync from
-- -- 20261118000100_jobs_details_expand.sql, and repoint jobs_guard / jobs_record_change back at `notes`.
-- commit;
