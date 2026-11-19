// Black-box contract checks against docs/openapi.yaml: health, board, validation limits, idempotency, versions,
// ordering, headers. Validation boundaries double as the fuzz-lite table (qa-fuzz proper runs in Phase 3 from
// tests/fuzz/, schema-driven).
//
// Built endpoints (QA3): GET /health, GET /me, GET /board, POST /jobs, PUT /jobs/{id}/status. Tests that need an endpoint that
// does not exist yet sit in a describe that starts with `test.fixme(true, reason)` (support/unbuilt.ts), unchanged otherwise.
// "@smoke" in a title puts the test in the staging smoke run (`playwright test --grep @smoke`).
import { type APIRequestContext } from '@playwright/test';
import { test, expect, onLocalStack } from '../support/fixtures';
import { addDays, chars, jobBody, uniq, uuid } from '../support/data';
import { apiAnon, apiAs, board, createJob, expectProblem, getJob, loadIds, type Job } from '../support/api';
import { UNBUILT, VERCEL_ONLY } from '../support/unbuilt';

let owner: APIRequestContext, techA: APIRequestContext, techB: APIRequestContext, anon: APIRequestContext;
test.beforeAll(async () => {
  [owner, techA, techB, anon] = await Promise.all([apiAs('owner'), apiAs('techA'), apiAs('techB'), apiAnon()]);
});
test.afterAll(async () => { await Promise.all([owner, techA, techB, anon].map((c) => c?.dispose())); });

test.describe('health (US-006)', () => {
  test('AC-006.3 @smoke GET /api/health returns 200 {status, checks, version} with no session and no personal data', async () => {
    const res = await anon.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'ok', checks: { app: 'ok' } });
    expect(typeof body.version).toBe('string');
    expect(Object.keys(body).sort()).toEqual(['checks', 'status', 'version']);
  });
  test('AC-006.3 @smoke GET /api/health?check=db returns 200 with db ok', async () => {
    const res = await anon.get('/api/health?check=db');
    expect(res.status()).toBe(200);
    expect((await res.json()).checks.db).toBe('ok');
  });
  test('AC-006.3 GET /api/health?check=nonsense is a 400 problem, not a 500', async () => {
    await expectProblem(await anon.get('/api/health?check=nonsense'), 400, 'bad_request');
  });
});

