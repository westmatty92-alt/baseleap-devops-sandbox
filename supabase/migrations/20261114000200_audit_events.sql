-- 20261114000200_audit_events.sql
-- Purpose: the append-only audit trail (who did what, when — FR-18) and the product analytics
--          `events` table (docs/metrics-spec.md). Both are written by the database itself
--          (triggers / security-definer functions), never directly by clients.
--          Serves FR-18 · US-002, US-003, US-004, US-007, US-008, US-009, US-011.
-- Decision: docs/decisions/0005-write-rules-in-the-database.md

begin;

-- ---------------------------------------------------------------------------------------------
-- audit_log: append-only. Holds ids, field names and statuses only — never titles, customer
-- details, addresses or notes (FR-18, PRD Personal data).
-- ---------------------------------------------------------------------------------------------
create table if not exists public.audit_log (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,  -- cascade: audit lives and dies with its tenant
  actor_member_id  uuid references public.team_members(id) on delete set null,           -- null when the service role acted (bootstrap)
  entity           text not null check (entity in ('job', 'team_member')),
  entity_id        uuid not null,
  action           text not null check (action in (
                     'job.created', 'job.updated', 'job.status_changed', 'job.reassigned',
                     'team_member.added', 'team_member.reactivated', 'team_member.removed', 'team_member.renamed')),
  details          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

-- Query: support / QA reads one job's or person's history in order (AC-003.12, AC-007.11, AC-008.8).
create index if not exists audit_log_entity_created_idx on public.audit_log (entity_id, created_at);
-- FK index (cascade from organizations)
create index if not exists audit_log_org_idx on public.audit_log (org_id);

create or replace function app.audit_log_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'BLA06', message = 'audit_log is append-only';
end $$;

drop trigger if exists audit_log_append_only on public.audit_log;
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function app.audit_log_append_only();

-- ---------------------------------------------------------------------------------------------
-- events: product analytics (docs/metrics-spec.md). `member_id` is the metrics spec's `user_id`
-- (team_members.id). Properties carry ids, dates, counts and enums only. Kept 13 months.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references public.organizations(id) on delete cascade,     -- null only for signin_link_requested from an unlisted email
  member_id    uuid references public.team_members(id) on delete set null,     -- metrics "user_id"
  name         text not null check (name in (
                 'signin_link_requested', 'signin_completed', 'board_viewed', 'board_load_failed',
                 'job_created', 'job_status_changed', 'job_reassigned',
                 'job_updated', 'team_member_added', 'team_member_removed')),
  source       text not null check (source in ('server', 'client')),
  is_test      boolean not null default false,                                 -- copied from organizations.is_test: excluded from metrics
  properties   jsonb not null default '{}'::jsonb,
  occurred_at  timestamptz not null default now()
);

-- Query: metrics read one event name over a time window (adoption, guardrails).
create index if not exists events_name_occurred_idx on public.events (name, occurred_at);
-- Query: retention purge deletes rows older than 13 months.
create index if not exists events_occurred_idx on public.events (occurred_at);
-- FK index (cascade from organizations)
create index if not exists events_org_idx on public.events (org_id);

