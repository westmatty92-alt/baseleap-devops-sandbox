// AC-004.12: board visible within 2 s on simulated 4G (1.6 Mbps down, 150 ms RTT) with 30 jobs.
// Chromium only (CDP network emulation). The budget is NOT raised to make this pass: a miss is a ticket.
// QA3: fixme until the board screen and browser sessions exist.
import { test, expect } from './support/fixtures';
import { apiAs, createJob } from './support/api';
import { addDays, uniq } from './support/data';
import { UNBUILT } from './support/unbuilt';

test.fixme(true, `${UNBUILT.screen}; ${UNBUILT.signin}`);
test.use({ storageState: 'tests/e2e/.auth/techA.json' });

test('AC-004.12 30 jobs are visible within 2 seconds on simulated 4G', async ({ page, context, ids }) => {
  test.setTimeout(120_000);
  const owner = await apiAs('owner');
  const date = addDays(ids.today, 62);
  for (let i = 0; i < 30; i++) {
    await createJob(owner, { assigned_member_id: i % 2 ? ids.techA.id : ids.techB.id, job_date: date, start_time: `${String(Math.floor(i / 2) + 6).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, title: uniq(`perf ${i}`), customer_name: 'Pat Example', customer_phone: '(905) 555-0123', notes: 'Key under mat' });
  }
  // Warm sign-in cookies and the date's data are already created; measure a cold load of the day, not the first deploy hit.
  await page.goto('/board');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const started = Date.now();
  await page.goto(`/board?date=${date}`, { waitUntil: 'commit' });
  await expect(page.locator('article')).toHaveCount(30, { timeout: 2_000 });
  const elapsed = Date.now() - started;
  expect(elapsed, 'ms from navigation to 30 cards').toBeLessThanOrEqual(2_000);
});