test.describe('session and board shape (US-004)', () => {
  test('AC-004.8 @smoke GET /me returns the org time zone America/Toronto and a YYYY-MM-DD today', async () => {
    const me = await (await owner.get('/api/me')).json();
    expect(me.org.time_zone).toBe('America/Toronto');
    expect(me.org.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(me.member.role).toBe('owner');
    expect((await (await techA.get('/api/me')).json()).member.role).toBe('technician');
  });

  test('AC-004.8 the board without ?date is the Toronto date, whatever the caller sends in headers', async () => {
    const me = await (await owner.get('/api/me')).json();
    const res = await owner.get('/api/board', { headers: { 'accept-language': 'en-US', date: 'Mon, 01 Jan 2035 00:00:00 GMT' } });
    const b = await res.json();
    expect(b.date).toBe(me.org.today);
    expect(b.is_today).toBe(true);
  });

  test('AC-004.1 @smoke board responses are no-store and match the BoardDay shape', async () => {
    const res = await techA.get('/api/board');
    expect(res.headers()['cache-control'] ?? '').toContain('no-store');
    const b = await res.json();
    expect(Object.keys(b).sort()).toEqual(['date', 'is_today', 'job_count', 'jobs', 'today', 'truncated', 'viewer']);
    expect(b.viewer.role).toBe('technician');
  });

  test('AC-010.6 GET /board?date= with a bad or out-of-range date -> 422, not a 500', async () => {
    for (const d of ['2026-02-30', '2019-12-31', '2101-01-01', 'tomorrow', '2026-13-01', '']) {
      const res = await owner.get(`/api/board?date=${encodeURIComponent(d)}`);
      expect([400, 422], `date=${d}`).toContain(res.status());
    }
    for (const d of ['2020-01-01', '2100-12-31']) expect((await owner.get(`/api/board?date=${d}`)).status()).toBe(200);
  });

  test('AC-004.5 / AC-010.5 an empty day is 200 with job_count 0, not an error', async () => {
    const b = await board(owner, '2099-06-15');
    expect(b).toMatchObject({ job_count: 0, jobs: [], truncated: false, is_today: false });
  });

  test('AC-004.1 / AC-004.2 / AC-004.3 owner, Tech A and Tech B see the same jobs in the same order', async () => {
    const ids = loadIds();
    const date = addDays(ids.today, 40);
    const mk = (t: string, who: string) => createJob(owner, { assigned_member_id: who, job_date: date, start_time: t, title: uniq(`order ${t}`) });
    const a = await mk('15:30', ids.techA.id), b = await mk('09:00', ids.techA.id), c = await mk('11:00', ids.techB.id);
    const [o, ta, tb] = await Promise.all([board(owner, date), board(techA, date), board(techB, date)]);
    const order = (x: typeof o) => x.jobs.map((j) => j.id);
    expect(order(o)).toEqual([b.id, c.id, a.id]);
    expect(order(ta)).toEqual(order(o));
    expect(order(tb)).toEqual(order(o));
  });

  test('AC-004.6 two jobs at the same start time: the one created first is listed first', async () => {
    const ids = loadIds();
    const date = addDays(ids.today, 41);
    const first = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: date, start_time: '10:00', title: uniq('tie 1') });
    const second = await createJob(owner, { assigned_member_id: ids.techB.id, job_date: date, start_time: '10:00', title: uniq('tie 2') });
    expect((await board(techA, date)).jobs.map((j) => j.id)).toEqual([first.id, second.id]);
  });

  test('AC-004.7 / FR-6 50 jobs on one day are all returned in one response, none cut off', async () => {
    test.setTimeout(120_000);
    const ids = loadIds();
    const date = addDays(ids.today, 42);
    // 50 jobs over 24 hours: jobs 48 and 49 share a start time with jobs 0 and 1. The board lists by start time, then by
    // creation (AC-004.6), so the expected order is that sort of the creation order, not the creation order itself.
    const made: { id: string; start: string }[] = [];
    for (let i = 0; i < 50; i++) {
      const hh = String(Math.floor(i / 2) % 24).padStart(2, '0'), mm = i % 2 ? '30' : '00';
      const start = `${hh}:${mm}`;
      made.push({ id: (await createJob(owner, { assigned_member_id: i % 2 ? ids.techA.id : ids.techB.id, job_date: date, start_time: start, title: uniq(`bulk ${i}`) })).id, start });
    }
    const expected = made.map((m, created) => ({ ...m, created })).sort((x, y) => x.start.localeCompare(y.start) || x.created - y.created).map((m) => m.id);
    const b = await board(techB, date);
    expect(b.job_count).toBe(50);
    expect(b.truncated).toBe(false);
    expect(b.jobs.map((j) => j.id)).toEqual(expected);
  });

  test('AC-010.7 on 2027-03-14 (clocks move forward) 08:00 is listed before 09:00', async () => {
    const ids = loadIds();
    const nine = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: '2027-03-14', start_time: '09:00', title: uniq('dst 09') });
    const eight = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: '2027-03-14', start_time: '08:00', title: uniq('dst 08') });
    const b = await board(owner, '2027-03-14');
    const idsInOrder = b.jobs.map((j) => j.id);
    expect(idsInOrder.indexOf(eight.id)).toBeLessThan(idsInOrder.indexOf(nine.id));
    expect(b.jobs.find((j) => j.id === eight.id)!.start_time).toBe('08:00');
  });
});

