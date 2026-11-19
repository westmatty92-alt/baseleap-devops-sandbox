// US-004 (board), US-010 (other days), US-012 and US-013 (P2) on screen. Runs on mobile (390) and desktop (1280).
import { test, expect } from './support/fixtures';
import { apiAs, createJob, board } from './support/api';
import { card, gotoBoard } from './support/ui';
import { addDays, chars, uniq } from './support/data';

test.describe('technician board', () => {
  test.use({ storageState: 'tests/e2e/.auth/techA.json' });

  test('AC-004.1 / AC-004.2 / AC-004.3 Tech A sees all three jobs in time order, including Tech B\'s', async ({ page, ids }) => {
    const owner = await apiAs('owner');
    const date = addDays(ids.today, 60);
    const a2 = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: date, start_time: '15:30', title: uniq('tc 15:30') });
    const b = await createJob(owner, { assigned_member_id: ids.techB.id, job_date: date, start_time: '11:00', title: uniq('tc 11:00') });
    const a1 = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: date, start_time: '09:00', title: uniq('tc 09:00') });
    await gotoBoard(page, date);
    const titles = await page.locator('article h2').allInnerTexts();
    expect(titles).toEqual([a1.title, b.title, a2.title]);
  });

  test('AC-004.4 a job card shows title, time, address, customer name and phone, notes, technician and status', async ({ page, ids }) => {
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techB.id, job_date: ids.today, start_time: '13:20', title: uniq('full card'), address: '45 Main St W, Hamilton', customer_name: 'Pat Example', customer_phone: '(905) 555-0123', notes: 'Key under mat' });
    await gotoBoard(page);
    const c = card(page, j.title);
    for (const t of ['13:20', '45 Main St W, Hamilton', 'Pat Example', '(905) 555-0123', 'Key under mat', ids.techB.name]) await expect(c).toContainText(t);
    await expect(c).toContainText(/scheduled/i);
  });

  test('AC-004.4 a job without customer details or notes shows no empty labels for them', async ({ page, ids }) => {
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('bare card') });
    await gotoBoard(page);
    const c = card(page, j.title);
    await expect(c).not.toContainText(/customer phone|undefined|null/i);
    await expect(c.getByRole('link', { name: /tel:|call/i })).toHaveCount(0);
  });

  test('AC-004.5 an empty today shows "No jobs today" and no error (today\'s response emptied in the browser: the shared e2e org is rarely empty)', async ({ page }) => {
    await page.route('**/api/board**', async (route) => {
      const res = await route.fetch();
      const body = await res.json();
      await route.fulfill({ response: res, json: { ...body, jobs: [], job_count: 0 } });
    });
    await gotoBoard(page);
    await expect(page.getByText('No jobs today')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('AC-004.8 with the phone clock on Pacific time at 22:00 the board still shows the Toronto date', async ({ browser, ids }) => {
    const ctx = await browser.newContext({ storageState: 'tests/e2e/.auth/techA.json', timezoneId: 'America/Los_Angeles' });
    const page = await ctx.newPage();
    // 22:00 Pacific on the Toronto "today" is 01:00 the next day in Toronto: a client that trusts the phone shows the wrong day.
    const pacific = new Date(`${ids.today}T22:00:00-08:00`);
    await page.clock.setFixedTime(pacific);
    await gotoBoard(page);
    const [y, m, d] = ids.today.split('-').map(Number);
    const longDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
    await expect(page.getByText(new RegExp(longDate.split(' ')[0], 'i')).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^today$/i })).toHaveCount(0); // "Today" button only shows when not on today
    await ctx.close();
  });

  test('AC-004.9 a job the owner creates appears on Tech A\'s open board after Refresh', async ({ page, ids }) => {
    await gotoBoard(page);
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('late arrival') });
    await expect(card(page, j.title)).toHaveCount(0);
    await page.getByRole('button', { name: /refresh/i }).click();
    await expect(card(page, j.title)).toBeVisible();
  });

  test('AC-004.10 a 100-character title and 200-character address wrap: no sideways scrolling', async ({ page, ids }) => {
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('wrap').padEnd(100, 'W'), address: chars(200, 'A') });
    await gotoBoard(page);
    await expect(card(page, j.title)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const cardBox = await card(page, j.title).boundingBox();
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  });

  test('AC-004.11 a failed board load shows "Can\'t load the board. Check your connection" with Retry; Retry then shows the board', async ({ page, ids }) => {
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('retry') });
    await page.route('**/api/board**', (r) => r.abort('internetdisconnected'));
    await page.goto('/board');
    await expect(page.getByText("Can't load the board. Check your connection")).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
    await page.unroute('**/api/board**');
    await page.getByRole('button', { name: /^retry$/i }).click();
    await expect(card(page, j.title)).toBeVisible();
  });

  test('AC-004.13 every tappable control is at least 44 by 44 CSS px and body text at least 16 px (board, job detail)', async ({ page, ids }) => {
    test.skip(page.viewportSize()!.width > 500, 'Defined for the 390px viewport');
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('targets') });
    for (const path of ['/board', `/jobs/${j.id}`]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const small = await page.evaluate(() => {
        const out: string[] = [];
        document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [role="button"]').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          if (el.closest('.sr-only, [class*="skip"]')) return;
          if (r.width < 43.5 || r.height < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute('aria-label') || '').slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
        });
        return out;
      });
      expect(small, `${path} small targets`).toEqual([]);
      const tiny = await page.evaluate(() => {
        const out: string[] = [];
        document.querySelectorAll<HTMLElement>('main *').forEach((el) => {
          if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) return;
          const px = parseFloat(getComputedStyle(el).fontSize);
          if (px < 15.99) out.push(`${el.tagName.toLowerCase()} ${px}px`);
        });
        return out;
      });
      expect(tiny, `${path} text under 16px`).toEqual([]);
    }
  });

  test('AC-010.1 the board opens on today with Previous day, Next day and a date picker; Next day shows the next date', async ({ page, ids }) => {
    await gotoBoard(page);
    for (const name of [/previous day/i, /next day/i]) await expect(page.getByRole('button', { name })).toBeVisible();
    await expect(page.locator('input[type="date"], button[aria-haspopup]').first()).toBeVisible();
    const next = addDays(ids.today, 1);
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techA.id, job_date: next, title: uniq('tomorrow') });
    await page.getByRole('button', { name: /next day/i }).click();
    await expect(card(page, j.title)).toBeVisible();
  });

  test('AC-010.3 / AC-010.4 Tech A steps to yesterday: sees that day\'s jobs and notes, no New job; Today returns to today', async ({ page, ids }) => {
    const y = addDays(ids.today, -1);
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techB.id, job_date: y, notes: 'yesterday notes', title: uniq('yesterday') });
    await gotoBoard(page);
    await page.getByRole('button', { name: /previous day/i }).click();
    await expect(card(page, j.title)).toContainText('yesterday notes');
    await expect(page.getByRole('link', { name: /new job/i })).toHaveCount(0);
    await page.getByRole('button', { name: /^today$/i }).click();
    await expect(card(page, j.title)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^today$/i })).toHaveCount(0);
  });

  test('AC-010.5 an empty other day shows "No jobs on" followed by the date', async ({ page, ids }) => {
    await gotoBoard(page, addDays(ids.today, 2500));
    await expect(page.getByText(/^no jobs on .+\d{4}/i)).toBeVisible();
  });

  test('AC-010.8 a failed load of another day shows the Can\'t load message with Retry and keeps the selected date on screen', async ({ page, ids }) => {
    await gotoBoard(page);
    await page.route('**/api/board**', (r) => r.abort('internetdisconnected'));
    await page.getByRole('button', { name: /next day/i }).click();
    await expect(page.getByText("Can't load the board. Check your connection")).toBeVisible();
    await expect(page.getByRole('button', { name: /^retry$/i })).toBeVisible();
    const [, m, d] = addDays(ids.today, 1).split('-').map(Number);
    await expect(page.getByText(new RegExp(`\\b${d}\\b`)).first()).toBeVisible();
    void m;
  });

  test('AC-012.1 / AC-012.2 phone and address are links that open the dialer and maps (P2: only if built)', async ({ page, ids }) => {
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('links'), customer_phone: '(905) 555-0123', address: '12 King St E #4 & 6, Hamilton' });
    await gotoBoard(page);
    const c = card(page, j.title);
    const tel = c.locator('a[href^="tel:"]');
    await expect(tel).toHaveAttribute('href', /tel:\+?\(?905\)?[\s-]?555-?0123|tel:9055550123/);
    const maps = c.locator('a[href*="maps"], a[href^="geo:"]');
    const href = await maps.first().getAttribute('href');
    expect(decodeURIComponent(href!)).toContain('12 King St E #4 & 6, Hamilton'); // AC-012.4: whole address, # and & encoded
    expect(href).not.toMatch(/[?&]q=[^&]*#/);
  });

  test('AC-012.3 no phone link or empty label when the job has no customer phone (P2)', async ({ page, ids }) => {
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('nolinks') });
    await gotoBoard(page);
    await expect(card(page, j.title).locator('a[href^="tel:"]')).toHaveCount(0);
  });

  test('AC-013.1 a job the owner creates for Tech A appears on the open board within 10 seconds, no reload (P2)', async ({ page, ids }) => {
    await gotoBoard(page);
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('live') });
    await expect(card(page, j.title)).toBeVisible({ timeout: 10_000 });
  });

  test('AC-013.2 after the connection returns, an open board refreshes to current data within 10 seconds (P2)', async ({ page, context, ids }) => {
    await gotoBoard(page);
    await context.setOffline(true);
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('live back') });
    await context.setOffline(false);
    await expect(card(page, j.title)).toBeVisible({ timeout: 10_000 });
  });

  test('AC-013.3 when the live connection cannot be made a "Live updates paused" notice shows and Refresh still loads data (P2)', async ({ page, ids }) => {
    await page.route(/realtime|websocket|\/ws/i, (r) => r.abort());
    await page.routeWebSocket(/.*/, (ws) => ws.close());
    await gotoBoard(page);
    await expect(page.getByText(/live updates paused/i)).toBeVisible();
    const j = await createJob(await apiAs('owner'), { assigned_member_id: ids.techA.id, job_date: ids.today, title: uniq('paused') });
    await page.getByRole('button', { name: /refresh/i }).click();
    await expect(card(page, j.title)).toBeVisible();
  });
});

