-- 20261114000300_jobs.sql
-- Purpose: jobs — the board's rows. Who may change what is enforced here (RLS + a guard trigger),
--          optimistic concurrency via `version`, idempotent create via `client_request_id`,
--          and audit + events written by trigger on every saved change.
--          Serves FR-2, FR-4, FR-5, FR-6, FR-9, FR-10, FR-11, FR-12, FR-14, FR-18 ·
--          US-003, US-004, US-007, US-008, US-009, US-010.
-- Decisions: docs/decisions/0005-write-rules-in-the-database.md · docs/decisions/0006-job-date-and-time.md

begin;

create table if not exists public.jobs (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete restrict,   -- restrict: jobs are never deleted (NG-6)
  client_request_id   uuid not null,                                                          -- idempotency key from the form (AC-003.6, AC-003.11)
  title               text not null check (title = btrim(title) and char_length(title) between 1 and 100),
  customer_name       text check (customer_name is null or (customer_name = btrim(customer_name) and char_length(customer_name) between 1 and 100)),
  customer_phone      text check (customer_phone is null or customer_phone ~ '^[0-9 +()-]{7,20}$'),
  address             text not null check (address = btrim(address) and char_length(address) between 1 and 200),
  notes               text check (notes is null or char_length(notes) between 1 and 2000),     -- line breaks kept; plain text only
  job_date            date not null check (job_date between date '2020-01-01' and date '2100-12-31'),  -- wall-clock date in the org's time zone
  start_time          time not null,                                                          -- wall-clock time in the org's time zone (decision 0006)
  assigned_member_id  uuid not null references public.team_members(id) on delete restrict,    -- restrict: people are deactivated, never deleted
  status              text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'done', 'cancelled')),
  version             integer not null default 1 check (version >= 1),                        -- bumped by trigger on every real change (FR-14)
  created_by          uuid not null references public.team_members(id) on delete restrict,
  updated_by          uuid not null references public.team_members(id) on delete restrict,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint jobs_client_request_unique unique (org_id, client_request_id)
);

-- Query: the day board — every job of one org on one date, by start time, ties by earliest
-- created (FR-6, AC-004.6). Fully served by this index; ~30–50 rows per day.
create index if not exists jobs_board_idx on public.jobs (org_id, job_date, start_time, created_at);

-- Query: a technician's jobs / reassignment check; FK index for assigned_member_id.
create index if not exists jobs_assigned_member_idx on public.jobs (assigned_member_id);

-- ---------------------------------------------------------------------------------------------
-- assignable = an active technician of the same org (FR-5, FR-10, AC-003.10, AC-008.5, OQ-8).
--   BLA01 technician_not_assignable
-- ---------------------------------------------------------------------------------------------
create or replace function app.assert_assignable(p_org uuid, p_member uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.team_members tm
    where tm.id = p_member and tm.org_id = p_org and tm.role = 'technician' and tm.is_active
  ) then
    raise exception using errcode = 'BLA01', message = 'technician_not_assignable';
  end if;
end $$;

revoke all on function app.assert_assignable(uuid, uuid) from public;

-- ---------------------------------------------------------------------------------------------
-- Guard. Runs before RLS WITH CHECK. Service-role calls (auth.uid() null) skip actor rules.
--   BLA02 field_not_allowed / not_your_job   (technician touched something not theirs)
--   BLA03 job_cancelled                      (technician vs a cancelled job, or set Cancelled)
--   BLA04 immutable_field
-- ---------------------------------------------------------------------------------------------
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

  if (new.title, new.customer_name, new.customer_phone, new.address, new.notes, new.job_date, new.start_time, new.assigned_member_id, new.status)
     is distinct from
     (old.title, old.customer_name, old.customer_phone, old.address, old.notes, old.job_date, old.start_time, old.assigned_member_id, old.status) then
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

drop trigger if exists jobs_guard on public.jobs;
create trigger jobs_guard before insert or update on public.jobs
  for each row execute function app.jobs_guard();

-- ---------------------------------------------------------------------------------------------
-- Every saved change → audit_log + events (job_created, job_updated, job_status_changed,
-- job_reassigned). Ids, field names and statuses only (docs/metrics-spec.md).
-- ---------------------------------------------------------------------------------------------
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
  if new.notes          is distinct from old.notes          then v_fields := array_append(v_fields, 'notes'); end if;

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

drop trigger if exists jobs_record_change on public.jobs;
create trigger jobs_record_change after insert or update on public.jobs
  for each row execute function app.jobs_record_change();

-- ---------------------------------------------------------------------------------------------
-- RLS (permission matrix in docs/SECURITY_MODEL.md)
-- ---------------------------------------------------------------------------------------------
alter table public.jobs enable row level security;

revoke all on public.jobs from anon;
revoke delete, truncate on public.jobs from authenticated;   -- NG-6, FR-11: no one deletes a job

-- Everyone active in the org reads every job (PRD decision 0003, FR-6).
drop policy if exists jobs_select_org on public.jobs;
create policy jobs_select_org on public.jobs
  for select to authenticated using (org_id = app.current_org_id());

-- Only the owner creates jobs (FR-5, AC-003.9).
drop policy if exists jobs_insert_owner on public.jobs;
create policy jobs_insert_owner on public.jobs
  for insert to authenticated
  with check (app.is_owner() and org_id = app.current_org_id());

-- The owner changes any job in the org (FR-10, FR-11).
drop policy if exists jobs_update_owner on public.jobs;
create policy jobs_update_owner on public.jobs
  for update to authenticated
  using (app.is_owner() and org_id = app.current_org_id())
  with check (app.is_owner() and org_id = app.current_org_id());

-- A technician changes only their own, non-cancelled jobs, and never to Cancelled (FR-9, FR-11).
-- Which columns they may touch (status, notes) is enforced by app.jobs_guard().
drop policy if exists jobs_update_assigned_technician on public.jobs;
create policy jobs_update_assigned_technician on public.jobs
  for update to authenticated
  using (org_id = app.current_org_id() and assigned_member_id = app.current_member_id() and status <> 'cancelled')
  with check (org_id = app.current_org_id() and assigned_member_id = app.current_member_id() and status <> 'cancelled');

-- No delete policy, and delete is revoked: deletes are not allowed (NG-6).

commit;

-- rollback
-- begin;
-- drop table if exists public.jobs;   -- DESTRUCTIVE: drops every job
-- drop function if exists app.jobs_record_change();
-- drop function if exists app.jobs_guard();
-- drop function if exists app.assert_assignable(uuid, uuid);
-- commit;
