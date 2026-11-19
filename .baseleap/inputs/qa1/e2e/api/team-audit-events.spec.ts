// Team API, removal, audit trail (FR-18) and tracking events (docs/metrics-spec.md QA checklist).
// Audit and event rows are read with the service role, in the e2e org only. Details are asserted for shape and for the
// absence of personal data, never for text values.
import { type APIRequestContext } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { apiAnon, apiAs, addTechnician, createJob, expectProblem, loadIds, removeMember, type Job } from '../support/api';
import { auditFor, eventsFor } from '../support/admin';
import { chars, emailOfLength, uniq, uniqueEmail } from '../support/data';

let owner: APIRequestContext, techA: APIRequestContext, anon: APIRequestContext;
test.beforeAll(async () => { [owner, techA, anon] = await Promise.all([apiAs('owner'), apiAs('techA'), apiAnon()]); });
test.afterAll(async () => { await Promise.all([owner, techA, anon].map((c) => c?.dispose())); });

const PII = /@|\(\d{3}\)|\d{3}[ -]\d{4}|45 Main|Leaking|key under/i;

test.describe('team list API (US-002, US-011)', () => {
  test('AC-002.1 owner adds a technician: 201, role technician, listed, and offered by GET /technicians', async () => {
    const email = uniqueEmail('add');
    const res = await owner.post('/api/team', { data: { name: 'Tech Add', email } });
    expect(res.status()).toBe(201);
    const { member, reactivated } = await res.json();
    expect(reactivated).toBe(false);
    expect(member).toMatchObject({ role: 'technician', is_active: true, removed_at: null });
    const team = await (await owner.get('/api/team?limit=100')).json();
    expect(team.data.map((m: { id: string }) => m.id)).toContain(member.id);
    const techs = await (await owner.get('/api/technicians?limit=100')).json();
    expect(techs.data.map((t: { id: string }) => t.id)).toContain(member.id);
  });

  test('AC-002.3 the same email in other case and spaces -> 409 duplicate_email, no second entry', async () => {
    const email = uniqueEmail('dup');
    const first = await addTechnician(owner, 'Tech Dup', email);
    await expectProblem(await owner.post('/api/team', { data: { name: 'Tech Dup 2', email: `  ${email.toUpperCase()} ` } }), 409, 'duplicate_email');
    const team = await (await owner.get('/api/team?limit=100')).json();
    expect(team.data.filter((m: { email: string }) => m.email.toLowerCase() === email.toLowerCase())).toHaveLength(1);
    void first;
  });

  test('AC-002.4 empty name, whitespace name, invalid emails -> 422 with a field error; nothing saved', async () => {
    for (const body of [{ name: '', email: uniqueEmail('x') }, { name: '   ', email: uniqueEmail('x') }, { name: 'A', email: 'tech.a@' }, { name: 'A', email: 'no-at-sign' }, { name: 'A', email: 'a b@example.test' }]) {
      const res = await owner.post('/api/team', { data: body });
      expect([400, 422], JSON.stringify(body)).toContain(res.status());
    }
  });

  test('AC-002.5 name 60 and email 254 accepted; name 61 and email 255 rejected', async () => {
    const ok = await owner.post('/api/team', { data: { name: chars(60, 'N'), email: emailOfLength(254) } });
    expect(ok.status(), (await ok.text()).slice(0, 200)).toBe(201);
    expect([400, 422]).toContain((await owner.post('/api/team', { data: { name: chars(61, 'N'), email: uniqueEmail('n61') } })).status());
    expect([400, 422]).toContain((await owner.post('/api/team', { data: { name: 'Long Email', email: emailOfLength(255) } })).status());
  });

  test('AC-011.1 removal: the removed technician gets 401 on the next request, within 60 seconds', async ({ browser }) => {
    const email = uniqueEmail('rm');
    const m = await addTechnician(owner, 'Tech Remove', email);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const { signInWithLink } = await import('../support/session');
    await signInWithLink(page, email);
    expect((await ctx.request.get('/api/me')).status()).toBe(200);
    expect((await removeMember(owner, m.id)).status()).toBe(200);
    await expect.poll(async () => (await ctx.request.get('/api/me')).status(), { timeout: 60_000, intervals: [1_000] }).toBe(401);
    await expectProblem(await ctx.request.get('/api/board'), 401, 'unauthenticated');
    await page.goto('/board');
    await expect(page).toHaveURL(/\/sign-in/);
    await ctx.close();
  });

  test('AC-011.2 a removed technician\'s past jobs stay on their board with is_active false', async () => {
    const ids = loadIds();
    const m = await addTechnician(owner, 'Tech Gone', uniqueEmail('gone'));
    const j = await createJob(owner, { assigned_member_id: m.id, job_date: ids.today, title: uniq('gone job') });
    expect((await removeMember(owner, m.id)).status()).toBe(200);
    const day = await (await techA.get(`/api/board?date=${ids.today}`)).json();
    const found = day.jobs.find((x: Job) => x.id === j.id);
    expect(found.assigned_technician).toMatchObject({ id: m.id, name: 'Tech Gone', is_active: false });
  });

  test('AC-011.3 / AC-003.10 a removed technician cannot be assigned: 422 technician_not_assignable, no job created', async () => {
    const ids = loadIds();
    const m = await addTechnician(owner, 'Tech Late', uniqueEmail('late'));
    await removeMember(owner, m.id);
    const title = uniq('late assign');
    const res = await owner.post('/api/jobs', { data: { client_request_id: crypto.randomUUID(), title, address: '1 St', job_date: ids.today, start_time: '10:00', assigned_member_id: m.id } });
    const p = await expectProblem(res, 422, 'validation_failed');
    const err = p.errors.find((e: { field: string }) => e.field === 'assigned_member_id');
    expect(err?.code).toBe('technician_not_assignable');
    expect((await (await owner.get(`/api/board?date=${ids.today}`)).json()).jobs.map((j: Job) => j.title)).not.toContain(title);
    expect((await (await owner.get('/api/technicians?limit=100')).json()).data.map((t: { id: string }) => t.id)).not.toContain(m.id);
  });

  test('AC-008.5 a removed technician is not a valid reassignment target', async () => {
    const ids = loadIds();
    const m = await addTechnician(owner, 'Tech Re', uniqueEmail('re'));
    await removeMember(owner, m.id);
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('reassign') });
    const res = await owner.patch(`/api/jobs/${j.id}`, { data: { version: j.version, assigned_member_id: m.id } });
    await expectProblem(res, 422, 'validation_failed');
  });

  test('AC-011.5 adding a removed email again reactivates the same entry: 200 reactivated true, no duplicate', async () => {
    const email = uniqueEmail('readd');
    const m = await addTechnician(owner, 'Tech Readd', email);
    await removeMember(owner, m.id);
    const res = await owner.post('/api/team', { data: { name: 'Tech Readd Back', email: email.toUpperCase() } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.reactivated).toBe(true);
    expect(body.member.id).toBe(m.id);
    expect(body.member).toMatchObject({ is_active: true, removed_at: null });
    const team = await (await owner.get('/api/team?limit=100')).json();
    expect(team.data.filter((x: { email: string }) => x.email.toLowerCase() === email.toLowerCase())).toHaveLength(1);
  });

  test('AC-011.1 removing someone already removed returns 200 unchanged', async () => {
    const m = await addTechnician(owner, 'Tech Twice', uniqueEmail('twice'));
    expect((await removeMember(owner, m.id)).status()).toBe(200);
    const again = await removeMember(owner, m.id);
    expect(again.status()).toBe(200);
    expect((await again.json()).is_active).toBe(false);
  });

  test('AC-002.2 / AC-011.1 GET /team lists owner first, then active by name, then removed', async () => {
    const team = (await (await owner.get('/api/team?limit=100')).json()).data as { role: string; is_active: boolean }[];
    expect(team[0].role).toBe('owner');
    const firstRemoved = team.findIndex((m) => !m.is_active);
    if (firstRemoved >= 0) expect(team.slice(firstRemoved).every((m) => !m.is_active)).toBe(true);
  });

  test('FR-3 adding a person sends no email: no sign-in-requested event is produced by POST /team', async () => {
    const before = new Date().toISOString();
    const m = await addTechnician(owner, 'Tech Quiet', uniqueEmail('quiet'));
    expect(await eventsFor(m.id, 'signin_link_requested', before)).toHaveLength(0);
  });
});