test.describe('create-job validation and limits (US-003, FR-4)', () => {
  const post = async (over: Record<string, unknown>) => {
    const ids = loadIds();
    return owner.post('/api/jobs', { data: { ...jobBody({ assigned_member_id: ids.techA.id, job_date: ids.today }), ...over } });
  };
  const fieldErr = async (res: import('@playwright/test').APIResponse, field: string) => {
    const p = await expectProblem(res, 422, 'validation_failed');
    expect(p.errors.map((e: { field: string }) => e.field)).toContain(field);
  };

  test('AC-003.3 each missing required field gets its own error and nothing is saved', async () => {
    const ids = loadIds();
    const full = jobBody({ assigned_member_id: ids.techA.id, job_date: ids.today });
    for (const field of ['title', 'address', 'start_time', 'assigned_member_id'] as const) {
      const { [field]: _omit, ...rest } = full; void _omit;
      const res = await owner.post('/api/jobs', { data: { ...rest, client_request_id: uuid() } });
      expect([400, 422], `missing ${field}`).toContain(res.status());
      if (res.status() === 422) await fieldErr(res, field);
    }
    const blank = await post({ title: '   ', client_request_id: uuid() });
    await fieldErr(blank, 'title');
    await fieldErr(await post({ address: '', client_request_id: uuid() }), 'address');
  });

  for (const [field, max] of [['title', 100], ['customer_name', 100], ['address', 200], ['notes', 2000]] as const) {
    test(`AC-003.4 ${field}: ${max} characters accepted, ${max + 1} rejected with too_long`, async () => {
      const ok = await post({ [field]: chars(max), client_request_id: uuid() });
      expect(ok.status(), `at the limit: ${(await ok.text()).slice(0, 150)}`).toBe(201);
      const over = await post({ [field]: chars(max + 1), client_request_id: uuid() });
      const p = await expectProblem(over, 422, 'validation_failed');
      expect(p.errors.find((e: { field: string }) => e.field === field)?.code).toBe('too_long');
    });
  }

  test('AC-003.4 length counts Unicode code points, not UTF-16 units: 100 emoji title is accepted, 101 is not', async () => {
    expect((await post({ title: '😀'.repeat(100), client_request_id: uuid() })).status()).toBe(201);
    await fieldErr(await post({ title: '😀'.repeat(101), client_request_id: uuid() }), 'title');
  });

  for (const bad of ['call me', '123456', '1'.repeat(21), '(905) 555-0123 ext 4', '+1 905 555 0123 <b>']) {
    test(`AC-003.5 customer_phone ${JSON.stringify(bad)} -> 422 invalid_format`, async () => {
      const p = await expectProblem(await post({ customer_phone: bad, client_request_id: uuid() }), 422, 'validation_failed');
      expect(p.errors.find((e: { field: string }) => e.field === 'customer_phone')?.code).toBe('invalid_format');
    });
  }
  for (const good of ['(905) 555-0123', '1234567', '1'.repeat(20), null, '', '   ']) {
    test(`AC-003.5 customer_phone ${JSON.stringify(good)} is accepted (blank means not entered)`, async () => {
      const res = await post({ customer_phone: good, client_request_id: uuid() });
      expect(res.status()).toBe(201);
      const j: Job = await res.json();
      expect(j.customer_phone === null || j.customer_phone === good).toBe(true);
      if (good === '' || good === '   ') expect(j.customer_phone).toBeNull();
    });
  }

  for (const bad of ['2026-02-30', '2019-12-31', '2101-01-01', '12/11/2026', 'not a date']) {
    test(`AC-010.6 job_date ${bad} -> 422 invalid_date`, async () => {
      const p = await expectProblem(await post({ job_date: bad, client_request_id: uuid() }), 422, 'validation_failed');
      expect(p.errors.find((e: { field: string }) => e.field === 'job_date')).toBeTruthy();
    });
  }
  for (const good of ['2020-01-01', '2100-12-31']) {
    test(`AC-010.2 job_date ${good} (range edge) is accepted`, async () => {
      expect((await post({ job_date: good, client_request_id: uuid() })).status()).toBe(201);
    });
  }
  for (const bad of ['24:00', '9:00', '09:60', '', '09:00:00', 'noon']) {
    test(`FR-4 start_time ${JSON.stringify(bad)} -> rejected`, async () => {
      expect([400, 422]).toContain((await post({ start_time: bad, client_request_id: uuid() })).status());
    });
  }

  test('AC-003.7 a start time earlier than now on today\'s date is accepted and listed in time order', async () => {
    const ids = loadIds();
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, start_time: '00:01', title: uniq('past') });
    const b = await board(techA);
    expect(b.jobs.findIndex((x) => x.id === j.id)).toBeGreaterThanOrEqual(0);
    const times = b.jobs.map((x) => x.start_time);
    expect([...times].sort()).toEqual(times);
  });

  test('AC-003.8 text with markup, ampersand, emoji and line breaks is stored and returned exactly as typed', async () => {
    const notes = '<script>alert(1)</script> & 😀\nline two\n\nline four';
    const res = await post({ notes, title: uniq('markup <b>x</b>'), client_request_id: uuid() });
    expect(res.status()).toBe(201);
    const j: Job = await res.json();
    expect(j.notes).toBe(notes);
    expect(j.title).toContain('<b>x</b>');
    expect((await getJob(techB, j.id, j.job_date)).notes).toBe(notes);
  });

  test('AC-003.6 @smoke the same client_request_id twice creates exactly one job (second returns 200 with the same job)', async () => {
    const ids = loadIds();
    const body = jobBody({ assigned_member_id: ids.techA.id, job_date: addDays(ids.today, 43), title: uniq('idem') });
    const [r1, r2] = await Promise.all([owner.post('/api/jobs', { data: body }), owner.post('/api/jobs', { data: body })]);
    expect([r1.status(), r2.status()].sort()).toEqual([200, 201]);
    expect((await r1.json()).id).toBe((await r2.json()).id);
    expect((await board(owner, body.job_date)).jobs.filter((j) => j.title === body.title)).toHaveLength(1);
    const again = await owner.post('/api/jobs', { data: body });
    expect(again.status()).toBe(200);
  });

  test('AC-003.1 / FR-9 @smoke a new job starts Scheduled at version 1 with the assigned technician and permissions', async () => {
    const ids = loadIds();
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, start_time: '15:30', title: uniq('Leaking kitchen faucet') });
    expect(j).toMatchObject({ status: 'scheduled', version: 1, start_time: '15:30', is_mine: false });
    expect(j.assigned_technician.id).toBe(ids.techA.id);
    expect(j.permissions).toEqual({ change_status: true, edit_notes: true, edit_all: true, cancel: true });
  });
});

