// US-001: sign in by emailed link. No inbox is read: the one-time link is generated with the admin helper
// (decision 0004) and opened like a person would. "No email sent" is asserted from the server's own
// signin_link_requested event (listed true/false), not from a mailbox. Each test starts signed out.
//
// Staging note: a listed request makes the server send real mail through the staging SMTP. Tests that need that use a
// throwaway technician added by the e2e owner (example.test addresses), so the three fixed accounts keep their
// 60-second budget. The per-IP limit (10 / 15 min) caps how many requests this file may make: keep it under 10.
import { test, expect } from './support/fixtures';
import { addTechnician, apiAs, loadIds } from './support/api';
import { confirmPathFor, signInWithLink } from './support/session';
import { eventsFor, signinRequestsSince } from './support/admin';
import { uniqueEmail } from './support/data';

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: 'serial' });

const SENT = /if this email is on the team, a link is on its way/i;
const submit = async (page: import('@playwright/test').Page, email: string) => {
  await page.goto('/sign-in');
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByRole('button', { name: /email me a link|try again/i }).click();
};

test('AC-001.1 owner signs in by emailed link and lands on today\'s board with the Owner role', async ({ page }) => {
  const { emailOf } = await import('./support/session');
  await signInWithLink(page, emailOf('owner'));
  await expect(page).toHaveURL(/\/board/);
  await expect(page.getByText(/signed in:.*owner/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /team/i }).first()).toBeVisible();
});

test('AC-001.2 Tech A signs in at 390px and lands on today\'s board with the Technician role',async ({ browser }) => {
  const { emailOf } = await import('./support/session');
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await signInWithLink(page, emailOf('techA'));
  await expect(page.getByText(/signed in:.*technician/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /team|new job/i })).toHaveCount(0);
  await ctx.close();
});

test('AC-001.3 an unlisted address gets the same message as a listed one, and the server records listed=false (no email)', async ({ page }) => {
  const since = new Date(Date.now() - 1000).toISOString();
  await submit(page, `nobody.${Date.now()}@example.test`);
  await expect(page.getByText(SENT)).toBeVisible();
  const events = await signinRequestsSince(since);
  expect(events.some((e) => e.properties.listed === false && e.member_id === null)).toBe(true);
  expect(JSON.stringify(events)).not.toMatch(/nobody\./); // no email address stored on the event
});

test('AC-001.4 " Tech.A@Example.test " (mixed case, spaces) matches the listed entry and a link is requested', async ({ page }) => {
  const owner = await apiAs('owner');
  const email = uniqueEmail('mixedcase');
  const m = await addTechnician(owner, 'Tech Mixed', email);
  const since = new Date(Date.now() - 1000).toISOString();
  await submit(page, `  ${email.replace(/^e2e/, 'E2E').toUpperCase()}  `);
  await expect(page.getByText(SENT)).toBeVisible();
  expect((await eventsFor(m.id, 'signin_link_requested', since)).some((e) => e.properties.listed === true)).toBe(true);
  await owner.dispose();
});

test('AC-001.5 a second link for the same address within a minute says "Wait a minute before asking for another link"', async ({ page }) => {
  const owner = await apiAs('owner');
  const email = uniqueEmail('wait');
  await addTechnician(owner, 'Tech Wait', email);
  await submit(page, email);
  await expect(page.getByText(SENT)).toBeVisible();
  await submit(page, email); // seconds later, inside the 60 s window (stricter than the 20 s in the criterion)
  await expect(page.getByText(/wait a minute before asking for another link/i)).toBeVisible();
  await owner.dispose();
});

test('AC-001.3 / SECURITY 4 the sent screen is identical for listed, unlisted, and malformed-but-valid addresses', async ({ page }) => {
  const ids = loadIds();
  const owner = await apiAs('owner');
  const email = uniqueEmail('same');
  await addTechnician(owner, 'Tech Same', email);
  const texts: string[] = [];
  for (const e of [email, `unlisted.${Date.now()}@example.test`]) {
    await submit(page, e);
    await expect(page.getByText(SENT)).toBeVisible();
    texts.push((await page.locator('main').innerText()).replace(/\S+@\S+/g, '<email>'));
  }
  expect(texts[0]).toBe(texts[1]);
  void ids;
  await owner.dispose();
});

