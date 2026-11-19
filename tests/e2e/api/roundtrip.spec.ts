// QA5 · class "the API accepts a field and silently does not save it".
// For every built write endpoint (POST /api/jobs, PUT /api/jobs/{id}/status) every writable field is sent with a distinct
// value, and BOTH the response and a fresh read (GET /api/board, the only job read that is built) must return each one as
// sent. A fresh read is taken as the owner, as the assigned technician and as the other technician: a field saved for one
// view and dropped for another is the same defect.
//
// Titles start with ROUNDTRIP so `npx playwright test -g ROUNDTRIP` runs the class.
import { type APIRequestContext } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { addDays, jobBody, uniq } from '../support/data';
import { CreateJobBody } from '../../../src/lib/api/generated/jobs/jobs.zod';
import { apiAs, board, loadIds, type Job } from '../support/api';

let owner: APIRequestContext, techA: APIRequestContext, techB: APIRequestContext;
test.beforeAll(async () => { [owner, techA, techB] = await Promise.all([apiAs('owner'), apiAs('techA'), apiAs('techB')]); });
test.afterAll(async () => { await Promise.all([owner, techA, techB].map((c) => c?.dispose())); });

const WRITABLE = ['title', 'assigned_member_id', 'job_date', 'start_time', 'address', 'customer_name', 'customer_phone', 'notes'] as const;
type Sent = ReturnType<typeof jobBody>;

/** Each writable field, compared one by one so the failure names the field that was lost or changed. */
function expectSent(where: string, got: Job, sent: Sent, techName: string) {
  const diffs: string[] = [];
  const same = (field: string, actual: unknown, expected: unknown) => {
    if (actual !== expected) diffs.push(`${field}: sent ${JSON.stringify(expected)}, ${where} returned ${JSON.stringify(actual)}`);
  };
  same('title', got.title, sent.title);
  same('assigned_member_id (assigned_technician.id)', got.assigned_technician?.id, sent.assigned_member_id);
  same('assigned_technician.name', got.assigned_technician?.name, techName);
  same('job_date', got.job_date, sent.job_date);
  same('start_time', got.start_time, sent.start_time);
  same('address', got.address, sent.address);
  same('customer_name', got.customer_name, sent.customer_name ?? null);
  same('customer_phone', got.customer_phone, sent.customer_phone ?? null);
  same('notes', got.notes, sent.notes ?? null);
  same('status', got.status, 'scheduled');
  same('version', got.version, 1);
  expect(diffs, `${where}: writable field(s) not returned as sent`).toEqual([]);
}

const variants = (ids: ReturnType<typeof loadIds>) => [
  {
    name: 'every field set, Tech A',
    tech: ids.techA,
    body: jobBody({
      assigned_member_id: ids.techA.id, job_date: addDays(ids.today, 71), start_time: '07:45', title: uniq('rt all A'),
      address: '1 Round St, Trip', customer_name: 'Rhea Roundtrip', customer_phone: '(905) 555-0147', notes: 'Line one\nLine two, café ☕ <b>not html</b>',
    }),
  },
  {
    name: 'every field set, different values, Tech B',
    tech: ids.techB,
    body: jobBody({
      assigned_member_id: ids.techB.id, job_date: addDays(ids.today, 72), start_time: '23:59', title: uniq('rt all B'),
      address: '99 Other Ave Unit 4', customer_name: 'Omar Second', customer_phone: '+1 416-555-0199', notes: 'Different notes',
    }),
  },
  {
    name: 'optional fields omitted',
    tech: ids.techA,
    body: (() => { const b = jobBody({ assigned_member_id: ids.techA.id, job_date: addDays(ids.today, 73), start_time: '00:00', title: uniq('rt min') }); return b; })(),
  },
];

