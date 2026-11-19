// US-003 (create), US-008 (edit), US-009 (cancel), US-007 (technician status and notes) on screen.
// Every job has a unique title; jobs stay in the is_test org (NG-6) and never reach Northside's board.
// QA3: fixme. SCR-04 and SCR-05 are placeholders, there are no browser sessions yet, and PATCH, cancel and GET /jobs/{id} are
// not built. The API rules behind these screens run in api/contract.spec.ts and api/permissions.spec.ts.
import { test, expect } from './support/fixtures';
import { apiAs, createJob, getJob } from './support/api';
import { card, dropWrites, fillJobForm, openNewJob, restoreWrites, saveJob, statusButton } from './support/ui';
import { addDays, chars, uniq } from './support/data';
import { UNBUILT } from './support/unbuilt';

test.fixme(true, `${UNBUILT.screen}; ${UNBUILT.signin}; ${UNBUILT.patchJob}; ${UNBUILT.cancel}; ${UNBUILT.getJob}`);

test.describe('owner creates and edits (SCR-05)', () => {
  test.use({ storageState: 'tests/e2e/.auth/owner.json' });

  test('AC-003.1 owner creates "Leaking kitchen faucet" at 15:30 for Tech A: it shows on today\'s board, Scheduled, with Tech A', async ({ page, ids }) => {
    const title = uniq('Leaking kitchen faucet');
    await openNewJob(page);
    await fillJobForm(page, { title, technician: ids.techA.name, startTime: '15:30', address: '45 Main St W, Hamilton' });
    await saveJob(page);
    await expect(page).toHaveURL(/\/board/);
    const c = card(page, title);
    await expect(c).toContainText('15:30');
    await expect(c).toContainText(ids.techA.name);
    await expect(c).toContainText(/scheduled/i);
  });

  test('AC-003.2 customer name, phone and notes are all shown on the saved card', async ({ page, ids }) => {
    const title = uniq('with customer');
    await openNewJob(page);
    await fillJobForm(page, { title, technician: ids.techA.name, startTime: '10:00', address: '1 Test St', customerName: 'Pat Example', customerPhone: '(905) 555-0123', notes: 'Key under mat' });
    await saveJob(page);
    const c = card(page, title);
    await expect(c).toContainText('Pat Example');
    await expect(c).toContainText('(905) 555-0123');
    await expect(c).toContainText('Key under mat');
  });

  test('AC-003.3 saving an empty form shows an error beside each missing field and creates nothing', async ({ page }) => {
    await openNewJob(page);
    await saveJob(page);
    for (const msg of [/enter a job title/i, /choose a technician/i, /enter a start time/i, /enter an address/i]) await expect(page.getByText(msg)).toBeVisible();
    await expect(page).toHaveURL(/\/jobs\/new/);
  });

  test('AC-003.4 over-long title, address and notes show length errors; values at the limit save', async ({ page, ids }) => {
    await openNewJob(page);
    await fillJobForm(page, { title: chars(101), technician: ids.techA.name, startTime: '10:00', address: chars(201), notes: chars(2001) });
    await saveJob(page);
    await expect(page.getByText('Up to 100 characters')).toBeVisible();
    await expect(page.getByText('Up to 200 characters')).toBeVisible();
    await expect(page.getByText('Up to 2000 characters')).toBeVisible();
    const title = uniq('at limit').padEnd(100, 'x');
    await fillJobForm(page, { title, address: chars(200), notes: chars(2000) });
    await saveJob(page);
    await expect(page).toHaveURL(/\/board/);
  });

  test('AC-003.5 phone "call me" shows "Enter a valid phone number"; a blank phone is accepted', async ({ page, ids }) => {
    await openNewJob(page);
    await fillJobForm(page, { title: uniq('bad phone'), technician: ids.techA.name, startTime: '10:00', address: '1 St', customerPhone: 'call me' });
    await saveJob(page);
    await expect(page.getByText('Enter a valid phone number')).toBeVisible();
    await fillJobForm(page, { customerPhone: '' });
    await saveJob(page);
    await expect(page).toHaveURL(/\/board/);
  });

  test('AC-003.6 tapping Save twice within a second creates exactly one job', async ({ page, ids }) => {
    const title = uniq('double tap');
    await openNewJob(page);
    await fillJobForm(page, { title, technician: ids.techA.name, startTime: '10:00', address: '1 St' });
    await page.getByRole('button', { name: /^save job$/i }).dblclick({ delay: 0 });
    await expect(page).toHaveURL(/\/board/);
    await expect(card(page, title)).toHaveCount(1);
    const board = await (await (await apiAs('owner')).get('/api/board')).json();
    expect(board.jobs.filter((j: { title: string }) => j.title === title)).toHaveLength(1);
  });

  test('AC-003.7 a job at 09:00 saved in the afternoon is accepted and shown in time order', async ({ page, ids }) => {
    const title = uniq('early');
    await openNewJob(page);
    await fillJobForm(page, { title, technician: ids.techA.name, startTime: '00:05', address: '1 St' });
    await saveJob(page);
    await expect(page).toHaveURL(/\/board/);
    await expect(card(page, title)).toBeVisible();
    const day = await (await (await apiAs('owner')).get('/api/board')).json();
    const times = day.jobs.map((j: { start_time: string }) => j.start_time);
    expect([...times].sort()).toEqual(times);
    expect(day.jobs.map((j: { title: string }) => j.title)).toContain(title);
  });

  test('AC-003.8 notes with <script>, &, an emoji and line breaks show exactly as typed and nothing runs', async ({ page, ids }) => {
    const title = uniq('markup');
    const notes = '<script>window.__xss=1</script> & 😀\nsecond line\n\nfourth';
    let dialog = false;
    page.on('dialog', (d) => { dialog = true; void d.dismiss(); });
    await openNewJob(page);
    await fillJobForm(page, { title, technician: ids.techA.name, startTime: '10:00', address: '1 St', notes });
    await saveJob(page);
    const c = card(page, title);
    await expect(c).toContainText('<script>window.__xss=1</script> & 😀');
    expect(await c.getByText(/second line/).evaluate((el) => getComputedStyle(el).whiteSpace)).toMatch(/pre/);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(dialog).toBe(false);
  });

  test('AC-003.10 the technician is removed after the form opened: save is refused with "That technician is no longer on the team", form kept', async ({ page, ids }) => {
    const owner = await apiAs('owner');
    const { addTechnician, removeMember } = await import('./support/api');
    const { uniqueEmail } = await import('./support/data');
    const c = await addTechnician(owner, 'Tech Vanish', uniqueEmail('vanish'));
    const title = uniq('vanish');
    await openNewJob(page);
    await fillJobForm(page, { title, technician: 'Tech Vanish', startTime: '10:00', address: '1 St' });
    await removeMember(owner, c.id);
    await saveJob(page);
    await expect(page.getByText('That technician is no longer on the team')).toBeVisible();
    await expect(page.getByLabel(/job title/i)).toHaveValue(title);
    const board = await (await owner.get('/api/board')).json();
    expect(board.jobs.map((j: { title: string }) => j.title)).not.toContain(title);
    void ids;
  });

  test('AC-003.11 a dropped connection shows "Not saved. Try again", keeps every value, and saving again creates exactly one job', async ({ page, ids }) => {
    const title = uniq('drop');
    await openNewJob(page);
    await fillJobForm(page, { title, technician: ids.techA.name, startTime: '11:15', address: '12 King St', customerName: 'Pat', notes: 'keep me' });
    await dropWrites(page);
    await saveJob(page);
    await expect(page.getByText(/not saved\. try again/i)).toBeVisible();
    await expect(page.getByLabel(/job title/i)).toHaveValue(title);
    await expect(page.getByLabel(/^notes/i)).toHaveValue('keep me');
    await restoreWrites(page);
    await saveJob(page);
    await expect(page).toHaveURL(/\/board/);
    const board = await (await (await apiAs('owner')).get('/api/board')).json();
    expect(board.jobs.filter((j: { title: string }) => j.title === title)).toHaveLength(1);
  });

  test('AC-010.2 owner picks 2026-11-17 on the form: the job is on that day\'s board, not today\'s', async ({ page, ids }) => {
    const title = uniq('future ui');
    const date = addDays(ids.today, 5);
    await openNewJob(page);
    await fillJobForm(page, { title, technician: ids.techA.name, startTime: '10:00', address: '1 St', date });
    await saveJob(page);
    await expect(card(page, title)).toHaveCount(0); // back on the day being viewed (today)
    const day = await (await (await apiAs('owner')).get(`/api/board?date=${date}`)).json();
    expect(day.jobs.map((j: { title: string }) => j.title)).toContain(title);
  });

  test('AC-010.6 a year outside 2020 to 2100, or a day that does not exist, shows "Enter a valid date"', async ({ page, ids }) => {
    await openNewJob(page);
    await fillJobForm(page, { title: uniq('bad date'), technician: ids.techA.name, startTime: '10:00', address: '1 St' });
    for (const d of ['2019-12-31', '2101-01-01', '2026-02-30']) {
      await fillJobForm(page, { date: d });
      await saveJob(page);
      await expect(page.getByText('Enter a valid date')).toBeVisible();
    }
  });

  test('AC-008.1 owner edits the start time to 16:00; the board shows 16:00', async ({ page, ids }) => {
    const owner = await apiAs('owner');
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, start_time: '15:30', title: uniq('edit time') });
    await page.goto(`/jobs/${j.id}/edit`);
    await fillJobForm(page, { startTime: '16:00' });
    await page.getByRole('button', { name: /^save changes$/i }).click();
    await page.goto('/board');
    await expect(card(page, j.title)).toContainText('16:00');
  });

  test('AC-008.2 owner reassigns to Tech B; the card shows Tech B', async ({ page, ids }) => {
    const owner = await apiAs('owner');
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('edit reassign') });
    await page.goto(`/jobs/${j.id}/edit`);
    await fillJobForm(page, { technician: ids.techB.name });
    await page.getByRole('button', { name: /^save changes$/i }).click();
    await page.goto('/board');
    await expect(card(page, j.title)).toContainText(ids.techB.name);
  });

  test('AC-008.4 emptying a required field on edit shows the create-form errors and leaves the job unchanged', async ({ page, ids }) => {
    const owner = await apiAs('owner');
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('edit invalid') });
    await page.goto(`/jobs/${j.id}/edit`);
    await fillJobForm(page, { title: '', address: '', customerPhone: 'call me' });
    await page.getByRole('button', { name: /^save changes$/i }).click();
    await expect(page.getByText(/enter a job title/i)).toBeVisible();
    await expect(page.getByText(/enter an address/i)).toBeVisible();
    await expect(page.getByText('Enter a valid phone number')).toBeVisible();
    expect(await getJob(owner, j.id)).toEqual(j);
  });

  test('AC-008.5 the reassign choices do not offer a removed technician', async ({ page, ids }) => {
    const owner = await apiAs('owner');
    const { addTechnician, removeMember } = await import('./support/api');
    const { uniqueEmail } = await import('./support/data');
    const m = await addTechnician(owner, 'Tech Offboarded', uniqueEmail('off'));
    await removeMember(owner, m.id);
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('edit choices') });
    await page.goto(`/jobs/${j.id}/edit`);
    await expect(page.getByLabel(/technician/i).locator('option', { hasText: 'Tech Offboarded' })).toHaveCount(0);
    await expect(page.getByLabel(/technician/i).locator('option', { hasText: ids.techB.name })).toHaveCount(1);
  });

  test('AC-008.6 saving an edit from an old view shows "This job was updated by someone else. Review the latest version" and keeps the other change', async ({ page, browser, ids }) => {
    const owner = await apiAs('owner');
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('edit stale') });
    await page.goto(`/jobs/${j.id}/edit`);
    const techCtx = await apiAs('techA');
    expect((await techCtx.put(`/api/jobs/${j.id}/status`, { data: { version: j.version, status: 'in_progress' } })).status()).toBe(200);
    await fillJobForm(page, { startTime: '18:00' });
    await page.getByRole('button', { name: /^save changes$/i }).click();
    await expect(page.getByText('This job was updated by someone else. Review the latest version')).toBeVisible();
    expect((await getJob(owner, j.id)).status).toBe('in_progress');
    void browser;
  });

  test('AC-008.7 a dropped connection on edit shows "Not saved. Try again", keeps the edited values, job unchanged', async ({ page, ids }) => {
    const owner = await apiAs('owner');
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('edit drop') });
    await page.goto(`/jobs/${j.id}/edit`);
    await fillJobForm(page, { startTime: '19:45' });
    await dropWrites(page);
    await page.getByRole('button', { name: /^save changes$/i }).click();
    await expect(page.getByText(/not saved\. try again/i)).toBeVisible();
    await expect(page.getByLabel(/start time/i)).toHaveValue('19:45');
    await restoreWrites(page);
    expect((await getJob(owner, j.id)).start_time).toBe(j.start_time);
  });

  test('AC-009.1 / AC-009.3 Cancel asks "Cancel this job?"; No leaves the job, Yes marks it Cancelled in place', async ({ page, ids }) => {
    const owner = await apiAs('owner');
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('cancel ui') });
    await page.goto(`/jobs/${j.id}`);
    await page.getByRole('button', { name: /cancel job/i }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Cancel this job?');
    await page.getByRole('button', { name: /no, keep the job/i }).click();
    expect((await getJob(owner, j.id)).status).toBe('scheduled');
    await page.getByRole('button', { name: /cancel job/i }).click();
    await page.getByRole('button', { name: /yes, cancel job/i }).click();
    await page.goto('/board');
    await expect(card(page, j.title)).toContainText(/cancelled/i);
  });

  test('AC-009.2 no delete control on the board, the job detail or the edit form for the owner', async ({ page, ids }) => {
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('nodelete') });
    for (const path of ['/board', `/jobs/${j.id}`, `/jobs/${j.id}/edit`, '/team']) {
      await page.goto(path);
      await expect(page.getByRole('button', { name: /delet/i }), path).toHaveCount(0);
      await expect(page.getByRole('link', { name: /delet/i }), path).toHaveCount(0);
    }
  });

  test('AC-009.4 the owner restores a cancelled job with a status; Tech A can change it again', async ({ page, ids }) => {
    const owner = await apiAs('owner');
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('restore') });
    await owner.post(`/api/jobs/${j.id}/cancel`, { data: { version: j.version } });
    await page.goto(`/jobs/${j.id}`);
    await statusButton(page.locator('main'), 'Scheduled').click();
    await expect.poll(async () => (await getJob(owner, j.id)).status).toBe('scheduled');
  });

  test('AC-009.6 a dropped connection after confirming Cancel shows "Not saved. Try again" and the job stays active', async ({ page, ids }) => {
    const owner = await apiAs('owner');
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('cancel drop') });
    await page.goto(`/jobs/${j.id}`);
    await page.getByRole('button', { name: /cancel job/i }).click();
    await dropWrites(page);
    await page.getByRole('button', { name: /yes, cancel job/i }).click();
    await expect(page.getByText(/not saved\. try again/i)).toBeVisible();
    await restoreWrites(page);
    expect((await getJob(owner, j.id)).status).toBe('scheduled');
  });
});