test.describe('status rules and versions on the built endpoints (US-007 to US-010)', () => {
  const fresh = async (): Promise<Job> => {
    const ids = loadIds();
    return createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('ver') });
  };

  test('AC-007.1 / AC-007.6 @smoke technician sets In progress, Done, then back to In progress (any to any)', async () => {
    let j = await fresh();
    for (const s of ['in_progress', 'done', 'in_progress', 'scheduled'] as const) {
      const res = await techA.put(`/api/jobs/${j.id}/status`, { data: { version: j.version, status: s } });
      expect(res.status()).toBe(200);
      j = await res.json();
      expect(j.status).toBe(s);
    }
    expect((await getJob(techB, j.id)).status).toBe('scheduled');
  });

  test('AC-007.8 (status-only variant) a status save from an old view -> 409 stale_version with the latest job; the other change is kept', async () => {
    // The original, which makes the other change with PATCH, is in the "needs PATCH" group below.
    const j = await fresh();
    const ownerSet = await owner.put(`/api/jobs/${j.id}/status`, { data: { version: j.version, status: 'in_progress' } });
    expect(ownerSet.status()).toBe(200);
    const stale = await techA.put(`/api/jobs/${j.id}/status`, { data: { version: j.version, status: 'done' } });
    const p = await expectProblem(stale, 409, 'stale_version');
    expect(p.current.status).toBe('in_progress');
    expect(p.current.version).toBe(j.version + 1);
    const now = await getJob(owner, j.id);
    expect(now.status).toBe('in_progress');
  });

  test('AC-007.9 two simultaneous Done taps -> status Done and exactly one version step', async () => {
    const j = await fresh();
    const [a, b] = await Promise.all([
      techA.put(`/api/jobs/${j.id}/status`, { data: { version: j.version, status: 'done' } }),
      techA.put(`/api/jobs/${j.id}/status`, { data: { version: j.version, status: 'done' } }),
    ]);
    expect([a.status(), b.status()]).toEqual([200, 200]);
    const now = await getJob(owner, j.id);
    expect(now.status).toBe('done');
    expect(now.version).toBe(j.version + 1);
  });

  test('AC-008.3 owner sets any status, including Done', async () => {
    const j = await fresh();
    const r = await owner.put(`/api/jobs/${j.id}/status`, { data: { version: j.version, status: 'done' } });
    expect(r.status()).toBe(200);
    expect((await getJob(techB, j.id)).status).toBe('done');
  });

  test('AC-009.1 (via PUT status) owner cancels: the job keeps its place on the board marked cancelled and still counts', async () => {
    // POST /jobs/{id}/cancel is not built; the owner can set Cancelled through the status endpoint (permission matrix).
    const ids = loadIds();
    const date = addDays(ids.today, 45);
    const a = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: date, start_time: '09:00', title: uniq('c1') });
    const b = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: date, start_time: '15:30', title: uniq('c2') });
    const c = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: date, start_time: '18:00', title: uniq('c3') });
    expect((await owner.put(`/api/jobs/${b.id}/status`, { data: { version: b.version, status: 'cancelled' } })).status()).toBe(200);
    const day = await board(techB, date);
    expect(day.jobs.map((j) => j.id)).toEqual([a.id, b.id, c.id]);
    expect(day.jobs[1].status).toBe('cancelled');
    expect(day.job_count).toBe(3);
  });

  test('AC-009.4 (via PUT status) owner restores a cancelled job to Scheduled; the technician can change it again', async () => {
    const j = await fresh();
    const cancelled: Job = await (await owner.put(`/api/jobs/${j.id}/status`, { data: { version: j.version, status: 'cancelled' } })).json();
    expect(cancelled.status).toBe('cancelled');
    const restored = await owner.put(`/api/jobs/${j.id}/status`, { data: { version: cancelled.version, status: 'scheduled' } });
    expect(restored.status()).toBe(200);
    const r: Job = await restored.json();
    expect(r.status).toBe('scheduled');
    expect((await techA.put(`/api/jobs/${j.id}/status`, { data: { version: r.version, status: 'in_progress' } })).status()).toBe(200);
  });

  test('AC-010.2 owner creates a job for 2026-11-17: it is on that day\'s board and not on today\'s', async () => {
    const ids = loadIds();
    const date = '2026-11-17';
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: date, title: uniq('future') });
    expect((await board(owner, date)).jobs.map((x) => x.id)).toContain(j.id);
    if (ids.today !== date) expect((await board(owner)).jobs.map((x) => x.id)).not.toContain(j.id);
  });

  test('AC-010.3 a technician can read a past day\'s jobs with notes, but cannot create there', async () => {
    const ids = loadIds();
    const date = addDays(ids.today, -3);
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: date, notes: 'yesterday notes', title: uniq('past day') });
    const day = await board(techB, date);
    expect(day.jobs.find((x) => x.id === j.id)?.notes).toBe('yesterday notes');
    await expectProblem(await techB.post('/api/jobs', { data: jobBody({ assigned_member_id: ids.techA.id, job_date: date }) }), 403, 'not_allowed');
  });

  test('AC-010.1 the board for a given date is returned with is_today false and today still reported', async () => {
    const ids = loadIds();
    const next = addDays(ids.today, 1);
    const b = await board(techA, next);
    expect(b).toMatchObject({ date: next, today: ids.today, is_today: false });
  });
});

