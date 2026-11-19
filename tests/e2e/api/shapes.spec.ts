// QA5 · class "a response carries a field the contract does not define".
// Every response body of every built endpoint is validated against the generated contract schema
// (src/lib/api/generated/*.zod.ts, generated from docs/openapi.yaml) with NO extra properties allowed at any depth (support/shapes.ts).
// A failure names the field: `extra (not in the contract): $.jobs[0].org_id` or `missing/invalid: $.version (...)`.
// Error bodies (problem+json) are checked the same way. Titles start with SHAPE so `-g SHAPE` runs the class.
import { type APIRequestContext } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { addDays, jobBody, uniq } from '../support/data';
import { apiAnon, apiAs, createJob, loadIds, type Job } from '../support/api';
import { expectProblemShape, expectShape, unknownKeys } from '../support/shapes';
import { CreateJobResponse, SetJobStatusResponse } from '../../../src/lib/api/generated/jobs/jobs.zod';
import { GetBoardResponse } from '../../../src/lib/api/generated/board/board.zod';
import { GetMeResponse } from '../../../src/lib/api/generated/session/session.zod';
import { GetHealthResponse } from '../../../src/lib/api/generated/system/system.zod';

let owner: APIRequestContext, techA: APIRequestContext, techB: APIRequestContext, anon: APIRequestContext;
test.beforeAll(async () => { [owner, techA, techB, anon] = await Promise.all([apiAs('owner'), apiAs('techA'), apiAs('techB'), apiAnon()]); });
test.afterAll(async () => { await Promise.all([owner, techA, techB, anon].map((c) => c?.dispose())); });

const json = async (res: import('@playwright/test').APIResponse, status: number, what: string) => {
  expect(res.status(), `${what} -> ${res.status()} ${(await res.text()).slice(0, 200)}`).toBe(status);
  return res.json();
};

test.describe('SHAPE the checker itself (a planted extra or missing field must be caught and named)', () => {
  const job = (): Job => ({
    id: '0b6e3a51-4a1f-4d7a-9a55-3c2a1f0e9b01', job_date: '2026-11-12', start_time: '15:30', title: 't', address: 'a', customer_name: null, customer_phone: null, notes: null,
    status: 'scheduled', version: 1, assigned_technician: { id: '0b6e3a51-4a1f-4d7a-9a55-3c2a1f0e9b02', name: 'n', is_active: true }, is_mine: false,
    permissions: { change_status: true, edit_notes: true, edit_all: true, cancel: true }, created_at: '2026-11-12T19:00:00Z', updated_at: '2026-11-12T19:00:00Z',
  });
  test('SHAPE checker: accepts the contract example, names an extra top-level, nested and array-item field, and a missing one', () => {
    expect(unknownKeys(CreateJobResponse, job())).toEqual([]);
    expect(unknownKeys(CreateJobResponse, { ...job(), org_id: 'x' })).toEqual(['$.org_id']);
    expect(unknownKeys(CreateJobResponse, { ...job(), assigned_technician: { ...job().assigned_technician, email: 'x' } })).toEqual(['$.assigned_technician.email']);
    expect(unknownKeys(CreateJobResponse, { ...job(), permissions: { ...job().permissions, delete: true } })).toEqual(['$.permissions.delete']);
    const day = { date: '2026-11-12', today: '2026-11-12', is_today: true, viewer: { member_id: job().id, role: 'owner' }, job_count: 1, truncated: false, jobs: [job()] };
    expect(unknownKeys(GetBoardResponse, day)).toEqual([]);
    expect(unknownKeys(GetBoardResponse, { ...day, jobs: [job(), { ...job(), secret: 1 }] })).toEqual(['$.jobs[1].secret']);
    expect(() => expectShape('planted extra', CreateJobResponse, { ...job(), org_id: 'x' })).toThrow();
    const { version: _v, ...noVersion } = job();
    expect(() => expectShape('planted missing', CreateJobResponse, noVersion)).toThrow();
    expect(() => expectProblemShape('planted extra problem field', { type: 'about:blank', title: 't', status: 400, code: 'bad_request', trace: 'x' })).toThrow();
  });
});

test.describe('SHAPE GET /api/health, GET /api/me', () => {
  test('SHAPE health: plain and ?check=db match the contract exactly', async () => {
    expectShape('GET /api/health', GetHealthResponse, await json(await anon.get('/api/health'), 200, 'GET /api/health'));
    expectShape('GET /api/health?check=db', GetHealthResponse, await json(await anon.get('/api/health?check=db'), 200, 'GET /api/health?check=db'));
  });
  test('SHAPE me: owner, Tech A and Tech B match the contract exactly', async () => {
    for (const [who, ctx] of [['owner', owner], ['Tech A', techA], ['Tech B', techB]] as const) {
      expectShape(`GET /api/me as ${who}`, GetMeResponse, await json(await ctx.get('/api/me'), 200, `GET /api/me as ${who}`));
    }
  });
});