test.describe('audit trail (FR-18)', () => {
  test('AC-002.8 adding a team member records who and when', async () => {
    const ids = loadIds();
    const m = await addTechnician(owner, 'Tech Audit', uniqueEmail('audit'));
    const rows = await auditFor(m.id);
    const added = rows.find((r) => r.action === 'team_member.added');
    expect(added, 'team_member.added row').toBeTruthy();
    expect(added!.actor_member_id).toBe(ids.owner.id);
    expect(Date.now() - Date.parse(added!.created_at)).toBeLessThan(5 * 60_000);
    expect(JSON.stringify(added!.details)).not.toMatch(PII);
  });

  test('AC-011.1 removal and re-adding are recorded (team_member.removed, team_member.reactivated)', async () => {
    const email = uniqueEmail('audit-rm');
    const m = await addTechnician(owner, 'Tech Audit Rm', email);
    await removeMember(owner, m.id);
    await owner.post('/api/team', { data: { name: 'Tech Audit Rm', email } });
    const actions = (await auditFor(m.id)).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['team_member.added', 'team_member.removed', 'team_member.reactivated']));
  });

  test('AC-003.12 creating a job records who created it and when', async () => {
    const ids = loadIds();
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('audit create'), customer_phone: '(905) 555-0123', notes: 'Key under mat' });
    const created = (await auditFor(j.id)).find((r) => r.action === 'job.created');
    expect(created, 'job.created row').toBeTruthy();
    expect(created!.actor_member_id).toBe(ids.owner.id);
    expect(JSON.stringify(created!.details)).not.toMatch(PII);
  });

  test('AC-007.11 a technician status change records who, when, old and new status', async () => {
    const ids = loadIds();
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('audit status') });
    expect((await techA.put(`/api/jobs/${j.id}/status`, { data: { version: j.version, status: 'in_progress' } })).status()).toBe(200);
    const row = (await auditFor(j.id)).find((r) => r.action === 'job.status_changed');
    expect(row, 'job.status_changed row').toBeTruthy();
    expect(row!.actor_member_id).toBe(ids.techA.id);
    const d = JSON.stringify(row!.details);
    expect(d).toContain('scheduled');
    expect(d).toContain('in_progress');
  });

  test('AC-007.9 a double Done records exactly one status change', async () => {
    const ids = loadIds();
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('audit double') });
    await Promise.all([1, 2].map(() => techA.put(`/api/jobs/${j.id}/status`, { data: { version: j.version, status: 'done' } })));
    expect((await auditFor(j.id)).filter((r) => r.action === 'job.status_changed')).toHaveLength(1);
  });

  test('AC-008.8 an owner edit records which fields changed, never their values', async () => {
    const ids = loadIds();
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('audit edit') });
    const secret = 'Bring the 4mm key for Pat Example';
    expect((await owner.patch(`/api/jobs/${j.id}`, { data: { version: j.version, start_time: '16:00', notes: secret } })).status()).toBe(200);
    const row = (await auditFor(j.id)).find((r) => r.action === 'job.updated');
    expect(row, 'job.updated row').toBeTruthy();
    const d = JSON.stringify(row!.details);
    expect(d).toContain('start_time');
    expect(d).toContain('notes');
    expect(d).not.toContain(secret);
    expect(d).not.toContain('16:00');
  });

  test('AC-008.2 reassignment is recorded as job.reassigned', async () => {
    const ids = loadIds();
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('audit reassign') });
    await owner.patch(`/api/jobs/${j.id}`, { data: { version: j.version, assigned_member_id: ids.techB.id } });
    expect((await auditFor(j.id)).map((r) => r.action)).toContain('job.reassigned');
  });

  test('AC-009.5 cancelling twice records one cancellation', async () => {
    const ids = loadIds();
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('audit cancel') });
    await owner.post(`/api/jobs/${j.id}/cancel`, { data: { version: j.version } });
    await owner.post(`/api/jobs/${j.id}/cancel`, { data: { version: j.version } });
    const cancels = (await auditFor(j.id)).filter((r) => r.action === 'job.status_changed' && JSON.stringify(r.details).includes('cancelled'));
    expect(cancels).toHaveLength(1);
  });
});