// ---- Contract tests whose endpoint is not built yet. Unchanged from QA1; each runs as soon as its fixme line is removed. ----

test.describe('needs PATCH /api/jobs/{job_id} (not built)', () => {
  test.fixme(true, UNBUILT.patchJob);
  const fresh = async (): Promise<Job> => {
    const ids = loadIds();
    return createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('ver') });
  };

  test('AC-007.2 technician saves notes on own job; every user then sees them', async () => {
    const j = await fresh();
    const res = await techA.patch(`/api/jobs/${j.id}`, { data: { version: j.version, notes: 'Replaced washer, customer wants a quote for the tap' } });
    expect(res.status()).toBe(200);
    expect((await getJob(owner, j.id)).notes).toBe('Replaced washer, customer wants a quote for the tap');
    expect((await getJob(techB, j.id)).notes).toBe('Replaced washer, customer wants a quote for the tap');
  });

  test('AC-007.7 notes: 2000 characters saved, 2001 rejected and the old notes kept', async () => {
    let j = await fresh();
    const ok = await techA.patch(`/api/jobs/${j.id}`, { data: { version: j.version, notes: chars(2000) } });
    expect(ok.status()).toBe(200);
    j = await ok.json();
    const over = await techA.patch(`/api/jobs/${j.id}`, { data: { version: j.version, notes: chars(2001) } });
    await expectProblem(over, 422, 'validation_failed');
    expect((await getJob(owner, j.id)).notes).toBe(chars(2000));
  });

  test('AC-007.8 a status save from an old view after an owner edit -> 409 stale_version with the latest job; the other change is kept', async () => {
    const j = await fresh();
    const ownerEdit = await owner.patch(`/api/jobs/${j.id}`, { data: { version: j.version, start_time: '16:00' } });
    expect(ownerEdit.status()).toBe(200);
    const stale = await techA.put(`/api/jobs/${j.id}/status`, { data: { version: j.version, status: 'in_progress' } });
    const p = await expectProblem(stale, 409, 'stale_version');
    expect(p.current.start_time).toBe('16:00');
    const now = await getJob(owner, j.id);
    expect(now.start_time).toBe('16:00');
    expect(now.status).toBe('scheduled');
  });

  test('AC-008.6 an owner edit from an old view -> 409 stale_version; the technician\'s change is kept', async () => {
    const j = await fresh();
    expect((await techA.put(`/api/jobs/${j.id}/status`, { data: { version: j.version, status: 'in_progress' } })).status()).toBe(200);
    const stale = await owner.patch(`/api/jobs/${j.id}`, { data: { version: j.version, title: uniq('late edit') } });
    await expectProblem(stale, 409, 'stale_version');
    expect((await getJob(owner, j.id)).status).toBe('in_progress');
  });

  test('AC-008.1 owner changes the start time; the board re-orders by the new time', async () => {
    const ids = loadIds();
    const date = addDays(ids.today, 44);
    const a = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: date, start_time: '15:30', title: uniq('move') });
    const b = await createJob(owner, { assigned_member_id: ids.techB.id, job_date: date, start_time: '15:45', title: uniq('stay') });
    expect((await board(techB, date)).jobs.map((j) => j.id)).toEqual([a.id, b.id]);
    expect((await owner.patch(`/api/jobs/${a.id}`, { data: { version: a.version, start_time: '16:00' } })).status()).toBe(200);
    expect((await board(techB, date)).jobs.map((j) => j.id)).toEqual([b.id, a.id]);
  });

  test('AC-008.2 owner reassigns A to B: B can change it, A can no longer', async () => {
    const ids = loadIds();
    const j = await fresh();
    const r = await owner.patch(`/api/jobs/${j.id}`, { data: { version: j.version, assigned_member_id: ids.techB.id } });
    expect(r.status()).toBe(200);
    const moved: Job = await r.json();
    expect(moved.assigned_technician.id).toBe(ids.techB.id);
    expect((await techB.put(`/api/jobs/${j.id}/status`, { data: { version: moved.version, status: 'done' } })).status()).toBe(200);
    await expectProblem(await techA.put(`/api/jobs/${j.id}/status`, { data: { version: moved.version + 1, status: 'in_progress' } }), 403, 'not_allowed');
  });

  test('AC-008.4 owner edit with an emptied required field, an over-long value or a bad phone -> 422, job unchanged', async () => {
    const j = await fresh();
    for (const data of [{ title: '' }, { address: '' }, { title: chars(101) }, { address: chars(201) }, { notes: chars(2001) }, { customer_phone: 'call me' }, { start_time: '25:00' }]) {
      const res = await owner.patch(`/api/jobs/${j.id}`, { data: { version: j.version, ...data } });
      expect([400, 422], JSON.stringify(data)).toContain(res.status());
    }
    expect(await getJob(owner, j.id)).toEqual(j);
  });
});