test.describe('SHAPE GET /api/board', () => {
  test('SHAPE board: a day with jobs (every role) and an empty day match the contract exactly, job by job', async () => {
    const ids = loadIds();
    const date = addDays(ids.today, 81);
    await createJob(owner, { assigned_member_id: ids.techA.id, job_date: date, title: uniq('shape full'), customer_name: 'Shay Pe', customer_phone: '(905) 555-0100', notes: 'n' });
    await createJob(owner, { assigned_member_id: ids.techB.id, job_date: date, title: uniq('shape bare'), start_time: '06:00' });
    for (const [who, ctx] of [['owner', owner], ['Tech A', techA], ['Tech B', techB]] as const) {
      const body = await json(await ctx.get(`/api/board?date=${date}`), 200, `GET /api/board as ${who}`);
      expect(body.jobs.length, `${who}: jobs on the day`).toBe(2);
      expectShape(`GET /api/board?date=${date} as ${who}`, GetBoardResponse, body);
      expectShape(`GET /api/board (today) as ${who}`, GetBoardResponse, await json(await ctx.get('/api/board'), 200, `GET /api/board as ${who}`));
      expectShape(`GET /api/board (empty day) as ${who}`, GetBoardResponse, await json(await ctx.get(`/api/board?date=${addDays(ids.today, 82)}`), 200, 'empty day'));
    }
  });
});

test.describe('SHAPE POST /api/jobs and PUT /api/jobs/{id}/status', () => {
  test('SHAPE create: the 201 and the 200 replay match the contract exactly (optional fields set and omitted)', async () => {
    const ids = loadIds();
    for (const over of [{}, { customer_name: 'A B', customer_phone: '(905) 555-0100', notes: 'n' }, { customer_name: null, customer_phone: null, notes: null }]) {
      const body = jobBody({ assigned_member_id: ids.techA.id, job_date: addDays(ids.today, 83), title: uniq('shape create'), ...over });
      expectShape('POST /api/jobs 201', CreateJobResponse, await json(await owner.post('/api/jobs', { data: body }), 201, 'POST /api/jobs'));
      expectShape('POST /api/jobs 200 replay', CreateJobResponse, await json(await owner.post('/api/jobs', { data: body }), 200, 'POST /api/jobs replay'));
    }
  });

  test('SHAPE status: every 200 (owner, technician, same-status no-op, cancelled) matches the contract exactly', async () => {
    const ids = loadIds();
    let job = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: addDays(ids.today, 84), title: uniq('shape status') });
    const steps: [string, APIRequestContext, 'in_progress' | 'done' | 'scheduled' | 'cancelled'][] = [
      ['Tech A in_progress', techA, 'in_progress'], ['Tech A in_progress again (no-op)', techA, 'in_progress'], ['owner done', owner, 'done'], ['owner cancelled', owner, 'cancelled'], ['owner scheduled', owner, 'scheduled'],
    ];
    for (const [label, ctx, status] of steps) {
      const body = await json(await ctx.put(`/api/jobs/${job.id}/status`, { data: { version: job.version, status } }), 200, `PUT status ${label}`);
      expectShape(`PUT status ${label}`, SetJobStatusResponse, body);
      job = body;
    }
  });
});

test.describe('SHAPE error bodies (application/problem+json)', () => {
  test('SHAPE problems: 400, 401, 403, 404, 409 (with `current`) and 422 match the contract exactly', async () => {
    const ids = loadIds();
    const job = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('shape problem') });
    const check = async (what: string, res: import('@playwright/test').APIResponse, status: number, withJob = false) => {
      expect(res.status(), `${what} -> ${res.status()} ${(await res.text()).slice(0, 200)}`).toBe(status);
      expect(res.headers()['content-type'] ?? '', `${what}: content-type`).toContain('application/problem+json');
      expectProblemShape(what, await res.json(), withJob ? CreateJobResponse : undefined);
    };
    await check('GET /api/health?check=nonsense (400)', await anon.get('/api/health?check=nonsense'), 400);
    await check('POST /api/jobs malformed JSON (400)', await owner.post('/api/jobs', { headers: { 'content-type': 'application/json' }, data: Buffer.from('{"a":', 'utf8') }), 400);
    await check('GET /api/me signed out (401)', await anon.get('/api/me'), 401);
    await check('GET /api/board signed out (401)', await anon.get('/api/board'), 401);
    await check('PUT status signed out (401)', await anon.put(`/api/jobs/${job.id}/status`, { data: { version: 1, status: 'done' } }), 401);
    await check('POST /api/jobs as a technician (403)', await techA.post('/api/jobs', { data: jobBody({ assigned_member_id: ids.techA.id, job_date: ids.today }) }), 403);
    await check('PUT status cancelled by a technician (403)', await techA.put(`/api/jobs/${job.id}/status`, { data: { version: job.version, status: 'cancelled' } }), 403);
    await check('PUT status on an unknown job (404)', await owner.put('/api/jobs/00000000-0000-4000-8000-000000000000/status', { data: { version: 1, status: 'done' } }), 404);
    await check('POST /api/jobs with {} (422)', await owner.post('/api/jobs', { data: {} }), 422);
    await check('PUT status with a bad status (422)', await owner.put(`/api/jobs/${job.id}/status`, { data: { version: 1, status: 'nope' } }), 422);
    await json(await owner.put(`/api/jobs/${job.id}/status`, { data: { version: job.version, status: 'in_progress' } }), 200, 'owner moves the job on');
    await check('PUT status with an old version (409 stale_version)', await techA.put(`/api/jobs/${job.id}/status`, { data: { version: job.version, status: 'done' } }), 409, true);
  });
});
