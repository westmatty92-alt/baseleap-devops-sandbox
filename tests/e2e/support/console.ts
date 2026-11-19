// Browser console collection shared by the test fixture and by helpers that make their own contexts. No imports from
// the rest of support/ on purpose (fixtures -> api -> session would otherwise be a cycle).
import type { Browser, BrowserContext } from '@playwright/test';

/**
 * Console allow-list. EMPTY ON PURPOSE (QA5): a browser console error or an uncaught page error fails the test.
 * An entry needs a `reason` that names the ticket or the third party that owns the noise, and is listed in the
 * test plan (section 10). Never add one to get a run green.
 */
export const CONSOLE_ALLOWLIST: { pattern: RegExp; reason: string }[] = [];

// One collector per test (a worker runs one test at a time). Every browser context the test uses reports into it.
let seen: string[] = [];
export const resetSeen = () => { seen = []; };
export const takeSeen = () => { const s = seen; seen = []; return s; };
const watched = new WeakSet<BrowserContext>();

/** Starts collecting `console` errors and uncaught page errors from every page of this context. Idempotent. */
export function watchContext(ctx: BrowserContext): BrowserContext {
  if (watched.has(ctx)) return ctx;
  watched.add(ctx);
  ctx.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location().url;
    seen.push(`console.error: ${m.text().slice(0, 300)}${url ? ` (${url.replace(/\?.*$/, '')})` : ''}`);
  });
  ctx.on('weberror', (e) => seen.push(`pageerror: ${String(e.error()?.message ?? e.error()).slice(0, 300)}`));
  return ctx;
}

/** `browser.newContext(...)` whose pages are watched. Specs that make their own contexts must use this. */
export const watchedContext = async (browser: Browser, options?: Parameters<Browser['newContext']>[0]) =>
  watchContext(await browser.newContext(options));