test.describe('needs POST /api/jobs/{job_id}/cancel (not built)', () => {
  test.fixme(true, UNBUILT.cancel);
  const fresh = async (): Promise<Job> => {
    const ids = loadIds();
    return createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('ver') });
  };

  test('AC-009.1 owner cancels: the job keeps its place on the board marked cancelled', async () => {
    const ids = loadIds();
    const date = addDays(ids.today, 46);
    const a = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: date, start_time: '09:00', title: uniq('c1') });
    const b = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: date, start_time: '15:30', title: uniq('c2') });
    const c = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: date, start_time: '18:00', title: uniq('c3') });
    expect((await owner.post(`/api/jobs/${b.id}/cancel`, { data: { version: b.version } })).status()).toBe(200);
    const day = await board(techB, date);
    expect(day.jobs.map((j) => j.id)).toEqual([a.id, b.id, c.id]);
    expect(day.jobs[1].status).toBe('cancelled');
    expect(day.job_count).toBe(3);
  });

  test('AC-009.4 owner restores a cancelled job to Scheduled; the technician can change it again', async () => {
    const j = await fresh();
    const cancelled: Job = await (await owner.post(`/api/jobs/${j.id}/cancel`, { data: { version: j.version } })).json();
    const restored = await owner.put(`/api/jobs/${j.id}/status`, { data: { version: cancelled.version, status: 'scheduled' } });
    expect(restored.status()).toBe(200);
    const r: Job = await restored.json();
    expect(r.status).toBe('scheduled');
    expect((await techA.put(`/api/jobs/${j.id}/status`, { data: { version: r.version, status: 'in_progress' } })).status()).toBe(200);
  });

  test('AC-009.5 cancelling an already-cancelled job from an old view -> 200, still cancelled, version unchanged', async () => {
    const j = await fresh();
    const c1: Job = await (await owner.post(`/api/jobs/${j.id}/cancel`, { data: { version: j.version } })).json();
    const again = await owner.post(`/api/jobs/${j.id}/cancel`, { data: { version: j.version } }); // old version on purpose
    expect(again.status()).toBe(200);
    const c2: Job = await again.json();
    expect(c2.status).toBe('cancelled');
    expect(c2.version).toBe(c1.version);
  });
});