test.describe('technician (SCR-03, SCR-04)', () => {
  test.use({ storageState: 'tests/e2e/.auth/techA.json' });

  test('AC-003.9 Tech A sees no New job control and the create address says "Not allowed"', async ({ page }) => {
    await page.goto('/board');
    await expect(page.getByRole('link', { name: /new job/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /new job/i })).toHaveCount(0);
    await page.goto('/jobs/new');
    await expect(page.getByRole('heading', { name: /not allowed/i })).toBeVisible();
  });

  test('AC-007.1 Tech A taps In progress on own job: the badge changes and the owner sees it after a reload', async ({ page, ids }) => {
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('tech status') });
    await page.goto('/board');
    const c = card(page, j.title);
    await statusButton(c, 'In progress').click();
    await expect(statusButton(c, 'In progress')).toHaveAttribute('aria-pressed', 'true');
    expect((await getJob(await apiAs('owner'), j.id)).status).toBe('in_progress');
  });

  test('AC-007.2 Tech A saves a note on the job detail; "Notes saved" shows and the note persists for others', async ({ page, ids }) => {
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('tech note') });
    await page.goto(`/jobs/${j.id}`);
    await page.getByLabel(/notes/i).fill('Replaced washer, customer wants a quote for the tap');
    await page.getByRole('button', { name: /save notes/i }).click();
    await expect(page.getByText(/notes saved/i)).toBeVisible();
    expect((await getJob(await apiAs('techB'), j.id)).notes).toBe('Replaced washer, customer wants a quote for the tap');
  });

  test('AC-007.3 on Tech B\'s job Tech A has no status or notes controls and sees who can change it', async ({ page, ids }) => {
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techB.id, job_date: ids.today, title: uniq('not mine') });
    await page.goto('/board');
    await expect(statusButton(card(page, j.title), 'Done')).toHaveCount(0);
    await page.goto(`/jobs/${j.id}`);
    await expect(page.getByText(new RegExp(`only ${ids.techB.name} and the owner can change it`, 'i'))).toBeVisible();
    await expect(page.getByRole('button', { name: /save notes/i })).toHaveCount(0);
    await expect(page.getByLabel(/notes/i)).toHaveCount(0);
  });

  test('AC-007.4 the job detail shows title, address, start time, customer and technician as plain text, nothing editable', async ({ page, ids }) => {
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('locked'), customer_name: 'Pat Example' });
    await page.goto(`/jobs/${j.id}`);
    await expect(page.getByRole('textbox')).toHaveCount(1); // the notes box only
    await expect(page.getByRole('link', { name: /edit job/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /cancel job/i })).toHaveCount(0);
  });

  test('AC-007.5 a cancelled job shows "This job was cancelled" and no controls to Tech A', async ({ page, ids }) => {
    const owner = await apiAs('owner');
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('cancelled view') });
    await owner.post(`/api/jobs/${j.id}/cancel`, { data: { version: j.version } });
    await page.goto(`/jobs/${j.id}`);
    await expect(page.getByText(/this job was cancelled/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^(in progress|done|scheduled)$/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /save notes/i })).toHaveCount(0);
  });

  test('AC-007.6 Done then In progress: the job shows In progress', async ({ page, ids }) => {
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('undo') });
    await page.goto('/board');
    const c = card(page, j.title);
    await statusButton(c, 'Done').click();
    await expect(statusButton(c, 'Done')).toHaveAttribute('aria-pressed', 'true');
    await statusButton(c, 'In progress').click();
    await expect(statusButton(c, 'In progress')).toHaveAttribute('aria-pressed', 'true');
  });

  test('AC-007.7 2001 characters of notes show "2001 / 2000" and an error and save nothing; 2000 saves', async ({ page, ids }) => {
    const owner = await apiAs('owner');
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('notes len') });
    await page.goto(`/jobs/${j.id}`);
    await page.getByLabel(/notes/i).fill(chars(2001));
    await expect(page.getByText('2001 / 2000')).toBeVisible();
    await page.getByRole('button', { name: /save notes/i }).click();
    await expect(page.getByText(/notes can be up to 2000 characters/i)).toBeVisible();
    expect((await getJob(owner, j.id)).notes).toBeNull();
    await page.getByLabel(/notes/i).fill(chars(2000));
    await page.getByRole('button', { name: /save notes/i }).click();
    await expect(page.getByText(/notes saved/i)).toBeVisible();
  });

  test('AC-007.8 a status tap from an old view shows "This job was updated by someone else. Review the latest version"; Show latest loads the new values', async ({ page, ids }) => {
    const owner = await apiAs('owner');
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, start_time: '14:00', title: uniq('stale ui') });
    await page.goto('/board');
    expect((await owner.patch(`/api/jobs/${j.id}`, { data: { version: j.version, start_time: '16:00' } })).status()).toBe(200);
    await statusButton(card(page, j.title), 'In progress').click();
    await expect(page.getByText('This job was updated by someone else. Review the latest version')).toBeVisible();
    await page.getByRole('button', { name: /show latest/i }).click();
    await expect(card(page, j.title)).toContainText('16:00');
    expect((await getJob(owner, j.id)).start_time).toBe('16:00');
  });

  test('AC-007.9 a double tap on Done records one status change', async ({ page, ids }) => {
    const owner = await apiAs('owner');
    const j = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('double done') });
    await page.goto('/board');
    await statusButton(card(page, j.title), 'Done').dblclick({ delay: 0 });
    await expect.poll(async () => (await getJob(owner, j.id)).status).toBe('done');
    expect((await getJob(owner, j.id)).version).toBe(j.version + 1);
  });

  test('AC-007.10 a dropped connection on a note save shows "Not saved. Try again" and keeps the typed note', async ({ page, ids }) => {
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('note drop') });
    await page.goto(`/jobs/${j.id}`);
    await page.getByLabel(/notes/i).fill('typed while offline');
    await dropWrites(page);
    await page.getByRole('button', { name: /save notes/i }).click();
    await expect(page.getByText(/not saved\. try again/i)).toBeVisible();
    await expect(page.getByLabel(/notes/i)).toHaveValue('typed while offline');
  });

  test('AC-007.10 a dropped connection on a status tap shows "Not saved. Try again" and the control returns to the saved status', async ({ page, ids }) => {
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('status drop') });
    await page.goto('/board');
    const c = card(page, j.title);
    await dropWrites(page);
    await statusButton(c, 'Done').click();
    await expect(c.getByText(/not saved\. try again/i)).toBeVisible();
    await expect(statusButton(c, 'Scheduled')).toHaveAttribute('aria-pressed', 'true');
  });
});