-- Internal writers (called only from triggers / definer functions below).
create or replace function app.write_audit(p_org uuid, p_actor uuid, p_entity text, p_entity_id uuid, p_action text, p_details jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (org_id, actor_member_id, entity, entity_id, action, details)
  values (p_org, p_actor, p_entity, p_entity_id, p_action, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function app.write_event(p_org uuid, p_member uuid, p_name text, p_source text, p_properties jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.events (org_id, member_id, name, source, is_test, properties)
  values (p_org, p_member, p_name, p_source,
          coalesce((select o.is_test from public.organizations o where o.id = p_org), false),
          coalesce(p_properties, '{}'::jsonb));
$$;

revoke all on function app.write_audit(uuid, uuid, text, uuid, text, jsonb), app.write_event(uuid, uuid, text, text, jsonb) from public;

-- ---------------------------------------------------------------------------------------------
-- Team changes → audit + events (team_member_added / team_member_removed). Fires once per saved
-- change; a no-op update records nothing (metrics rule: no double fire).
-- ---------------------------------------------------------------------------------------------
create or replace function app.team_members_record_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := coalesce(app.current_member_id(), new.added_by);
begin
  if tg_op = 'INSERT' then
    perform app.write_audit(new.org_id, v_actor, 'team_member', new.id, 'team_member.added', jsonb_build_object('role', new.role));
    if new.role = 'technician' then
      perform app.write_event(new.org_id, v_actor, 'team_member_added', 'server',
        jsonb_build_object('team_member_id', new.id, 'actor_id', v_actor, 'reactivated', false));
    end if;
    return new;
  end if;

  v_actor := coalesce(app.current_member_id(), new.removed_by, old.removed_by);
  if old.is_active and not new.is_active then
    perform app.write_audit(new.org_id, v_actor, 'team_member', new.id, 'team_member.removed', '{}'::jsonb);
    perform app.write_event(new.org_id, v_actor, 'team_member_removed', 'server',
      jsonb_build_object('team_member_id', new.id, 'actor_id', v_actor));
  elsif not old.is_active and new.is_active then
    perform app.write_audit(new.org_id, v_actor, 'team_member', new.id, 'team_member.reactivated', '{}'::jsonb);
    perform app.write_event(new.org_id, v_actor, 'team_member_added', 'server',
      jsonb_build_object('team_member_id', new.id, 'actor_id', v_actor, 'reactivated', true));
  end if;
  if new.name is distinct from old.name then
    perform app.write_audit(new.org_id, v_actor, 'team_member', new.id, 'team_member.renamed', '{}'::jsonb);
  end if;
  return new;
end $$;

drop trigger if exists team_members_record_change on public.team_members;
create trigger team_members_record_change after insert or update on public.team_members
  for each row execute function app.team_members_record_change();

-- ---------------------------------------------------------------------------------------------
-- Client-side events (board_viewed, board_load_failed) arrive through POST /api/events, which
-- calls this function with the user's session. The function derives who and which org from the
-- session and rebuilds the properties itself, so a client can't write another person's events
-- or put free text into properties.
-- ---------------------------------------------------------------------------------------------
create or replace function public.record_client_event(p_name text, p_properties jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid := app.current_member_id();
  v_org    uuid := app.current_org_id();
  v_role   text := app.member_role();
  v_props  jsonb;
begin
  if v_member is null then
    raise exception using errcode = '42501', message = 'not an active team member';
  end if;
  if p_name = 'board_viewed' then
    if (p_properties ->> 'job_count')::int not between 0 and 100000
       or (p_properties ->> 'load_ms')::int not between 0 and 600000 then
      raise exception using errcode = '22023', message = 'event property out of range';
    end if;
    v_props := jsonb_build_object(
      'user_id', v_member,
      'role', v_role,
      'board_date', ((p_properties ->> 'board_date')::date)::text,
      'is_today', (p_properties ->> 'is_today')::boolean,
      'job_count', (p_properties ->> 'job_count')::int,
      'load_ms', (p_properties ->> 'load_ms')::int);
  elsif p_name = 'board_load_failed' then
    if (p_properties ->> 'error_kind') not in ('network', 'server', 'auth') then
      raise exception using errcode = '22023', message = 'invalid error_kind';
    end if;
    v_props := jsonb_build_object(
      'user_id', v_member,
      'board_date', ((p_properties ->> 'board_date')::date)::text,
      'error_kind', p_properties ->> 'error_kind');
  else
    raise exception using errcode = '22023', message = 'event not allowed from the client';
  end if;
  if exists (select 1 from jsonb_each(v_props) e where e.value = 'null'::jsonb) then
    raise exception using errcode = '22023', message = 'missing event property';
  end if;
  perform app.write_event(v_org, v_member, p_name, 'client', v_props);
end $$;

revoke all on function public.record_client_event(text, jsonb) from public, anon;
grant execute on function public.record_client_event(text, jsonb) to authenticated;

-- Sign-in events (signin_link_requested, signin_completed) happen before or at session start, so
-- the server records them with the service role (src/lib/server/admin.ts).
create or replace function public.record_auth_event(p_name text, p_member uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org  uuid;
  v_role text;
begin
  select tm.org_id, tm.role into v_org, v_role from public.team_members tm where tm.id = p_member;
  if p_name = 'signin_link_requested' then
    perform app.write_event(v_org, p_member, p_name, 'server',
      jsonb_build_object('listed', p_member is not null, 'user_id', p_member));
  elsif p_name = 'signin_completed' and p_member is not null then
    perform app.write_event(v_org, p_member, p_name, 'server',
      jsonb_build_object('user_id', p_member, 'role', v_role));
  else
    raise exception using errcode = '22023', message = 'invalid auth event';
  end if;
end $$;

revoke all on function public.record_auth_event(text, uuid) from public, anon, authenticated;
grant execute on function public.record_auth_event(text, uuid) to service_role;

-- ---------------------------------------------------------------------------------------------
-- RLS: no client reads or writes on either table. Baseleap staff read events with database
-- access (metrics); writes come only from the definer functions above.
-- ---------------------------------------------------------------------------------------------
alter table public.audit_log enable row level security;
alter table public.events    enable row level security;

revoke all on public.audit_log from anon, authenticated;
revoke all on public.events    from anon, authenticated;

drop policy if exists audit_log_no_client_access on public.audit_log;
create policy audit_log_no_client_access on public.audit_log
  as restrictive for all to anon, authenticated using (false) with check (false);

drop policy if exists events_no_client_access on public.events;
create policy events_no_client_access on public.events
  as restrictive for all to anon, authenticated using (false) with check (false);

commit;

-- rollback
-- begin;
-- drop trigger if exists team_members_record_change on public.team_members;
-- drop function if exists app.team_members_record_change();
-- drop function if exists public.record_auth_event(text, uuid);
-- drop function if exists public.record_client_event(text, jsonb);
-- drop function if exists app.write_event(uuid, uuid, text, text, jsonb);
-- drop function if exists app.write_audit(uuid, uuid, text, uuid, text, jsonb);
-- drop table if exists public.events;      -- DESTRUCTIVE: drops analytics history
-- drop table if exists public.audit_log;   -- DESTRUCTIVE: drops the audit trail
-- drop function if exists app.audit_log_append_only();
-- commit;