test.describe('needs GET /api/technicians (not built)', () => {
  test.fixme(true, UNBUILT.technicians);
  test('AC-008.5 / AC-011.3 GET /technicians lists active technicians only (no owner), names only', async () => {
    const ids = loadIds();
    const body = await (await owner.get('/api/technicians?limit=100')).json();
    const got = body.data as { id: string; name: string }[];
    expect(got.map((t) => t.id)).toEqual(expect.arrayContaining([ids.techA.id, ids.techB.id]));
    expect(got.map((t) => t.id)).not.toContain(ids.owner.id);
    for (const t of got) expect(Object.keys(t).sort()).toEqual(['id', 'name']);
  });
});

test.describe('headers (SECURITY invariants 11, 12, 14)', () => {
  test('SECURITY 14 board and me responses carry Cache-Control: no-store', async () => {
    for (const path of ['/api/board', '/api/me']) {
      expect((await owner.get(path)).headers()['cache-control'] ?? '', path).toContain('no-store');
    }
    const ids = loadIds();
    const created = await owner.post('/api/jobs', { data: jobBody({ assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('hdr') }) });
    expect(created.headers()['cache-control'] ?? '', 'POST /api/jobs').toContain('no-store');
  });

  test('SECURITY 14 GET /api/jobs/{id} carries Cache-Control: no-store', async () => {
    test.fixme(true, UNBUILT.getJob);
    const ids = loadIds();
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('hdr') });
    expect((await owner.get(`/api/jobs/${j.id}`)).headers()['cache-control'] ?? '').toContain('no-store');
  });

  test('SECURITY 14 pages are not frameable and carry the baseline security headers', async () => {
    test.skip(onLocalStack(), VERCEL_ONLY);
    const res = await anon.get('/sign-in');
    const h = res.headers();
    const frameBlocked = (h['x-frame-options'] ?? '').toUpperCase() === 'DENY' || /frame-ancestors\s+'none'/.test(h['content-security-policy'] ?? '');
    expect(frameBlocked, 'X-Frame-Options: DENY or CSP frame-ancestors none').toBe(true);
    expect(h['referrer-policy']).toBe('same-origin');
    expect(h['x-content-type-options']).toBe('nosniff');
  });

  test('SECURITY 12 service worker is served and its fetch handler never touches /api/ or board pages', async () => {
    test.fixme(true, UNBUILT.sw);
    const res = await anon.get('/sw.js');
    expect(res.status()).toBe(200);
    const src = await res.text();
    expect(src).not.toMatch(/['"`]\/api\//);
    expect(src).toMatch(/offline/);
  });

  test('SECURITY 3 problem+json errors never leak SQL or stack traces (malformed JSON and bad ids)', async () => {
    const bad = await owner.post('/api/jobs', { data: Buffer.from('{not json', 'utf8'), headers: { 'content-type': 'application/json' } });
    expect(bad.status(), 'truly malformed JSON must be 400 bad_request').toBe(400);
    expect(await bad.text()).not.toMatch(/syntax error at|stack|\.ts:\d+|pg_|select .* from/i);
    const notUuid = await owner.put('/api/jobs/not-a-uuid/status', { data: { version: 1, status: 'done' } });
    expect([400, 404, 422]).toContain(notUuid.status());
    expect(await notUuid.text()).not.toMatch(/syntax error at|stack|\.ts:\d+|pg_|select .* from|invalid input syntax/i);
  });
});