test.describe('ROUNDTRIP POST /api/jobs: every writable field comes back as sent', () => {
  for (const idx of [0, 1, 2]) {
    test(`ROUNDTRIP create (${idx}): response and fresh board reads return each field as sent`, async () => {
      const ids = loadIds();
      const v = variants(ids)[idx]!;
      const res = await owner.post('/api/jobs', { data: v.body });
      expect(res.status(), `create (${v.name}) ${await res.text()}`).toBe(201);
      const created: Job = await res.json();
      expectSent('the create response', created, v.body, v.tech.name);

      for (const [who, ctx] of [['the owner board', owner], ['the assigned technician board', v.tech.id === ids.techA.id ? techA : techB], ['the other technician board', v.tech.id === ids.techA.id ? techB : techA]] as const) {
        const found = (await board(ctx, v.body.job_date)).jobs.find((j) => j.id === created.id);
        expect(found, `the new job is on ${who} for ${v.body.job_date}`).toBeTruthy();
        expectSent(`a fresh read from ${who}`, found!, v.body, v.tech.name);
        // The read is the same job the create returned (nothing else may drift between the two).
        const { permissions: _p, is_mine: _m, ...readRest } = found!;
        const { permissions: _cp, is_mine: _cm, ...createdRest } = created;
        expect(readRest, `${who}: the fresh read differs from the create response`).toEqual(createdRest);
      }
    });
  }

  test('ROUNDTRIP create: the 200 replay of the same client_request_id returns the same saved values, not the replay body', async () => {
    const ids = loadIds();
    const first = jobBody({ assigned_member_id: ids.techA.id, job_date: addDays(ids.today, 74), start_time: '08:15', title: uniq('rt replay'), customer_name: 'Replay Person', customer_phone: '905 555 0100', notes: 'first notes' });
    const a = await owner.post('/api/jobs', { data: first });
    expect(a.status()).toBe(201);
    const created: Job = await a.json();
    const b = await owner.post('/api/jobs', { data: { ...first, title: uniq('rt replay changed'), notes: 'second notes' } });
    expect(b.status(), `replay ${await b.text()}`).toBe(200);
    const replay: Job = await b.json();
    expect(replay.id).toBe(created.id);
    expectSent('the 200 replay response', replay, first, ids.techA.name);
    const day = (await board(owner, first.job_date)).jobs.filter((j) => j.title.startsWith('E2E rt replay'));
    expect(day.map((j) => j.id), 'the replay must not create a second job').toEqual([created.id]);
  });

  test('ROUNDTRIP create: one field at a time, each distinct value survives (a dropped single field is named)', async () => {
    const ids = loadIds();
    // Start from a base with only the required fields, then add each optional field alone: a field that is ignored
    // only when it is the sole optional field (or the first) is still caught.
    const extras: Record<string, string> = { customer_name: 'Solo Name', customer_phone: '(289) 555-0111', notes: 'Solo notes only' };
    for (const [field, value] of Object.entries(extras)) {
      const body = jobBody({ assigned_member_id: ids.techB.id, job_date: addDays(ids.today, 75), start_time: '12:34', title: uniq(`rt solo ${field}`), [field]: value });
      const res = await owner.post('/api/jobs', { data: body });
      expect(res.status(), `create with only ${field} ${await res.text()}`).toBe(201);
      const created: Job = await res.json();
      const read = (await board(owner, body.job_date)).jobs.find((j) => j.id === created.id)!;
      for (const f of ['customer_name', 'customer_phone', 'notes'] as const) {
        const want = f === field ? value : null;
        expect(created[f], `create response ${f} (only ${field} was sent)`).toBe(want);
        expect(read[f], `fresh read ${f} (only ${field} was sent)`).toBe(want);
      }
    }
  });
});