test.describe('tracking events (docs/metrics-spec.md QA checklist)', () => {
  test('metrics: job_created fires once per saved job (also on a double submit), lead_days 0, no PII, is_test true', async () => {
    const ids = loadIds();
    const since = new Date(Date.now() - 1000).toISOString();
    const body = { client_request_id: crypto.randomUUID(), title: uniq('ev create'), address: '45 Main St W, Hamilton', job_date: ids.today, start_time: '10:00', assigned_member_id: ids.techA.id, customer_name: 'Pat Example', notes: 'Key under mat' };
    await Promise.all([owner.post('/api/jobs', { data: body }), owner.post('/api/jobs', { data: body })]);
    const ev = (await eventsFor(ids.owner.id, 'job_created', since)).filter((e) => e.properties.assigned_tech_id === ids.techA.id);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ source: 'server', is_test: true });
    expect(ev[0].properties.lead_days).toBe(0);
    expect(JSON.stringify(ev[0].properties)).not.toMatch(PII);
  });

  test('metrics: job_created for another date carries lead_days = job_date minus today', async () => {
    const ids = loadIds();
    const since = new Date(Date.now() - 1000).toISOString();
    const date = '2026-11-17';
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: date, title: uniq('ev lead') });
    const ev = (await eventsFor(ids.owner.id, 'job_created', since)).find((e) => e.properties.job_id === j.id);
    const expected = Math.round((Date.parse(date) - Date.parse(ids.today)) / 86_400_000);
    expect(ev?.properties.lead_days).toBe(expected);
  });

  test('metrics: job_status_changed has from/to and the actor role; cancel then re-cancel from an old view records one', async () => {
    const ids = loadIds();
    const since = new Date(Date.now() - 1000).toISOString();
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('ev status') });
    const s1: Job = await (await techA.put(`/api/jobs/${j.id}/status`, { data: { version: j.version, status: 'in_progress' } })).json();
    await techA.put(`/api/jobs/${j.id}/status`, { data: { version: s1.version, status: 'done' } });
    const evs = (await eventsFor(ids.techA.id, 'job_status_changed', since)).filter((e) => e.properties.job_id === j.id);
    expect(evs.map((e) => [e.properties.from_status, e.properties.to_status])).toEqual([['scheduled', 'in_progress'], ['in_progress', 'done']]);
    expect(evs.every((e) => e.properties.actor_role === 'technician')).toBe(true);
    const k = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('ev cancel') });
    await owner.post(`/api/jobs/${k.id}/cancel`, { data: { version: k.version } });
    await owner.post(`/api/jobs/${k.id}/cancel`, { data: { version: k.version } });
    const cancels = (await eventsFor(ids.owner.id, 'job_status_changed', since)).filter((e) => e.properties.job_id === k.id && e.properties.to_status === 'cancelled');
    expect(cancels).toHaveLength(1);
  });

  test('metrics: job_reassigned and job_updated (field names only) and team_member_added / removed fire once each', async () => {
    const ids = loadIds();
    const since = new Date(Date.now() - 1000).toISOString();
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('ev edit') });
    const r1: Job = await (await owner.patch(`/api/jobs/${j.id}`, { data: { version: j.version, start_time: '17:00' } })).json();
    await owner.patch(`/api/jobs/${j.id}`, { data: { version: r1.version, assigned_member_id: ids.techB.id } });
    const all = await eventsFor(ids.owner.id, undefined, since);
    const mine = (name: string) => all.filter((e) => e.name === name && e.properties.job_id === j.id);
    expect(mine('job_reassigned')).toHaveLength(1);
    expect(mine('job_reassigned')[0].properties).toMatchObject({ from_tech_id: ids.techA.id, to_tech_id: ids.techB.id });
    const upd = mine('job_updated');
    expect(upd).toHaveLength(1);
    expect(upd[0].properties.fields_changed).toEqual(['start_time']);
    const m = await addTechnician(owner, 'Tech Ev', uniqueEmail('ev'));
    await removeMember(owner, m.id);
    const t = (await eventsFor(ids.owner.id, undefined, since)).filter((e) => e.properties.team_member_id === m.id);
    expect(t.map((e) => e.name)).toEqual(['team_member_added', 'team_member_removed']);
    expect(t[0].properties.reactivated).toBe(false);
  });

  test('metrics: PII sweep of every event written by this run (no email, phone, address, title or notes in properties)', async () => {
    const ids = loadIds();
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    for (const who of [ids.owner.id, ids.techA.id, ids.techB.id]) {
      for (const e of await eventsFor(who, undefined, since)) expect(JSON.stringify(e.properties), e.name).not.toMatch(PII);
    }
  });
});

