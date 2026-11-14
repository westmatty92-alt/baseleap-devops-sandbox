-- RLS tests for public.audit_log, public.events, public.rate_limits and the functions that write
-- them (pgTAP). Proves: clients can neither read nor write these tables directly; client events
-- go only through record_client_event, which stamps the caller's own id; server-only functions
-- can't be called by signed-in users; the audit log is append-only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ---------- fixture ----------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000b1', 'owner@example.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'tech.a@example.test'),
  ('00000000-0000-4000-8000-0000000000b4', 'tech.c@example.test');

insert into public.organizations (id, name) values ('00000000-0000-4000-8000-0000000000a1', 'Northside Plumbing');

insert into public.team_members (id, org_id, user_id, name, email, role, is_active) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', 'Owner', 'owner@example.test', 'owner', true),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', 'Tech A', 'tech.a@example.test', 'technician', true),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b4', 'Tech C', 'tech.c@example.test', 'technician', false);

-- ---------- Owner (the most privileged client role) ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', true);  -- older auth.uid() reads only this
set local role authenticated;
select throws_ok($$select * from public.audit_log$$, '42501', null, 'owner cannot read the audit log directly');
select throws_ok($$insert into public.events (name, source) values ('job_created', 'client')$$, '42501', null, 'owner cannot write events directly');
select throws_ok($$select * from public.rate_limits$$, '42501', null, 'owner cannot read rate limits');
select throws_ok($$select public.hit_rate_limit('email:x', 60, 1)$$, '42501', null, 'signed-in users cannot call the rate limiter');
select throws_ok($$select public.record_auth_event('signin_completed', '00000000-0000-4000-8000-0000000000c1')$$, '42501', null, 'signed-in users cannot forge sign-in events');
reset role;

-- ---------- Tech A sends client events ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true);
set local role authenticated;
select lives_ok($$select public.record_client_event('board_viewed', '{"board_date":"2026-11-12","is_today":true,"job_count":3,"load_ms":850,"user_id":"00000000-0000-4000-8000-0000000000c1"}')$$,
                'Tech A records board_viewed');
select throws_ok($$select public.record_client_event('job_created', '{}')$$, '22023', null, 'server-side events cannot be sent from the client');
select throws_ok($$select public.record_client_event('board_load_failed', '{"board_date":"2026-11-12","error_kind":"<script>"}')$$, '22023', null, 'free text cannot get into event properties');
reset role;

select is((select member_id from public.events where name = 'board_viewed'), '00000000-0000-4000-8000-0000000000c2'::uuid,
          'board_viewed is stamped with the caller, not the user_id the client sent');
select is((select properties ->> 'user_id' from public.events where name = 'board_viewed'), '00000000-0000-4000-8000-0000000000c2',
          'properties.user_id is the caller');

-- ---------- Removed Tech C ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b4","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b4', true);
set local role authenticated;
select throws_ok($$select public.record_client_event('board_viewed', '{"board_date":"2026-11-12","is_today":true,"job_count":0,"load_ms":10}')$$,
                 '42501', null, 'a removed member cannot record events');
reset role;

-- ---------- Server side (postgres stands in for service_role) ----------
select is(public.hit_rate_limit('email:abc', 60, 1), true, 'first sign-in request in a minute is allowed');
select is(public.hit_rate_limit('email:abc', 60, 1), false, 'second request within 60 s is refused (AC-001.5)');
select throws_ok($$update public.audit_log set action = 'job.created'$$, 'BLA06', null, 'the audit log is append-only');

select * from finish();
rollback;
