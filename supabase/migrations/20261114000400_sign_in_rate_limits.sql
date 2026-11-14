-- 20261114000400_sign_in_rate_limits.sql
-- Purpose: rate limits for sign-in requests, applied identically to listed and unlisted emails so
--          the "wait a minute" message can't reveal who is on the team (FR-1, AC-001.3, AC-001.5);
--          plus the daily retention job (events 13 months, rate-limit rows 1 day).
--          Serves FR-1 · US-001.
-- Decision: docs/decisions/0002-sign-in.md

begin;

-- Keys are 'email:' || sha256(normalised email) and 'ip:' || sha256(client ip), computed in
-- src/lib/server/services/auth.ts. No raw email or IP is stored.
create table if not exists public.rate_limits (
  key                text primary key check (char_length(key) between 4 and 200),
  window_started_at  timestamptz not null default now(),
  hits               integer not null default 0 check (hits >= 0)
);

-- Query: retention purge of stale windows.
create index if not exists rate_limits_window_idx on public.rate_limits (window_started_at);

-- Returns true when the call is allowed. Atomic under concurrency (single upsert).
create or replace function public.hit_rate_limit(p_key text, p_window_seconds integer, p_max integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_hits integer;
begin
  insert into public.rate_limits as r (key, window_started_at, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    window_started_at = case when r.window_started_at <= now() - make_interval(secs => p_window_seconds) then now() else r.window_started_at end,
    hits              = case when r.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;

revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;

-- Retention (docs/metrics-spec.md "Privacy & retention"; PRD OQ-11 leaves jobs untouched).
create or replace function app.run_retention() returns void
language sql security definer set search_path = '' as $$
  delete from public.events      where occurred_at       < now() - interval '13 months';
  delete from public.rate_limits where window_started_at < now() - interval '1 day';
$$;

revoke all on function app.run_retention() from public;

-- Schedule daily at 08:15 UTC when pg_cron is enabled on the project (Supabase: Integrations → Cron).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cron$select cron.schedule('tech-board-retention', '15 8 * * *', 'select app.run_retention()')$cron$;
  end if;
end $$;

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

drop policy if exists rate_limits_no_client_access on public.rate_limits;
create policy rate_limits_no_client_access on public.rate_limits
  as restrictive for all to anon, authenticated using (false) with check (false);

commit;

-- rollback
-- begin;
-- do $$ begin if exists (select 1 from pg_extension where extname = 'pg_cron') then perform cron.unschedule('tech-board-retention'); end if; end $$;
-- drop function if exists app.run_retention();
-- drop function if exists public.hit_rate_limit(text, integer, integer);
-- drop table if exists public.rate_limits;   -- drops throttle windows only (no business data)
-- commit;
