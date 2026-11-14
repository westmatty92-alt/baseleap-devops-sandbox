// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/board/route';
import { GetBoardResponse } from '@/lib/api/generated/board/board.zod';
import { adminClient, arrangeJob, authed, cleanupTenant, request, testTenant, type Tenant } from '../helpers/auth';

let t: Tenant;
let ids: { early: string; lateA: string; lateB: string; cancelled: string; otherOrg: string };
const DAY = '2026-11-12';

beforeAll(async () => {
  t = await testTenant();
  // two jobs at 10:00 (created lateA first) and one at 08:00 inserted after them
  const lateA = await arrangeJob(t, { job_date: DAY, start_time: '10:00', title: 'late A' });
  const lateB = await arrangeJob(t, { job_date: DAY, start_time: '10:00', title: 'late B', assigned_member_id: t.techB.memberId });
  const early = await arrangeJob(t, { job_date: DAY, start_time: '08:00', title: 'early' });
  const cancelled = await arrangeJob(t, { job_date: DAY, start_time: '12:00', title: 'cancelled one' });
  await arrangeJob(t, { job_date: '2026-11-13', start_time: '09:00', title: 'tomorrow' });
  const otherOrg = await arrangeJob(
    { ...t, orgId: t.other.orgId, owner: t.other.owner, techA: t.other.tech },
    { job_date: DAY, title: 'other org' },
  );
  await adminClient().from('jobs').update({ status: 'cancelled' }).eq('id', cancelled.id);
  ids = { early: early.id, lateA: lateA.id, lateB: lateB.id, cancelled: cancelled.id, otherOrg: otherOrg.id };
});
afterAll(async () => {
  await cleanupTenant(t);
});

const get = (path: string, user?: { accessToken: string }) =>
  GET(user ? authed(request('GET', path), user) : request('GET', path), undefined);

describe('GET /api/board (getBoard)', () => {
  it('AC-004.6 returns the day in start-time order, ties by earliest created, cancelled kept', async () => {
    const res = await get(`/api/board?date=${DAY}`, t.owner);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = GetBoardResponse.parse(await res.json());
    expect(body.jobs.map((j) => j.id)).toEqual([ids.early, ids.lateA, ids.lateB, ids.cancelled]);
    expect(body.job_count).toBe(4);
    expect(body.truncated).toBe(false);
    expect(body.date).toBe(DAY);
    expect(body.viewer).toEqual({ member_id: t.owner.memberId, role: 'owner' });
    expect(body.jobs[0].start_time).toBe('08:00');
  });

  it('technician: is_mine and permissions follow the matrix', async () => {
    const body = GetBoardResponse.parse(await (await get(`/api/board?date=${DAY}`, t.techA)).json());
    const byId = Object.fromEntries(body.jobs.map((j) => [j.id, j]));
    expect(byId[ids.early].is_mine).toBe(true);
    expect(byId[ids.early].permissions).toEqual({ change_status: true, edit_notes: true, edit_all: false, cancel: false });
    expect(byId[ids.lateB].is_mine).toBe(false);
    expect(byId[ids.lateB].permissions.change_status).toBe(false);
    expect(byId[ids.cancelled].permissions.change_status).toBe(false); // own but cancelled
  });

  it('AC-004.8 without date uses today in the org time zone', async () => {
    const body = GetBoardResponse.parse(await (await get('/api/board', t.owner)).json());
    expect(body.date).toBe(body.today);
    expect(body.is_today).toBe(true);
  });

  it('an empty day is an empty list, not an error', async () => {
    const body = GetBoardResponse.parse(await (await get('/api/board?date=2030-01-01', t.owner)).json());
    expect(body.jobs).toEqual([]);
    expect(body.job_count).toBe(0);
  });

  it('no session → 401', async () => {
    expect((await get(`/api/board?date=${DAY}`)).status).toBe(401);
  });

  it("cross-tenant: never shows another org's jobs", async () => {
    const mine = GetBoardResponse.parse(await (await get(`/api/board?date=${DAY}`, t.owner)).json());
    expect(mine.jobs.map((j) => j.id)).not.toContain(ids.otherOrg);
    const theirs = GetBoardResponse.parse(await (await get(`/api/board?date=${DAY}`, t.other.owner)).json());
    expect(theirs.jobs.map((j) => j.id)).toEqual([ids.otherOrg]);
  });

  it('bad date, out-of-range date and unknown query field → 422', async () => {
    const paths = ['/api/board?date=nope', '/api/board?date=2019-12-31', '/api/board?date=2101-01-01', '/api/board?date=2026-02-30', `/api/board?date=${DAY}&extra=1`];
    for (const path of paths) {
      const res = await get(path, t.owner);
      expect(res.status, path).toBe(422);
      expect(res.headers.get('content-type')).toContain('application/problem+json');
      expect((await res.json()).code).toBe('validation_failed');
    }
  });
});
