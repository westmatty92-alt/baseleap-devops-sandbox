-- RLS + guard tests for public.jobs. Run with `supabase test db` (pgTAP).
-- Fixture: org N (Northside) with Owner, Tech A, Tech B, removed Tech C; org T (e2e test org)
-- with its own owner and technician. Proves: everyone in an org reads the whole board; only the
-- owner creates and edits; a technician changes only status/notes on their own non-cancelled
-- jobs; nobody deletes; another org sees nothing; a removed person sees nothing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- ---------- fixture (as postgres: RLS bypassed, guards skip actor rules) ----------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000b1', 'owner@example.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'tech.a@example.test'),
  ('00000000-0000-4000-8000-0000000000b3', 'tech.b@example.test'),
  ('00000000-0000-4000-8000-0000000000b4', 'tech.c@example.test'),
  ('00000000-0000-4000-8000-0000000000b5', 'e2e.owner@example.test'),
  ('00000000-0000-4000-8000-0000000000b6', 'e2e.tech.a@example.test');

insert into public.organizations (id, name, is_test) values
  ('00000000-0000-4000-8000-0000000000a1', 'Northside Plumbing', false),
  ('00000000-0000-4000-8000-0000000000a2', 'Baseleap E2E', true);

insert into public.team_members (id, org_id, user_id, name, email, role) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', 'Owner', 'owner@example.test', 'owner'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', 'Tech A', 'tech.a@example.test', 'technician'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b3', 'Tech B', 'tech.b@example.test', 'technician'),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b4', 'Tech C', 'tech.c@example.test', 'technician'),
  ('00000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b5', 'E2E Owner', 'e2e.owner@example.test', 'owner'),
  ('00000000-0000-4000-8000-0000000000c6', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b6', 'E2E Tech A', 'e2e.tech.a@example.test', 'technician');

insert into public.jobs (id, org_id, client_request_id, title, address, job_date, start_time, assigned_member_id, created_by) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000a1', gen_random_uuid(), 'Leaking kitchen faucet', '45 Main St W, Hamilton', '2026-11-12', '15:30', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000c1'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000a1', gen_random_uuid(), 'Water heater', '1 King St E, Hamilton', '2026-11-12', '11:00', '00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000c1'),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-0000000000a1', gen_random_uuid(), 'Blocked drain', '9 Bay St N, Hamilton', '2026-11-12', '09:00', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000c1'),
  ('00000000-0000-4000-8000-0000000000d5', '00000000-0000-4000-8000-0000000000a2', gen_random_uuid(), 'E2E job', '1 Test Rd', '2026-11-12', '10:00', '00000000-0000-4000-8000-0000000000c6', '00000000-0000-4000-8000-0000000000c5');

update public.jobs set status = 'cancelled' where id = '00000000-0000-4000-8000-0000000000d3';
update public.team_members set is_active = false where id = '00000000-0000-4000-8000-0000000000c4';

-- ---------- Tech A ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true);  -- older auth.uid() reads only this
set local role authenticated;

select is((select count(*) from public.jobs), 3::bigint, 'Tech A reads every job in the org, including Tech B''s');
select is((select count(*) from public.jobs where org_id = '00000000-0000-4000-8000-0000000000a2'), 0::bigint, 'Tech A cannot read another org''s jobs');
select lives_ok($$update public.jobs set notes = 'Key under mat' where id = '00000000-0000-4000-8000-0000000000d1'$$, 'Tech A edits notes on own job');
select lives_ok($$update public.jobs set status = 'in_progress' where id = '00000000-0000-4000-8000-0000000000d1'$$, 'Tech A sets In progress on own job');
select is((select version from public.jobs where id = '00000000-0000-4000-8000-0000000000d1'), 3, 'each real change bumps version');
select throws_ok($$update public.jobs set title = 'Hacked' where id = '00000000-0000-4000-8000-0000000000d1'$$, 'BLA02', null, 'Tech A cannot change the title of own job');
select throws_ok($$update public.jobs set status = 'cancelled' where id = '00000000-0000-4000-8000-0000000000d1'$$, 'BLA03', null, 'Tech A cannot set Cancelled');
select throws_ok($$insert into public.jobs (org_id, client_request_id, title, address, job_date, start_time, assigned_member_id)
                   values ('00000000-0000-4000-8000-0000000000a1', gen_random_uuid(), 'New', 'Somewhere', '2026-11-12', '10:00', '00000000-0000-4000-8000-0000000000c2')$$,
                 '42501', null, 'Tech A cannot create a job');
