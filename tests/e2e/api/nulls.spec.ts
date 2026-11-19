// QA5 · class "an explicit null (or an empty / wrongly typed body) causes a 500".
// For every built endpoint, every body field and every query parameter is sent as null, the body is sent empty and with
// wrong types, and ANY 5xx fails the test. Expected answers come from the contract:
//   optional + nullable field (customer_name, customer_phone, notes) -> accepted, stored as null
//   required field null / wrong type / missing                        -> 422 validation_failed naming the field
//   malformed JSON                                                    -> 400 bad_request
//   a role that may not call the endpoint                             -> 403 / 401, never a 500
// Titles start with NULLS so `npx playwright test -g NULLS` runs the class.
import { type APIRequestContext, type APIResponse } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { NIL_UUID, jobBody, uniq, uuid } from '../support/data';
import { apiAnon, apiAs, board, createJob, loadIds, type Job } from '../support/api';
import { expectProblemShape } from '../support/shapes';

let owner: APIRequestContext, techA: APIRequestContext, techB: APIRequestContext, anon: APIRequestContext;
test.beforeAll(async () => { [owner, techA, techB, anon] = await Promise.all([apiAs('owner'), apiAs('techA'), apiAs('techB'), apiAnon()]); });
test.afterAll(async () => { await Promise.all([owner, techA, techB, anon].map((c) => c?.dispose())); });

const OPTIONAL = ['customer_name', 'customer_phone', 'notes'] as const;
const REQUIRED = ['client_request_id', 'title', 'assigned_member_id', 'job_date', 'start_time', 'address'] as const;

const base = () => { const ids = loadIds(); return jobBody({ assigned_member_id: ids.techA.id, job_date: ids.today }); };
const raw = (ctx: APIRequestContext, method: 'post' | 'put', url: string, body: string | undefined, contentType = 'application/json') =>
  ctx[method](url, { headers: { 'content-type': contentType }, data: body });

/** The one assertion of this class: the server never answers 5xx. The message carries the request and the answer. */
async function never5xx(res: APIResponse, what: string) {
  const text = await res.text();
  expect(res.status(), `5xx: ${what} -> ${res.status()} ${text.slice(0, 200)} (a client mistake must be a 4xx problem, never a server error)`).toBeLessThan(500);
  return text;
}

/** A 4xx must be application/problem+json with the contract's shape and the expected code. */
async function expectClientProblem(res: APIResponse, what: string, statuses: number[], code?: string, field?: string) {
  const text = await never5xx(res, what);
  expect(statuses, `${what} -> ${res.status()} ${text.slice(0, 200)}`).toContain(res.status());
  expect(res.headers()['content-type'] ?? '', `${what}: content-type`).toContain('application/problem+json');
  const body = JSON.parse(text);
  expectProblemShape(what, body);
  if (code) expect(body.code, `${what}: code`).toBe(code);
  if (field) expect((body.errors ?? []).map((e: { field: string }) => e.field), `${what}: the error must name the field "${field}"`).toContain(field);
  return body;
}

