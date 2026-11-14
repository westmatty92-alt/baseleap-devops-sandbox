-- 20261114000100_tenancy_team.sql
-- Purpose: tenant (organizations) and the team list (team_members), the helper functions every
--          RLS policy uses, and the rules for adding / removing people.
--          Serves FR-1, FR-2, FR-3, FR-13 · US-001, US-002, US-011.
-- Decisions: docs/decisions/0002-sign-in.md · docs/decisions/0004-tenancy-and-test-isolation.md

begin;

create schema if not exists extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Private schema for helpers. Not exposed through the Data API (only `public` is).
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

create or replace function app.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------
-- organizations: the tenant boundary. One row for Northside Plumbing, one for the e2e test org
-- (is_test = true, decision 0004). Created only by the bootstrap script (service role).
-- ---------------------------------------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 100),
  time_zone   text not null default 'America/Toronto' check (char_length(time_zone) between 1 and 64),  -- "today" for the board (FR-7)
  is_test     boolean not null default false,                                                          -- e2e org: events excluded from metrics
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- team_members: who may sign in, and with which role. Never deleted: removal is is_active = false
-- so names stay on past jobs (FR-13). Email is unique across all orgs because sign-in resolves
-- the org from the email.
-- ---------------------------------------------------------------------------------------------
create table if not exists public.team_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete restrict,   -- restrict: an org with people is never dropped by accident
  user_id     uuid unique references auth.users(id) on delete set null,               -- set null: keep the row (and job history) if the auth user is purged
  name        text not null check (char_length(name) between 1 and 60 and name = btrim(name)),
  email       extensions.citext not null
                check (char_length(email::text) between 3 and 254
                       and email::text = btrim(email::text)
                       and email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role        text not null check (role in ('owner', 'technician')),
  is_active   boolean not null default true,
  added_by    uuid references public.team_members(id) on delete set null,
  removed_at  timestamptz,
  removed_by  uuid references public.team_members(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint team_members_owner_always_active check (role <> 'owner' or is_active),   -- FR-13: the owner cannot be removed
  constraint team_members_removed_consistent check ((is_active and removed_at is null) or (not is_active and removed_at is not null))
);

-- Query: sign-in looks up an active member by email, case-insensitive (FR-1, AC-001.4); duplicate
-- emails refused (FR-3, AC-002.3). citext makes the unique index case-insensitive.
create unique index if not exists team_members_email_key on public.team_members (email);

-- One owner per org (FR-3, NG-12).
create unique index if not exists team_members_one_owner_per_org on public.team_members (org_id) where role = 'owner';

-- Query: Team screen lists the org's members; job form lists the org's active technicians (SCR-05, SCR-06).
create index if not exists team_members_org_role_active_idx on public.team_members (org_id, role, is_active, name);

-- ---------------------------------------------------------------------------------------------
-- Helpers used by every policy. security definer so policies on team_members don't recurse.
-- A removed member resolves to NULL, so every policy denies them at once (FR-2: within 1 minute).
-- ---------------------------------------------------------------------------------------------
create or replace function app.current_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select tm.id from public.team_members tm where tm.user_id = auth.uid() and tm.is_active
$$;

create or replace function app.current_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select tm.org_id from public.team_members tm where tm.user_id = auth.uid() and tm.is_active
$$;

create or replace function app.member_role() returns text
language sql stable security definer set search_path = '' as $$
  select tm.role from public.team_members tm where tm.user_id = auth.uid() and tm.is_active
$$;

create or replace function app.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select tm.role = 'owner' from public.team_members tm where tm.user_id = auth.uid() and tm.is_active), false)
$$;

revoke all on function app.current_member_id(), app.current_org_id(), app.member_role(), app.is_owner() from public;
grant execute on function app.current_member_id(), app.current_org_id(), app.member_role(), app.is_owner() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Guard: what a signed-in owner may change on a team row. Service-role calls (auth.uid() null:
-- bootstrap, seed) skip the actor rules but still get removed_at bookkeeping.
--   BLA04 immutable_field   · BLA05 email_mismatch
-- ---------------------------------------------------------------------------------------------
create or replace function app.team_members_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := app.current_member_id();
begin
  if tg_op = 'INSERT' then
    if v_actor is not null then
      new.added_by := v_actor;
      -- the auth user must be the one created for this email (no hijacking another person's account)
      if new.user_id is null or not exists (
        select 1 from auth.users u where u.id = new.user_id and lower(u.email) = lower(new.email::text)
      ) then
        raise exception using errcode = 'BLA05', message = 'email_mismatch';
      end if;
    end if;
    if not new.is_active and new.removed_at is null then new.removed_at := now(); end if;
    return new;
  end if;

  -- UPDATE
  if new.id <> old.id or new.org_id <> old.org_id or new.role <> old.role or new.email <> old.email
     or new.created_at <> old.created_at or new.added_by is distinct from old.added_by
     or (v_actor is not null and new.user_id is distinct from old.user_id) then
    raise exception using errcode = 'BLA04', message = 'immutable_field';
  end if;

  if old.is_active and not new.is_active then
    new.removed_at := now();
    new.removed_by := coalesce(v_actor, new.removed_by);
  elsif not old.is_active and new.is_active then
    new.removed_at := null;
    new.removed_by := null;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists team_members_guard on public.team_members;
create trigger team_members_guard before insert or update on public.team_members
  for each row execute function app.team_members_guard();

-- ---------------------------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.team_members  enable row level security;

revoke all on public.organizations from anon;
revoke all on public.team_members  from anon;
revoke insert, update, delete, truncate on public.organizations from authenticated;
revoke delete, truncate on public.team_members from authenticated;

-- organizations: members read their own org (name, time zone). No client writes.
drop policy if exists organizations_select_own on public.organizations;
create policy organizations_select_own on public.organizations
  for select to authenticated using (id = app.current_org_id());

-- team_members: every active member reads their org's team list (PRD Roles & permissions; the
-- API only returns emails to the owner).
drop policy if exists team_members_select_org on public.team_members;
create policy team_members_select_org on public.team_members
  for select to authenticated using (org_id = app.current_org_id());

-- Only the owner adds people, and only as active technicians (FR-3, NG-12).
drop policy if exists team_members_insert_owner on public.team_members;
create policy team_members_insert_owner on public.team_members
  for insert to authenticated
  with check (app.is_owner() and org_id = app.current_org_id() and role = 'technician' and is_active);

-- Only the owner changes rows (rename on re-add, remove, re-activate). The owner row cannot be
-- deactivated (check constraint). No delete policy: nobody deletes people (FR-13).
drop policy if exists team_members_update_owner on public.team_members;
create policy team_members_update_owner on public.team_members
  for update to authenticated
  using (app.is_owner() and org_id = app.current_org_id())
  with check (app.is_owner() and org_id = app.current_org_id());

commit;

-- rollback
-- begin;
-- drop table if exists public.team_members;    -- DESTRUCTIVE: drops the team list
-- drop table if exists public.organizations;   -- DESTRUCTIVE: drops the tenants
-- drop function if exists app.team_members_guard();
-- drop function if exists app.is_owner();
-- drop function if exists app.member_role();
-- drop function if exists app.current_org_id();
-- drop function if exists app.current_member_id();
-- drop function if exists app.set_updated_at();
-- drop schema if exists app;
-- commit;
