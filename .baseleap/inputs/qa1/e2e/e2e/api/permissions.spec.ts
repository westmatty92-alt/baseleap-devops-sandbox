// Permission probes (qa-probe): every cell of the SECURITY_MODEL permission matrix, as a black-box HTTP call, per role.
// A crossed boundary here is Critical. Each denied call is followed by a read that proves nothing changed, taken
// from the API and, where the service role is available, from the database itself.
import { request as pwRequest, type APIRequestContext } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { apiAnon, apiAs, createJob, expectProblem, getJob, type Job } from '../support/api';
import { dropForeignTenant, jobRow, makeForeignTenant, type ForeignTenant } from '../support/admin';
import { accessTokenFor } from '../support/session';
import { NIL_UUID, jobBody, uniq, uniqueEmail, uuid } from '../support/data';

test.describe.configure({ mode: 'serial' });

let owner: APIRequestContext, techA: APIRequestContext, techB: APIRequestContext, anon: APIRequestContext;
let jobA: Job, jobB: Job, jobCancelled: Job;
let foreign: ForeignTenant;

test.beforeAll(async ({}, info) => {
  const ids = (await import('../support/api')).loadIds();
  [owner, techA, techB, anon] = await Promise.all([apiAs('owner'), apiAs('techA'), apiAs('techB'), apiAnon()]);
  jobA = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('perm A') });
  jobB = await createJob(owner, { assigned_member_id: ids.techB.id, job_date: ids.today, title: uniq('perm B') });
  jobCancelled = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('perm cancelled') });
  const c = await owner.post(`/api/jobs/${jobCancelled.id}/cancel`, { data: { version: jobCancelled.version } });
  expect(c.status()).toBe(200);
  jobCancelled = await c.json();
  foreign = await makeForeignTenant(`${Date.now()}`);
  info.annotations.push({ type: 'data', description: 'jobs stay in the is_test org (NG-6); foreign auth users removed in afterAll' });
});

test.afterAll(async () => {
  if (foreign) await dropForeignTenant(foreign);
  await Promise.all([owner, techA, techB, anon].map((c) => c?.dispose()));
});

const unchanged = async (job: Job) => {
  const now = await getJob(owner, job.id);
  expect({ ...now, updated_at: undefined }).toEqual({ ...job, updated_at: undefined });
};

test.describe('signed out (boundary: nothing is readable or writable without a session)', () => {
  const calls: [string, string, unknown?][] = [
    ['GET', '/api/me'], ['GET', '/api/board'], ['GET', '/api/jobs/' + NIL_UUID], ['GET', '/api/technicians'], ['GET', '/api/team'],
    ['POST', '/api/jobs', {}], ['PATCH', '/api/jobs/' + NIL_UUID, { version: 1, notes: 'x' }],
    ['PUT', `/api/jobs/${NIL_UUID}/status`, { version: 1, status: 'done' }], ['POST', `/api/jobs/${NIL_UUID}/cancel`, { version: 1 }],
    ['POST', '/api/team', { name: 'x', email: 'x@example.test' }], ['POST', `/api/team/${NIL_UUID}/remove`],
    ['POST', '/api/events', { name: 'board_load_failed', board_date: '2026-11-12', error_kind: 'network' }],
  ];
  for (const [method, path, body] of calls) {
    test(`AC-001.7 / FR-2 signed out ${method} ${path.replace(NIL_UUID, '{id}')} -> 401, no data [CRITICAL if not]`, async () => {
      const res = await anon.fetch(path, { method, data: body });
      const problem = await expectProblem(res, 401, 'unauthenticated');
      expect(JSON.stringify(problem)).not.toContain(jobA.title);
    });
  }

  test('AC-001.7 signed-out board page is a redirect to sign-in with no job data in the response', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const nav = await page.goto('/board');
    await expect(page).toHaveURL(/\/sign-in/);
    const html = (await nav!.text()) + (await page.content());
    expect(html).not.toContain(jobA.title);
    await ctx.close();
  });
});