select throws_ok($$delete from public.jobs where id = '00000000-0000-4000-8000-0000000000d1'$$, '42501', null, 'Tech A cannot delete a job');
update public.jobs set notes = 'Not mine' where id = '00000000-0000-4000-8000-0000000000d2';
select is((select notes from public.jobs where id = '00000000-0000-4000-8000-0000000000d2'), null, 'Tech A cannot change Tech B''s job');
update public.jobs set notes = 'Too late' where id = '00000000-0000-4000-8000-0000000000d3';
select is((select notes from public.jobs where id = '00000000-0000-4000-8000-0000000000d3'), null, 'Tech A cannot change own cancelled job');
select throws_ok($$select * from public.audit_log$$, '42501', null, 'Tech A cannot read the audit log');
select throws_ok($$select * from public.events$$, '42501', null, 'Tech A cannot read events');
reset role;

-- ---------- Owner ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', true);
set local role authenticated;

select lives_ok($$update public.jobs set title = 'Water heater (tank)', start_time = '11:30' where id = '00000000-0000-4000-8000-0000000000d2'$$, 'Owner edits any field');
select is((select version from public.jobs where id = '00000000-0000-4000-8000-0000000000d2'), 2, 'owner edit bumps version');
select throws_ok($$update public.jobs set assigned_member_id = '00000000-0000-4000-8000-0000000000c4' where id = '00000000-0000-4000-8000-0000000000d1'$$, 'BLA01', null, 'Owner cannot assign a removed technician');
select throws_ok($$update public.jobs set assigned_member_id = '00000000-0000-4000-8000-0000000000c1' where id = '00000000-0000-4000-8000-0000000000d1'$$, 'BLA01', null, 'Owner cannot assign a job to themselves (OQ-8)');
select lives_ok($$update public.jobs set status = 'cancelled' where id = '00000000-0000-4000-8000-0000000000d1'$$, 'Owner cancels a job');
update public.jobs set title = 'Stale edit' where id = '00000000-0000-4000-8000-0000000000d2' and version = 1;
select is((select title from public.jobs where id = '00000000-0000-4000-8000-0000000000d2'), 'Water heater (tank)', 'a save from an old version changes nothing (FR-14)');
update public.jobs set title = title where id = '00000000-0000-4000-8000-0000000000d2';
select is((select version from public.jobs where id = '00000000-0000-4000-8000-0000000000d2'), 2, 'a no-op save keeps the version');
select throws_ok($$delete from public.jobs where id = '00000000-0000-4000-8000-0000000000d2'$$, '42501', null, 'Owner cannot delete a job (NG-6)');
select lives_ok($$insert into public.jobs (id, org_id, client_request_id, title, address, job_date, start_time, assigned_member_id, status)
                  values ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-0000000000a1', gen_random_uuid(), 'New job', '2 James St S, Hamilton', '2026-11-17', '08:00', '00000000-0000-4000-8000-0000000000c3', 'done')$$,
                'Owner creates a job for another date');
select is((select status from public.jobs where id = '00000000-0000-4000-8000-0000000000d4'), 'scheduled', 'new jobs always start Scheduled');
reset role;

-- ---------- Events written by the database (as postgres) ----------
select is((select count(*) from public.events where name = 'job_status_changed' and properties ->> 'job_id' = '00000000-0000-4000-8000-0000000000d1'),
          2::bigint, 'one job_status_changed per saved status change');
select is((select count(*) from public.events where name = 'job_updated' and properties ->> 'job_id' = '00000000-0000-4000-8000-0000000000d2'),
          1::bigint, 'stale and no-op saves record no event');

-- ---------- E2E test org owner ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b5","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b5', true);
set local role authenticated;

select is((select count(*) from public.jobs), 1::bigint, 'the test org sees only its own job (AC-006.6)');
select throws_ok($$insert into public.jobs (org_id, client_request_id, title, address, job_date, start_time, assigned_member_id)
                   values ('00000000-0000-4000-8000-0000000000a1', gen_random_uuid(), 'Cross org', 'X', '2026-11-12', '10:00', '00000000-0000-4000-8000-0000000000c2')$$,
                 '42501', null, 'another org''s owner cannot create jobs in this org');
select throws_ok($$insert into public.jobs (org_id, client_request_id, title, address, job_date, start_time, assigned_member_id)
                   values ('00000000-0000-4000-8000-0000000000a2', gen_random_uuid(), 'Cross assign', 'X', '2026-11-12', '10:00', '00000000-0000-4000-8000-0000000000c2')$$,
                 'BLA01', null, 'cannot assign another org''s technician');
reset role;

-- ---------- Removed Tech C ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b4","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b4', true);
set local role authenticated;
select is((select count(*) from public.jobs), 0::bigint, 'a removed technician reads no jobs (FR-2, FR-13)');
reset role;

-- ---------- Signed out ----------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select throws_ok($$select * from public.jobs$$, '42501', null, 'signed-out users read nothing (AC-001.7)');
reset role;

select * from finish();
rollback;
