-- RLS + guard tests for public.organizations and public.team_members (pgTAP).
-- Proves: members read only their own org and its team list; only the owner adds technicians,
-- removes and re-adds them; the owner can't be removed; no role changes; no deletes; duplicate
-- emails refused case-insensitively; another org and removed people see nothing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- ---------- fixture ----------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000b1', 'owner@example.test'),
  ('00000000-0000-4000-8000-0000000000b2', 'tech.a@example.test'),
  ('00000000-0000-4000-8000-0000000000b3', 'tech.b@example.test'),
  ('00000000-0000-4000-8000-0000000000b4', 'tech.c@example.test'),
  ('00000000-0000-4000-8000-0000000000b5', 'e2e.owner@example.test'),
  ('00000000-0000-4000-8000-0000000000b7', 'tech.d@example.test');

insert into public.organizations (id, name, is_test) values
  ('00000000-0000-4000-8000-0000000000a1', 'Northside Plumbing', false),
  ('00000000-0000-4000-8000-0000000000a2', 'Baseleap E2E', true);

insert into public.team_members (id, org_id, user_id, name, email, role) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1', 'Owner', 'owner@example.test', 'owner'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', 'Tech A', 'tech.a@example.test', 'technician'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b3', 'Tech B', 'tech.b@example.test', 'technician'),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b4', 'Tech C', 'tech.c@example.test', 'technician'),
  ('00000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b5', 'E2E Owner', 'e2e.owner@example.test', 'owner');

-- ---------- Tech A ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true);  -- older auth.uid() reads only this
set local role authenticated;

select is((select count(*) from public.organizations), 1::bigint, 'Tech A reads only their own org');
select is((select count(*) from public.team_members), 4::bigint, 'Tech A reads their own org''s team list only');
select throws_ok($$insert into public.team_members (org_id, user_id, name, email, role)
                   values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b7', 'Tech D', 'tech.d@example.test', 'technician')$$,
                 '42501', null, 'Tech A cannot add a team member (AC-002.6)');
update public.team_members set is_active = false where id = '00000000-0000-4000-8000-0000000000c3';
select is((select is_active from public.team_members where id = '00000000-0000-4000-8000-0000000000c3'), true, 'Tech A cannot remove Tech B');
select throws_ok($$delete from public.team_members where id = '00000000-0000-4000-8000-0000000000c3'$$, '42501', null, 'nobody deletes a team member');
reset role;

-- ---------- Owner ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b1', true);
set local role authenticated;

select lives_ok($$insert into public.team_members (id, org_id, user_id, name, email, role)
                  values ('00000000-0000-4000-8000-0000000000c7', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b7', 'Tech D', 'tech.d@example.test', 'technician')$$,
                'Owner adds a technician (AC-002.1)');
select is((select added_by from public.team_members where id = '00000000-0000-4000-8000-0000000000c7'), '00000000-0000-4000-8000-0000000000c1'::uuid, 'the row keeps who added them (AC-002.8)');
select throws_ok($$insert into public.team_members (org_id, user_id, name, email, role)
                   values ('00000000-0000-4000-8000-0000000000a1', null, 'Dup', 'TECH.A@example.test', 'technician')$$,
                 'BLA05', null, 'a row must point at the auth user created for that email');
select throws_ok($$insert into public.team_members (org_id, user_id, name, email, role)
                   values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', 'Dup', 'TECH.A@example.test', 'technician')$$,
                 '23505', null, 'duplicate email refused regardless of case (AC-002.3)');
select throws_ok($$insert into public.team_members (org_id, user_id, name, email, role)
                   values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b5', 'Second owner', 'e2e.owner@example.test', 'owner')$$,
                 '42501', null, 'the owner cannot add a second owner (NG-12)');
select lives_ok($$update public.team_members set is_active = false where id = '00000000-0000-4000-8000-0000000000c4'$$, 'Owner removes Tech C (AC-011.1)');
select isnt((select removed_at from public.team_members where id = '00000000-0000-4000-8000-0000000000c4'), null, 'removal is stamped');
select lives_ok($$update public.team_members set is_active = true where id = '00000000-0000-4000-8000-0000000000c4'$$, 'Owner re-adds Tech C on the same row (AC-011.5)');
select throws_ok($$update public.team_members set is_active = false where id = '00000000-0000-4000-8000-0000000000c1'$$, '23514', null, 'the owner cannot remove themselves (AC-011.4)');
select throws_ok($$update public.team_members set role = 'owner' where id = '00000000-0000-4000-8000-0000000000c2'$$, 'BLA04', null, 'roles cannot be changed');
reset role;

select is((select count(*) from public.events where name = 'team_member_removed' and properties ->> 'team_member_id' = '00000000-0000-4000-8000-0000000000c4'),
          1::bigint, 'team_member_removed recorded once');
select is((select count(*) from public.events where name = 'team_member_added' and (properties ->> 'reactivated')::boolean and properties ->> 'team_member_id' = '00000000-0000-4000-8000-0000000000c4'),
          1::bigint, 'team_member_added with reactivated = true on re-add');

-- ---------- E2E test org owner ----------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b5","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b5', true);
set local role authenticated;
select is((select count(*) from public.team_members where org_id = '00000000-0000-4000-8000-0000000000a1'), 0::bigint, 'another org cannot read this team list');
reset role;

-- ---------- Removed member ----------
update public.team_members set is_active = false where id = '00000000-0000-4000-8000-0000000000c3';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b3', true);
set local role authenticated;
select is((select count(*) from public.team_members), 0::bigint, 'a removed member reads no team data');
select is((select count(*) from public.organizations), 0::bigint, 'a removed member reads no org data');
reset role;

select * from finish();
rollback;