test.describe('NULLS POST /api/jobs', () => {
  for (const field of OPTIONAL) {
    test(`NULLS ${field}: null is accepted and stored as null (not a 500, not the string "null")`, async () => {
      const body = { ...base(), title: uniq(`null ${field}`), [field]: null };
      const res = await owner.post('/api/jobs', { data: body });
      await never5xx(res, `POST /api/jobs with ${field}: null`);
      expect(res.status(), `POST /api/jobs ${field}: null -> ${await res.text()}`).toBe(201);
      const job: Job = await res.json();
      expect(job[field], `create response ${field}`).toBeNull();
      const read = (await board(owner, body.job_date)).jobs.find((j) => j.id === job.id);
      expect(read?.[field], `fresh read ${field}`).toBeNull();
    });
  }

  test('NULLS all three optional fields null at once: 201 and all three null', async () => {
    const body = { ...base(), title: uniq('null all'), customer_name: null, customer_phone: null, notes: null };
    const res = await owner.post('/api/jobs', { data: body });
    await never5xx(res, 'POST /api/jobs with every optional field null');
    expect(res.status(), await res.text()).toBe(201);
    const job: Job = await res.json();
    expect([job.customer_name, job.customer_phone, job.notes]).toEqual([null, null, null]);
  });

  for (const field of REQUIRED) {
    test(`NULLS required ${field}: null -> 422 naming ${field}`, async () => {
      const res = await owner.post('/api/jobs', { data: { ...base(), [field]: null } });
      await expectClientProblem(res, `POST /api/jobs with ${field}: null`, [422], 'validation_failed', field);
    });
  }

  const wrongTypes: [string, unknown][] = [['number', 12345], ['boolean', true], ['array', ['x']], ['object', { a: 1 }], ['empty array', []]];
  for (const field of [...REQUIRED, ...OPTIONAL]) {
    test(`NULLS ${field}: wrong types (number, boolean, array, object) -> 422 naming ${field}, never a 5xx`, async () => {
      for (const [label, value] of wrongTypes) {
        const res = await owner.post('/api/jobs', { data: { ...base(), [field]: value } });
        await expectClientProblem(res, `POST /api/jobs with ${field}: ${label}`, [422], 'validation_failed', field);
      }
    });
  }

  test('NULLS an empty object names every required field', async () => {
    const body = await expectClientProblem(await owner.post('/api/jobs', { data: {} }), 'POST /api/jobs with {}', [422], 'validation_failed');
    const named = (body.errors ?? []).map((e: { field: string }) => e.field);
    for (const f of REQUIRED) expect(named, `{} must report ${f}`).toContain(f);
  });

  test('NULLS a body that is not an object (null, array, string, number, empty, no body) is a 4xx problem, never a 5xx', async () => {
    for (const [label, text] of [['JSON null', 'null'], ['array', '[]'], ['string', '"x"'], ['number', '7'], ['empty string', ''], ['whitespace', '  ']] as const) {
      const res = await raw(owner, 'post', '/api/jobs', text);
      await expectClientProblem(res, `POST /api/jobs with body ${label}`, [400, 422]);
    }
    await expectClientProblem(await owner.post('/api/jobs'), 'POST /api/jobs with no body at all', [400, 422]);
  });

  test('NULLS malformed JSON, wrong content types: 400 bad_request (or 4xx), never a 5xx', async () => {
    await expectClientProblem(await raw(owner, 'post', '/api/jobs', '{"title":'), 'POST /api/jobs truncated JSON', [400], 'bad_request');
    await expectClientProblem(await raw(owner, 'post', '/api/jobs', '{title: 1}'), 'POST /api/jobs unquoted keys', [400], 'bad_request');
    for (const ct of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) {
      const res = await raw(owner, 'post', '/api/jobs', JSON.stringify(base()), ct);
      await never5xx(res, `POST /api/jobs with content-type ${ct}`);
    }
  });

  test('NULLS an unknown property is refused with a 4xx (additionalProperties: false) and nothing is saved', async () => {
    const title = uniq('null unknown prop');
    const b = { ...base(), title, unexpected: null };
    const res = await owner.post('/api/jobs', { data: b });
    await expectClientProblem(res, 'POST /api/jobs with an unknown property', [400, 422]);
    expect((await board(owner, b.job_date)).jobs.some((j) => j.title === title), 'a refused create must not save the job').toBe(false);
  });

  test('NULLS prototype-pollution style keys do not cause a 5xx', async () => {
    for (const text of ['{"__proto__":null}', '{"constructor":null,"prototype":null}', JSON.stringify({ ...base(), __proto__: null })]) {
      await never5xx(await raw(owner, 'post', '/api/jobs', text), `POST /api/jobs with ${text.slice(0, 40)}`);
    }
  });

  test('NULLS a technician and a signed-out caller sending null-laden bodies get 403 / 401, never a 5xx', async () => {
    const bodies = [{}, { ...base(), notes: null, customer_name: null, customer_phone: null }, { title: null }];
    for (const [who, ctx, status, code] of [['Tech A', techA, 403, 'not_allowed'], ['Tech B', techB, 403, 'not_allowed'], ['signed out', anon, 401, 'unauthenticated']] as const) {
      for (const b of bodies) {
        await expectClientProblem(await ctx.post('/api/jobs', { data: b }), `${who}: POST /api/jobs ${JSON.stringify(b).slice(0, 50)}`, [status], code);
      }
      await expectClientProblem(await raw(ctx, 'post', '/api/jobs', ''), `${who}: POST /api/jobs empty body`, [status, 400], undefined);
    }
  });

  test('NULLS assigned_member_id that is a valid but unknown uuid -> 422 technician_not_assignable on the field', async () => {
    const res = await owner.post('/api/jobs', { data: { ...base(), assigned_member_id: NIL_UUID } });
    await expectClientProblem(res, 'POST /api/jobs unknown technician', [422], undefined, 'assigned_member_id');
  });
});

