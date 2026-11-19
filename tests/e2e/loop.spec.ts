// US-006, the P0 definition of done: owner signs in, creates a job for today and assigns it to Tech A; Tech A signs in
// at 390px and sees it; Tech B signs in and sees the same board. `npm run e2e` must run exactly this on any environment,
// name the failing step, pass again on a repeat run, and leave nothing on a real board.
//
// Each person signs in fresh by one-time link (decision 0004) in their own browser context, as on separate devices.
// QA3: the browser loop needs the sign-in route and the real screens, so it is fixme. AC-006.4 (step names) and AC-006.6
// (isolation) need neither and run.
import { test, expect } from './support/fixtures';
import { emailOf, signInWithLink } from './support/session';
import { apiAs } from './support/api';
import { card, fillJobForm, openNewJob, saveJob } from './support/ui';
import { eventsFor, jobRow, orgIsTest } from './support/admin';
import { uniq } from './support/data';
import { UNBUILT } from './support/unbuilt';
import type { Browser } from '@playwright/test';

async function theLoop(browser: Browser, ids: { techA: { name: string }; owner: { id: string } }, title: string) {
  await test.step('Step 1: the owner signs in, creates a job for today and assigns it to Tech A', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await signInWithLink(page, emailOf('owner'));
    await openNewJob(page);
    await fillJobForm(page, { title, technician: ids.techA.name, startTime: '15:30', address: '45 Main St W, Hamilton' });
    await saveJob(page);
    await expect(card(page, title)).toContainText(ids.techA.name);
    await ctx.close();
  });
  await test.step('Step 2: Tech A signs in at 390px width and sees the job on today\'s board', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await signInWithLink(page, emailOf('techA'));
    await expect(card(page, title)).toBeVisible();
    await expect(card(page, title)).toContainText('15:30');
    await ctx.close();
  });
  await test.step('Step 3: Tech B signs in and sees the same job on the same board', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await signInWithLink(page, emailOf('techB'));
    await expect(card(page, title)).toBeVisible();
    await ctx.close();
  });
}

test.describe('the browser loop (needs sign-in and the real screens)', () => {
  test.fixme(true, `${UNBUILT.signin}; ${UNBUILT.screen}`);

  test('AC-006.1 the three-step loop passes: owner creates and assigns, Tech A sees it at 390px, Tech B sees it', async ({ browser, ids }) => {
    await theLoop(browser, ids, uniq('loop'));
  });

  test('AC-006.5 the loop passes again straight after, the same day, on the same environment', async ({ browser, ids }) => {
    await theLoop(browser, ids, uniq('loop repeat 1'));
    await theLoop(browser, ids, uniq('loop repeat 2'));
  });
});

test('AC-006.4 the loop\'s steps are named "Step 1/2/3" so a failing run names the failing step', async ({}, info) => {
  // The runner's non-zero exit code is Playwright's own contract. What is ours to assert is that each step carries a
  // distinct, human-readable title; this reads the titles from the source of the loop above.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(info.file, 'utf8');
  for (const n of [1, 2, 3]) expect(src).toContain(`test.step('Step ${n}:`);
});

test('AC-006.6 jobs made by the suite live in an is_test organisation and their events are marked is_test (never Northside\'s board)', async ({ ids }) => {
  const owner = await apiAs('owner');
  const res = await owner.post('/api/jobs', {
    data: { client_request_id: crypto.randomUUID(), title: uniq('isolation'), address: '1 Test St', job_date: ids.today, start_time: '10:00', assigned_member_id: ids.techA.id },
  });
  expect(res.status()).toBe(201);
  const j = await res.json();
  const row = await jobRow(j.id);
  expect(await orgIsTest(row!.org_id as string)).toBe(true);
  const ev = (await eventsFor(ids.owner.id, 'job_created', new Date(Date.now() - 60_000).toISOString())).filter((e) => e.properties.job_id === j.id);
  expect(ev.length).toBe(1);
  expect(ev[0].is_test).toBe(true);
  await owner.dispose();
});