test.describe('ROUNDTRIP PUT /api/jobs/{id}/status: the status (and nothing else) changes, in the response and on later reads', () => {
  test('ROUNDTRIP status: every status the owner sets is returned, versions step by 1, other fields are untouched, fresh reads agree', async () => {
    const ids = loadIds();
    const body = jobBody({
      assigned_member_id: ids.techB.id, job_date: addDays(ids.today, 76), start_time: '14:05', title: uniq('rt status'),
      address: '7 Status Rd', customer_name: 'Stella Status', customer_phone: '(647) 555-0123', notes: 'status notes\nsecond line',
    });
    const c = await owner.post('/api/jobs', { data: body });
    expect(c.status()).toBe(201);
    let job: Job = await c.json();
    for (const status of ['in_progress', 'done', 'scheduled', 'cancelled', 'done'] as const) {
      const before = job;
      const res = await owner.put(`/api/jobs/${before.id}/status`, { data: { version: before.version, status } });
      expect(res.status(), `owner sets ${status}: ${await res.text()}`).toBe(200);
      job = await res.json();
      expect(job.status, `response status after sending ${status}`).toBe(status);
      expect(job.version, `version after ${before.status} -> ${status}`).toBe(before.version + 1);
      const { status: _s, version: _v, updated_at: _u, permissions: _p, ...restBefore } = before;
      const { status: _s2, version: _v2, updated_at: _u2, permissions: _p2, ...restAfter } = job;
      expect(restAfter, `a status change to ${status} altered another field`).toEqual(restBefore);
      // fresh reads, as two different people
      for (const [who, ctx] of [['owner', owner], ['assigned technician', techB], ['other technician', techA]] as const) {
        const read = (await board(ctx, body.job_date)).jobs.find((j) => j.id === job.id);
        expect(read, `job on the ${who} board`).toBeTruthy();
        expect(read!.status, `${who}: fresh read status after ${status}`).toBe(status);
        expect(read!.version, `${who}: fresh read version after ${status}`).toBe(job.version);
        const { permissions: _p3, is_mine: _m3, ...readRest } = read!;
        const { permissions: _p4, is_mine: _m4, ...jobRest } = job;
        expect(readRest, `${who}: fresh read differs from the response to ${status}`).toEqual(jobRest);
      }
    }
  });

  test('ROUNDTRIP status: the assigned technician\'s change is saved and visible to the other technician and the owner', async () => {
    const ids = loadIds();
    const body = jobBody({ assigned_member_id: ids.techA.id, job_date: addDays(ids.today, 77), title: uniq('rt tech status'), notes: 'keep me', customer_name: 'Keep Name' });
    const c = await owner.post('/api/jobs', { data: body });
    let job: Job = await c.json();
    for (const status of ['in_progress', 'done', 'scheduled'] as const) {
      const res = await techA.put(`/api/jobs/${job.id}/status`, { data: { version: job.version, status } });
      expect(res.status(), `Tech A sets ${status}: ${await res.text()}`).toBe(200);
      const next: Job = await res.json();
      expect(next.status).toBe(status);
      expect(next.version).toBe(job.version + 1);
      expect([next.notes, next.customer_name, next.title], 'a technician status change altered other fields').toEqual(['keep me', 'Keep Name', body.title]);
      job = next;
      for (const ctx of [owner, techB]) {
        const read = (await board(ctx, body.job_date)).jobs.find((j) => j.id === job.id)!;
        expect([read.status, read.version, read.notes, read.customer_name]).toEqual([status, job.version, 'keep me', 'Keep Name']);
      }
    }
  });

  test('ROUNDTRIP status: a same-status request is a 200 no-op that returns the saved job and does not bump the version', async () => {
    const ids = loadIds();
    const c = await owner.post('/api/jobs', { data: jobBody({ assigned_member_id: ids.techA.id, job_date: addDays(ids.today, 78), title: uniq('rt noop'), notes: 'noop notes' }) });
    const job: Job = await c.json();
    const res = await owner.put(`/api/jobs/${job.id}/status`, { data: { version: job.version + 5, status: 'scheduled' } });
    expect(res.status(), await res.text()).toBe(200);
    const same: Job = await res.json();
    expect([same.status, same.version, same.notes, same.updated_at]).toEqual(['scheduled', job.version, 'noop notes', job.updated_at]);
  });
});

// The list of fields is asserted against the contract, so a new writable field cannot be added without a round-trip case.
test('ROUNDTRIP guard: the round-trip variants send every writable field of JobCreate', async () => {
  const ids = loadIds();
  const sent = new Set(variants(ids).flatMap((v) => Object.keys(v.body)));
  // From the generated contract schema, not from this file: a field added to the contract with no case here fails.
  for (const f of Object.keys(CreateJobBody.shape)) expect(sent.has(f), `JobCreate.${f} is sent in a round-trip variant`).toBe(true);
  for (const f of WRITABLE) expect(Object.keys(CreateJobBody.shape), `${f} is in the contract`).toContain(f);
});