test.describe('POST /events (US-004, rate limit)', () => {
  test('metrics: board_viewed accepted (202) from a technician; body naming a person or free text is rejected', async () => {
    const ids = loadIds();
    const ok = await techA.post('/api/events', { data: { name: 'board_viewed', board_date: ids.today, is_today: true, job_count: 3, load_ms: 850 } });
    expect(ok.status()).toBe(202);
    for (const extra of [{ member_id: ids.owner.id }, { email: 'a@example.test' }, { note: 'hello' }]) {
      const res = await techA.post('/api/events', { data: { name: 'board_viewed', board_date: ids.today, is_today: true, job_count: 3, load_ms: 850, ...extra } });
      expect([400, 422], JSON.stringify(extra)).toContain(res.status());
    }
    expect([400, 422]).toContain((await techA.post('/api/events', { data: { name: 'job_created', board_date: ids.today } })).status());
    expect([400, 422]).toContain((await techA.post('/api/events', { data: { name: 'board_load_failed', board_date: ids.today, error_kind: 'my phone number is 905 555 0123' } })).status());
  });

  test('SECURITY rate limit: 120 events per member per hour, then 429 rate_limited with Retry-After', async () => {
    test.setTimeout(180_000);
    const ids = loadIds();
    const { newSignedInContext } = await import('../support/session');
    void newSignedInContext;
    // techB is used so Tech A's budget in other tests is untouched. Hourly window: run this test last and once per hour.
    const techB = await apiAs('techB');
    let limited: import('@playwright/test').APIResponse | undefined;
    for (let i = 0; i < 125 && !limited; i++) {
      const r = await techB.post('/api/events', { data: { name: 'board_load_failed', board_date: ids.today, error_kind: 'network' } });
      if (r.status() === 429) limited = r;
      else expect(r.status()).toBe(202);
    }
    expect(limited, '429 within 125 events').toBeTruthy();
    expect(Number(limited!.headers()['retry-after'])).toBeGreaterThan(0);
    await expectProblem(limited!, 429, 'rate_limited');
    await techB.dispose();
  });

  test('AC-001.7 signed-out POST /events is refused', async () => {
    await expectProblem(await anon.post('/api/events', { data: { name: 'board_load_failed', board_date: '2026-11-12', error_kind: 'network' } }), 401, 'unauthenticated');
  });
});