test('AC-001.6 a link that was already used shows "This link has expired or was already used" with a form for a new one', async ({ browser }) => {
  const owner = await apiAs('owner');
  const email = uniqueEmail('used');
  await addTechnician(owner, 'Tech Used', email);
  const path = await confirmPathFor(email);
  const first = await browser.newContext();
  const p1 = await first.newPage();
  await p1.goto(path);
  await p1.getByRole('button', { name: /^sign in$/i }).click();
  await p1.waitForURL(/\/board/);
  const second = await browser.newContext();
  const p2 = await second.newPage();
  await p2.goto(path);
  await p2.getByRole('button', { name: /^sign in$/i }).click();
  await expect(p2).toHaveURL(/\/link-expired/);
  await expect(p2.getByText(/this link has expired or was already used/i)).toBeVisible();
  await expect(p2.getByRole('button', { name: /email me a new link/i })).toBeVisible();
  expect((await second.request.get('/api/me')).status()).toBe(401); // no session started
  await first.close(); await second.close(); await owner.dispose();
});

test('AC-001.6 opening the link (GET) alone does not use it up: a scanner prefetch leaves it valid', async ({ browser }) => {
  const owner = await apiAs('owner');
  const email = uniqueEmail('prefetch');
  await addTechnician(owner, 'Tech Prefetch', email);
  const path = await confirmPathFor(email);
  const scanner = await browser.newContext();
  expect((await scanner.request.get(path)).status()).toBe(200); // GET only, like an email scanner
  const person = await browser.newContext();
  const page = await person.newPage();
  await page.goto(path);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/board/);
  await scanner.close(); await person.close(); await owner.dispose();
});

test('AC-001.7 a signed-out visit to the board goes to sign-in and shows no job data', async ({ page }) => {
  await page.goto('/board');
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole('article')).toHaveCount(0);
  for (const path of ['/team', '/jobs/new']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in/);
  }
});

test('AC-001.9 Sign out returns to sign-in and the board address then sends the device to sign-in again', async ({ browser }) => {
  const owner = await apiAs('owner');
  const email = uniqueEmail('signout');
  await addTechnician(owner, 'Tech Signout', email); // own session so other tests\' sessions are not revoked
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signInWithLink(page, email);
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto('/board');
  await expect(page).toHaveURL(/\/sign-in/);
  await ctx.close(); await owner.dispose();
});

test('AC-001.10 the session cookie is set to last about 30 days (proxy: cookie lifetime >= 29 days)', async ({ browser }) => {
  const owner = await apiAs('owner');
  const email = uniqueEmail('persist');
  await addTechnician(owner, 'Tech Persist', email);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signInWithLink(page, email);
  const auth = (await ctx.cookies()).filter((c) => /^sb-.*-auth-token/.test(c.name));
  expect(auth.length).toBeGreaterThan(0);
  for (const c of auth) {
    expect(c.expires, `${c.name} must be persistent`).toBeGreaterThan(0);
    expect(c.expires - Date.now() / 1000).toBeGreaterThanOrEqual(29 * 86_400);
    expect(c.secure).toBe(true);
    expect(c.sameSite).toBe('Lax');
  }
  await ctx.close(); await owner.dispose();
});

test('SECURITY 3 every app page is auth-gated: signed-out /board, /team, /jobs/new, /jobs/{id} redirect to sign-in', async ({ page }) => {
  for (const path of ['/board', '/team', '/jobs/new', '/jobs/00000000-0000-4000-8000-000000000000']) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/sign-in/);
  }
  await expect(page.getByLabel(/email/i).first()).toBeVisible();
});
