// US-005: installable app. Black-box checks only: manifest, icons, service worker, offline screen. Real installation on
// Android / iPhone (AC-005.2, AC-005.3, AC-005.4) is a manual check on devices and is NOT covered here.
// QA3: fixme. The app has no manifest, service worker, icons or offline content yet.
import { test, expect } from './support/fixtures';
import { UNBUILT } from './support/unbuilt';

test.fixme(true, `${UNBUILT.pwa}; ${UNBUILT.signin}`);
test.use({ storageState: 'tests/e2e/.auth/techA.json' });

type Manifest = { name?: string; short_name?: string; display?: string; start_url?: string; icons?: { src: string; sizes: string; type?: string; purpose?: string }[] };

test('AC-005.1 the manifest has a name, standalone display, a start address that opens today\'s board, and 192 and 512 px icons', async ({ page, request }) => {
  await page.goto('/board');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href, 'a <link rel="manifest"> on the page').toBeTruthy();
  const res = await request.get(href!);
  expect(res.status()).toBe(200);
  const m: Manifest = await res.json();
  expect(m.name || m.short_name).toBeTruthy();
  expect(m.display).toBe('standalone');
  expect(m.start_url).toMatch(/^\/board|\/board(\?|$)/);
  const sizes = (m.icons ?? []).map((i) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const icon of m.icons ?? []) {
    const r = await request.get(icon.src);
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()['content-type']).toMatch(/^image\//);
  }
});

test('AC-005.3 an Apple touch icon is provided and resolves', async ({ page, request }) => {
  await page.goto('/board');
  const href = await page.locator('link[rel="apple-touch-icon"]').first().getAttribute('href');
  expect(href, '<link rel="apple-touch-icon">').toBeTruthy();
  const r = await request.get(href!);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toMatch(/^image\//);
});

test('AC-005.1 the service worker registers and controls the page (installability prerequisite)', async ({ page }) => {
  await page.goto('/board');
  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.scope;
  });
  expect(scope).toMatch(/\/$/);
});

test('AC-005.5 with no connection the installed app shows the branded "You\'re offline" screen with Retry, not a browser error', async ({ page, context }) => {
  await page.goto('/board');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); // let the worker take control and cache /offline
  await context.setOffline(true);
  await page.goto('/board').catch(() => undefined);
  await expect(page.getByText("You're offline")).toBeVisible();
  await expect(page.getByRole('button', { name: /^retry$/i })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0); // no job data offline (NG-9)
  await page.getByRole('button', { name: /^retry$/i }).click();
  await expect(page.getByText(/still no connection/i)).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button', { name: /^retry$/i }).click();
  await expect(page).toHaveURL(/\/board/);
});

test('SECURITY 12 / NG-9 the service worker caches no /api/ response and no page with job data', async ({ page }) => {
  await page.goto('/board');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  const cached = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) out.push(new URL(req.url).pathname);
    return out;
  });
  for (const p of cached) {
    expect(p, 'cached path').not.toMatch(/^\/api\//);
    expect(p, 'cached path').not.toMatch(/^\/(board|jobs|team)(\/|$)/);
  }
});

test('AC-005.2 the page declares standalone-capable metadata (theme colour, viewport); real full-screen launch is checked on a device', async ({ page }) => {
  await page.goto('/board');
  expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toMatch(/width=device-width/);
  expect(await page.locator('meta[name="theme-color"]').count()).toBeGreaterThan(0);
});