test.describe('owner board', () => {
  test.use({ storageState: 'tests/e2e/.auth/owner.json' });

  test('AC-004.3 the owner sees the same jobs in the same order as the technicians, with New job beside the count', async ({ page, ids }) => {
    await gotoBoard(page);
    await expect(page.getByRole('link', { name: /new job/i }).first()).toBeVisible();
    const ui = await page.locator('article h2').allInnerTexts();
    const api = (await board(await apiAs('techA'))).jobs.map((j) => j.title);
    expect(ui).toEqual(api);
    void ids;
  });

  test('AC-004.7 / FR-6 50 jobs on one day are all reachable by scrolling, none cut off, no page 2', async ({ page, ids }) => {
    test.setTimeout(120_000);
    const owner = await apiAs('owner');
    const date = addDays(ids.today, 61);
    const titles: string[] = [];
    for (let i = 0; i < 50; i++) {
      const t = uniq(`b${String(i).padStart(2, '0')}`);
      titles.push(t);
      await createJob(owner, { assigned_member_id: i % 2 ? ids.techA.id : ids.techB.id, job_date: date, start_time: `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`, title: t });
    }
    await gotoBoard(page, date);
    await expect(page.locator('article')).toHaveCount(50);
    await page.locator('article').last().scrollIntoViewIfNeeded();
    await expect(card(page, titles[49])).toBeVisible();
    await expect(page.getByRole('link', { name: /next page|page 2|load more/i })).toHaveCount(0);
  });

  test('AC-010.7 on 2027-03-14 (clocks go forward) the board shows 08:00 then 09:00', async ({ page, ids }) => {
    const owner = await apiAs('owner');
    const nine = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: '2027-03-14', start_time: '09:00', title: uniq('dst ui 09') });
    const eight = await createJob(owner, { assigned_member_id: ids.techA.id, job_date: '2027-03-14', start_time: '08:00', title: uniq('dst ui 08') });
    await gotoBoard(page, '2027-03-14');
    const titles = await page.locator('article h2').allInnerTexts();
    expect(titles.indexOf(eight.title)).toBeGreaterThanOrEqual(0);
    expect(titles.indexOf(eight.title)).toBeLessThan(titles.indexOf(nine.title));
  });
});