test.describe('NULLS PUT /api/jobs/{id}/status', () => {
  let job: Job;
  test.beforeAll(async () => { const ids = loadIds(); job = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('null status') }); });

  const bodies: [string, unknown, string][] = [
    ['version null', { version: null, status: 'done' }, 'version'],
    ['status null', { version: 1, status: null }, 'status'],
    ['both null', { version: null, status: null }, 'status'],
    ['version string', { version: '1', status: 'done' }, 'version'],
    ['version float', { version: 1.5, status: 'done' }, 'version'],
    ['version zero', { version: 0, status: 'done' }, 'version'],
    ['version negative', { version: -3, status: 'done' }, 'version'],
    ['version boolean', { version: true, status: 'done' }, 'version'],
    ['version array', { version: [1], status: 'done' }, 'version'],
    ['version object', { version: {}, status: 'done' }, 'version'],
    ['status number', { version: 1, status: 7 }, 'status'],
    ['status empty', { version: 1, status: '' }, 'status'],
    ['status unknown word', { version: 1, status: 'finished' }, 'status'],
    ['status wrong case', { version: 1, status: 'DONE' }, 'status'],
    ['status object', { version: 1, status: { a: 1 } }, 'status'],
    ['status missing', { version: 1 }, 'status'],
    ['version missing', { status: 'done' }, 'version'],
    ['empty object', {}, 'status'],
  ];
  for (const [label, body, field] of bodies) {
    test(`NULLS status body ${label} -> 422 naming ${field}, and the job is unchanged`, async () => {
      const res = await owner.put(`/api/jobs/${job.id}/status`, { data: body });
      await expectClientProblem(res, `PUT status with ${label}`, [422], 'validation_failed', field);
      const read = (await board(owner, job.job_date)).jobs.find((j) => j.id === job.id)!;
      expect([read.status, read.version], 'a refused status change must save nothing').toEqual([job.status, job.version]);
    });
  }

  test('NULLS status body that is not an object, malformed, or empty -> 4xx problem, never a 5xx', async () => {
    for (const [label, text] of [['JSON null', 'null'], ['array', '[]'], ['string', '"done"'], ['empty', ''], ['truncated', '{"version":1,']] as const) {
      await expectClientProblem(await raw(owner, 'put', `/api/jobs/${job.id}/status`, text), `PUT status with body ${label}`, [400, 422]);
    }
    await expectClientProblem(await owner.put(`/api/jobs/${job.id}/status`), 'PUT status with no body', [400, 422]);
  });

  test('NULLS an unknown property on the status body is refused with a 4xx', async () => {
    const res = await owner.put(`/api/jobs/${job.id}/status`, { data: { version: job.version, status: 'done', note: null } });
    await expectClientProblem(res, 'PUT status with an unknown property', [400, 422]);
  });

  test('NULLS odd job ids in the path (null, undefined, not a uuid, nil uuid, huge) never cause a 5xx', async () => {
    for (const id of ['null', 'undefined', 'abc', '%00', NIL_UUID, uuid(), 'x'.repeat(300), '0'.repeat(36)]) {
      const res = await owner.put(`/api/jobs/${id}/status`, { data: { version: 1, status: 'done' } });
      await expectClientProblem(res, `PUT /api/jobs/${id.slice(0, 20)}/status`, [400, 404, 422]);
    }
  });

  test('NULLS a technician and a signed-out caller with null-laden bodies get 403/404 and 401, never a 5xx', async () => {
    const ids = loadIds();
    const others = await createJob(owner, { assigned_member_id: ids.techB.id, job_date: ids.today, title: uniq('null status other') });
    for (const b of [{}, { version: null, status: null }, { version: 1, status: null }]) {
      const res = await anon.put(`/api/jobs/${others.id}/status`, { data: b });
      await expectClientProblem(res, 'signed out: PUT status', [401], 'unauthenticated');
      const t = await techA.put(`/api/jobs/${others.id}/status`, { data: b });
      await never5xx(t, `Tech A: PUT status ${JSON.stringify(b)}`);
    }
  });
});

test.describe('NULLS query strings and the other built endpoints', () => {
  test('NULLS GET /api/board with date empty, null, malformed, out of range or repeated: 200 or a 4xx problem, never a 5xx', async () => {
    for (const q of ['date=', 'date=null', 'date=undefined', 'date=abc', 'date=2026-13-45', 'date=2026-02-30', 'date=1999-12-31', 'date=2101-01-01', 'date=%00', 'date=2026-11-18&date=2026-11-19', 'date[]=2026-11-18', 'date=' + 'x'.repeat(500), 'unknown=1']) {
      const res = await owner.get(`/api/board?${q}`);
      const text = await never5xx(res, `GET /api/board?${q.slice(0, 40)}`);
      if (res.status() >= 400) await expectClientProblem(res, `GET /api/board?${q.slice(0, 40)}`, [400, 422]);
      else expect(() => JSON.parse(text)).not.toThrow();
    }
  });

  test('NULLS GET /api/health with check empty, null or repeated: never a 5xx (unknown value is a 400 problem)', async () => {
    for (const q of ['check=', 'check=null', 'check=DB', 'check=db&check=x', 'check[]=db', 'check=' + 'x'.repeat(500)]) {
      const res = await anon.get(`/api/health?${q}`);
      await never5xx(res, `GET /api/health?${q.slice(0, 40)}`);
      if (res.status() >= 400) await expectClientProblem(res, `GET /api/health?${q.slice(0, 40)}`, [400, 422]);
    }
  });

  test('NULLS GET /api/me and /api/board with odd headers (null authorization, empty bearer) answer 401, never a 5xx', async () => {
    for (const auth of ['', 'Bearer', 'Bearer null', 'Bearer undefined', 'Bearer ' + 'x'.repeat(2000), 'Basic null']) {
      for (const path of ['/api/me', '/api/board']) {
        const res = await anon.get(path, { headers: { authorization: auth } });
        await expectClientProblem(res, `GET ${path} with authorization "${auth.slice(0, 20)}"`, [401], 'unauthenticated');
      }
    }
  });
});