test.describe('technician (boundary: status and notes on own, non-cancelled jobs only)', () => {
  test('AC-003.9 technician POST /jobs -> 403 not_allowed, no job created', async () => {
    const ids = (await import('../support/api')).loadIds();
    const title = uniq('tech create');
    const res = await techA.post('/api/jobs', { data: jobBody({ assigned_member_id: ids.techA.id, job_date: ids.today, title }) });
    await expectProblem(res, 403, 'not_allowed');
    const b = await owner.get(`/api/board?date=${ids.today}`);
    expect((await b.json()).jobs.map((j: Job) => j.title)).not.toContain(title);
  });

  for (const [field, value] of [
    ['title', 'Changed'], ['address', '9 Elsewhere Rd'], ['start_time', '23:59'], ['job_date', '2030-01-01'],
    ['customer_name', 'Changed Name'], ['customer_phone', '905 555 0000'], ['assigned_member_id', '__techB__'], ['status', 'done'],
  ] as const) {
    test(`AC-007.4 technician PATCH own job field ${field} -> 403, job unchanged`, async () => {
      const ids = (await import('../support/api')).loadIds();
      const v = value === '__techB__' ? ids.techB.id : value;
      const res = await techA.patch(`/api/jobs/${jobA.id}`, { data: { version: jobA.version, [field]: v } });
      await expectProblem(res, 403, 'not_allowed');
      await unchanged(jobA);
    });
  }

  test('AC-007.4 mixed PATCH (notes plus title) is refused whole: notes are not applied either', async () => {
    const res = await techA.patch(`/api/jobs/${jobA.id}`, { data: { version: jobA.version, notes: 'sneaky', title: 'Sneaky' } });
    await expectProblem(res, 403, 'not_allowed');
    await unchanged(jobA);
  });

  test('AC-007.3 technician PATCH notes on ANOTHER technician\'s job -> 403, unchanged', async () => {
    const res = await techA.patch(`/api/jobs/${jobB.id}`, { data: { version: jobB.version, notes: 'not mine' } });
    await expectProblem(res, 403, 'not_allowed');
    await unchanged(jobB);
  });

  test('AC-007.3 technician PUT status on ANOTHER technician\'s job -> 403, unchanged', async () => {
    const res = await techA.put(`/api/jobs/${jobB.id}/status`, { data: { version: jobB.version, status: 'done' } });
    await expectProblem(res, 403, 'not_allowed');
    await unchanged(jobB);
  });

  test('AC-007.5 technician cannot set Cancelled (PUT status and PATCH status)', async () => {
    const put = await techA.put(`/api/jobs/${jobA.id}/status`, { data: { version: jobA.version, status: 'cancelled' } });
    await expectProblem(put, 403, 'not_allowed');
    const patch = await techA.patch(`/api/jobs/${jobA.id}`, { data: { version: jobA.version, status: 'cancelled' } });
    await expectProblem(patch, 403, 'not_allowed');
    await unchanged(jobA);
  });

  test('AC-007.5 technician cannot change status or notes of a CANCELLED own job', async () => {
    const put = await techA.put(`/api/jobs/${jobCancelled.id}/status`, { data: { version: jobCancelled.version, status: 'in_progress' } });
    await expectProblem(put, 403, 'not_allowed');
    const patch = await techA.patch(`/api/jobs/${jobCancelled.id}`, { data: { version: jobCancelled.version, notes: 'after cancel' } });
    await expectProblem(patch, 403, 'not_allowed');
    await unchanged(jobCancelled);
  });

  test('AC-009.2 technician POST /jobs/{id}/cancel -> 403, job still active', async () => {
    const res = await techA.post(`/api/jobs/${jobA.id}/cancel`, { data: { version: jobA.version } });
    await expectProblem(res, 403, 'not_allowed');
    await unchanged(jobA);
  });

  test('FR-2 / AC-002.6 technician on the team API: GET /team, GET /technicians, POST /team, remove -> 403, team unchanged', async () => {
    const email = uniqueEmail('tech-add');
    await expectProblem(await techA.get('/api/team'), 403, 'not_allowed');
    await expectProblem(await techA.get('/api/technicians'), 403, 'not_allowed');
    await expectProblem(await techA.post('/api/team', { data: { name: 'Sneaky', email } }), 403, 'not_allowed');
    const ids = (await import('../support/api')).loadIds();
    await expectProblem(await techA.post(`/api/team/${ids.techB.id}/remove`), 403, 'not_allowed');
    const team = await (await owner.get('/api/team?limit=100')).json();
    expect(team.data.map((m: { email: string }) => m.email)).not.toContain(email);
    expect(team.data.find((m: { id: string }) => m.id === ids.techB.id).is_active).toBe(true);
  });

  test('AC-004.3 positive control: a technician reads every job on the board, including another technician\'s', async () => {
    const ids = (await import('../support/api')).loadIds();
    const res = await techA.get(`/api/board?date=${ids.today}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.jobs.map((j: Job) => j.id)).toEqual(expect.arrayContaining([jobA.id, jobB.id]));
    const mine = body.jobs.find((j: Job) => j.id === jobA.id), theirs = body.jobs.find((j: Job) => j.id === jobB.id);
    expect(mine.permissions).toMatchObject({ change_status: true, edit_notes: true, edit_all: false, cancel: false });
    expect(theirs.permissions).toMatchObject({ change_status: false, edit_notes: false, edit_all: false, cancel: false });
  });
});

test.describe('owner (boundary: no delete, no self-assignment, no removing the owner)', () => {
  test('AC-009.2 DELETE on every resource -> 405 for owner and technician, rows still exist', async () => {
    const ids = (await import('../support/api')).loadIds();
    for (const ctx of [owner, techA]) {
      for (const path of [`/api/jobs/${jobA.id}`, '/api/jobs', `/api/team/${ids.techA.id}`, '/api/team', '/api/board', `/api/team/${ids.techA.id}/remove`]) {
        const res = await ctx.delete(path);
        expect([405, 404], `DELETE ${path} -> ${res.status()}`).toContain(res.status());
        expect(res.status(), `DELETE ${path} must not succeed`).toBeGreaterThanOrEqual(400);
      }
    }
    await getJob(owner, jobA.id);
    expect((await jobRow(jobA.id))?.id).toBe(jobA.id);
  });

  test('OQ-8 owner cannot assign a job to themselves -> 422 technician_not_assignable', async () => {
    const ids = (await import('../support/api')).loadIds();
    const res = await owner.post('/api/jobs', { data: jobBody({ assigned_member_id: ids.owner.id, job_date: ids.today }) });
    const p = await expectProblem(res, 422, 'validation_failed');
    expect(JSON.stringify(p.errors)).toContain('technician_not_assignable');
  });

  test('AC-011.4 owner cannot remove themselves -> 403 owner_cannot_be_removed', async () => {
    const ids = (await import('../support/api')).loadIds();
    await expectProblem(await owner.post(`/api/team/${ids.owner.id}/remove`), 403, 'owner_cannot_be_removed');
    expect((await (await owner.get('/api/me')).json()).member.role).toBe('owner');
  });

  test('SECURITY invariant 4/5 owner cannot add a second owner (no role field accepted on POST /team)', async () => {
    const res = await owner.post('/api/team', { data: { name: 'Second Owner', email: uniqueEmail('owner2'), role: 'owner' } });
    expect([400, 422]).toContain(res.status()); // additionalProperties: false
  });

  test('SECURITY invariant 3 strict bodies: unknown fields are rejected, never silently applied (org_id, created_by)', async () => {
    const ids = (await import('../support/api')).loadIds();
    const res = await owner.post('/api/jobs', { data: { ...jobBody({ assigned_member_id: ids.techA.id, job_date: ids.today }), org_id: foreign.orgId } });
    expect([400, 422]).toContain(res.status());
    const patch = await owner.patch(`/api/jobs/${jobA.id}`, { data: { version: jobA.version, created_by: ids.techB.id } });
    expect([400, 422]).toContain(patch.status());
    await unchanged(jobA);
  });
});

test.describe('cross-organisation (boundary: another org behaves as if it does not exist)', () => {
  test('SECURITY invariant 8 owner: GET/PATCH/PUT/cancel on a foreign job -> 404, DB row unchanged', async () => {
    const before = await jobRow(foreign.jobId);
    expect(before).not.toBeNull();
    await expectProblem(await owner.get(`/api/jobs/${foreign.jobId}`), 404, 'not_found');
    await expectProblem(await owner.patch(`/api/jobs/${foreign.jobId}`, { data: { version: 1, title: 'Hijacked' } }), 404, 'not_found');
    await expectProblem(await owner.put(`/api/jobs/${foreign.jobId}/status`, { data: { version: 1, status: 'done' } }), 404, 'not_found');
    await expectProblem(await owner.post(`/api/jobs/${foreign.jobId}/cancel`, { data: { version: 1 } }), 404, 'not_found');
    expect(await jobRow(foreign.jobId)).toEqual(before);
  });

  test('SECURITY invariant 8 technician: GET/PATCH/PUT on a foreign job -> 404, DB row unchanged', async () => {
    const before = await jobRow(foreign.jobId);
    await expectProblem(await techA.get(`/api/jobs/${foreign.jobId}`), 404, 'not_found');
    await expectProblem(await techA.patch(`/api/jobs/${foreign.jobId}`, { data: { version: 1, notes: 'x' } }), 404, 'not_found');
    await expectProblem(await techA.put(`/api/jobs/${foreign.jobId}/status`, { data: { version: 1, status: 'done' } }), 404, 'not_found');
    expect(await jobRow(foreign.jobId)).toEqual(before);
  });

  test('SECURITY invariant 8 owner: remove a foreign member -> 404; assign a job to a foreign technician -> 422', async () => {
    const ids = (await import('../support/api')).loadIds();
    await expectProblem(await owner.post(`/api/team/${foreign.techMemberId}/remove`), 404, 'not_found');
    const res = await owner.post('/api/jobs', { data: jobBody({ assigned_member_id: foreign.techMemberId, job_date: ids.today }) });
    await expectProblem(res, 422, 'validation_failed');
  });

  test('SECURITY invariant 8 the foreign job and members never appear on our board, team or technician lists', async () => {
    const ids = (await import('../support/api')).loadIds();
    const board = await (await owner.get(`/api/board?date=2026-11-12`)).json();
    expect(JSON.stringify(board)).not.toContain(foreign.jobId);
    const team = await (await owner.get('/api/team?limit=100')).json();
    expect(JSON.stringify(team)).not.toContain(foreign.techMemberId);
    const techs = await (await owner.get('/api/technicians?limit=100')).json();
    expect(JSON.stringify(techs)).not.toContain(foreign.techMemberId);
    void ids;
  });

  test('AC-002.3 an email that belongs to another org gets the same 409 duplicate_email (no cross-org enumeration)', async () => {
    const res = await owner.post('/api/team', { data: { name: 'Clash', email: foreign.techEmail.toUpperCase() } });
    const p = await expectProblem(res, 409, 'duplicate_email');
    expect(p.title).toBe('That email is already on the team'); // same message as an in-org duplicate
    expect(JSON.stringify(p)).not.toMatch(/other org|another org|organi[sz]ation/i);
  });
});

test.describe('Supabase Data API called directly by a signed-in technician (SECURITY invariant 6, 7)', () => {
  let rest: APIRequestContext;
  test.beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) throw new Error('e2e: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for the Data API probes');
    rest = await pwRequest.newContext({
      baseURL: `${url}/rest/v1/`,
      extraHTTPHeaders: { apikey: anonKey, authorization: `Bearer ${accessTokenFor('techA')}`, 'content-type': 'application/json', prefer: 'return=representation' },
    });
  });
  test.afterAll(async () => rest?.dispose());

  const changedNothing = async (job: Job) => {
    const row = await jobRow(job.id);
    expect(row?.title).toBe(job.title);
    expect(row?.status).toBe(job.status);
    expect(row?.assigned_member_id).toBe(job.assigned_technician.id);
    expect(row?.address).toBe(job.address);
  };

  for (const patch of [{ title: 'Direct' }, { address: 'Direct' }, { assigned_member_id: '__B__' }, { start_time: '23:00' }, { status: 'cancelled' }, { version: 99 }, { org_id: NIL_UUID }]) {
    test(`direct PATCH of own job ${Object.keys(patch)[0]} is refused or changes nothing [CRITICAL if applied]`, async () => {
      const ids = (await import('../support/api')).loadIds();
      const body = JSON.parse(JSON.stringify(patch).replace('__B__', ids.techB.id));
      await rest.patch(`jobs?id=eq.${jobA.id}`, { data: body });
      await changedNothing(jobA);
    });
  }

  test('direct PATCH of another technician\'s job (notes, status) changes nothing [CRITICAL if applied]', async () => {
    await rest.patch(`jobs?id=eq.${jobB.id}`, { data: { notes: 'direct' } });
    await rest.patch(`jobs?id=eq.${jobB.id}`, { data: { status: 'done' } });
    const row = await jobRow(jobB.id);
    expect(row?.notes ?? null).toBe(jobB.notes);
    expect(row?.status).toBe(jobB.status);
  });

  test('direct PATCH of a cancelled own job changes nothing', async () => {
    await rest.patch(`jobs?id=eq.${jobCancelled.id}`, { data: { status: 'in_progress', notes: 'direct' } });
    const row = await jobRow(jobCancelled.id);
    expect(row?.status).toBe('cancelled');
  });

  test('direct INSERT of a job is refused', async () => {
    const ids = (await import('../support/api')).loadIds();
    const title = uniq('direct insert');
    const res = await rest.post('jobs', { data: { title, address: 'x', job_date: ids.today, start_time: '10:00', assigned_member_id: ids.techA.id, client_request_id: uuid() } });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    const b = await (await owner.get(`/api/board?date=${ids.today}`)).json();
    expect(b.jobs.map((j: Job) => j.title)).not.toContain(title);
  });

  test('direct DELETE of a job and of a team member is refused, rows remain [CRITICAL if deleted]', async () => {
    const ids = (await import('../support/api')).loadIds();
    await rest.delete(`jobs?id=eq.${jobA.id}`);
    await rest.delete(`team_members?id=eq.${ids.techB.id}`);
    expect((await jobRow(jobA.id))?.id).toBe(jobA.id);
    const team = await (await owner.get('/api/team?limit=100')).json();
    expect(team.data.some((m: { id: string }) => m.id === ids.techB.id)).toBe(true);
  });

  test('direct write to team_members (role, is_active) is refused', async () => {
    const ids = (await import('../support/api')).loadIds();
    await rest.patch(`team_members?id=eq.${ids.techA.id}`, { data: { role: 'owner' } });
    await rest.patch(`team_members?id=eq.${ids.techB.id}`, { data: { is_active: false } });
    const team = await (await owner.get('/api/team?limit=100')).json();
    const a = team.data.find((m: { id: string }) => m.id === ids.techA.id), b = team.data.find((m: { id: string }) => m.id === ids.techB.id);
    expect(a.role).toBe('technician');
    expect(b.is_active).toBe(true);
  });

  for (const table of ['audit_log', 'events', 'rate_limits']) {
    test(`direct read of ${table} returns no rows (SECURITY matrix: nobody via the API)`, async () => {
      const res = await rest.get(`${table}?select=*&limit=1`);
      if (res.ok()) expect(await res.json()).toEqual([]);
      else expect([401, 403, 404]).toContain(res.status());
    });
  }

  test('direct read of another org\'s jobs returns nothing', async () => {
    const res = await rest.get(`jobs?id=eq.${foreign.jobId}&select=id`);
    if (res.ok()) expect(await res.json()).toEqual([]);
  });
});
