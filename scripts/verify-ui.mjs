#!/usr/bin/env node
// verify-ui — the frontend's repeatable visual proof (and the ledger re-runs it).
//
//   node scripts/verify-ui.mjs <base-url> SCR-03=/board SCR-03--empty=/board?state=empty \
//        [--step FE1] [--repo dir] [--click "SCR-03=button:has-text('Refresh')"] \
//        [--allow-request "/_vercel/insights"] [--header "x-vercel-protection-bypass: $BYPASS"]
//
// For each screen (an id like SCR-03 or SCR-03--empty for a state) it opens the page at phone (390),
// desktop (1280) and, for embed screens in docs/user-flows.md, embed (800) widths; screenshots each;
// records console errors and failed requests on load and after an optional click; runs axe at phone
// width. Evidence goes to .baseleap/reports/<STEP>/ (screenshots + verify-ui.json).
// Exit 1 on any console error, failed request (≥ 400 or network error) not allowed by --allow-request,
// axe violation, or page that doesn't load.
//
// Evidence comes from the lane's Vercel preview in real builds (bl-frontend F3); dry runs may use a
// local `next start` build (F13). --header values given as $NAME are read from the environment.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, launch, WIDTHS } from './lib/playwright.mjs';
import { embedScreens } from './render-mockups.mjs';

const ID = /^SCR-\d{2,3}(--[a-z0-9-]+)?$/;

export function parseArgs(argv, env = process.env) {
  const out = { base: null, screens: [], repo: '.', step: 'verify-ui', headers: {}, clicks: {}, allow: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--repo') out.repo = next();
    else if (a === '--step') out.step = next();
    else if (a === '--allow-request') out.allow.push(new RegExp(next()));
    else if (a === '--header') {
      const [k, ...v] = next().split(':');
      out.headers[k.trim()] = v.join(':').trim().replace(/^\$(\w+)$/, (_, n) => env[n] ?? '');
    } else if (a === '--click') {
      const raw = next(); const eq = raw.indexOf('=');
      if (eq < 0) throw new Error('--click wants SCR-NN=<selector>');
      out.clicks[raw.slice(0, eq)] = raw.slice(eq + 1);
    } else if (a.includes('=') && ID.test(a.split('=')[0])) {
      const [id, ...route] = a.split('=');
      out.screens.push({ id, route: route.join('=') || '/' });
    } else if (!out.base) out.base = a.replace(/\/$/, '');
    else throw new Error(`unexpected argument: ${a}`);
  }
  if (!out.base || !/^https?:\/\//.test(out.base)) throw new Error('usage: verify-ui.mjs <base-url> SCR-01=/route …');
  if (!out.screens.length) throw new Error('name at least one screen: SCR-01=/route');
  if (!/^[\w.-]+$/.test(out.step)) throw new Error('--step must be a plain step id');
  return out;
}

/** The SCR-NN part of SCR-NN--state, used for the embed lookup. */
export const baseId = (id) => id.split('--')[0];

/**
 * Turns raw observations into problems. results: [{ id, width, status, console: [], failedRequests: [{url, status}], axe: [] }]
 */
export function evaluate(results, allow = []) {
  const problems = [];
  for (const r of results) {
    const where = `${r.id} @ ${r.width}`;
    if (!r.status || r.status >= 400) problems.push(`${where}: page didn't load (${r.status || 'no response'})`);
    for (const c of r.console ?? []) problems.push(`${where}: console error: ${c.slice(0, 200)}`);
    for (const f of r.failedRequests ?? []) {
      if (allow.some((re) => re.test(f.url))) continue;
      problems.push(`${where}: request failed: ${f.status || 'network'} ${f.url}`);
    }
    for (const v of r.axe ?? []) problems.push(`${where}: axe ${v.impact ?? ''} ${v.id}: ${v.help} (${v.nodes} node${v.nodes === 1 ? '' : 's'})`.replace(/\s+/g, ' '));
  }
  return problems;
}

async function observe(browser, { url, width, headers, click, withAxe, AxeBuilder, shot }) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, extraHTTPHeaders: headers });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  // Chrome also logs every ≥ 400 response as "Failed to load resource"; those are counted once, as failed requests.
  page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource:/.test(m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`uncaught: ${e.message}`));
  page.on('requestfailed', (req) => failedRequests.push({ url: req.url(), status: 0, error: req.failure()?.errorText }));
  page.on('response', (res) => { if (res.status() >= 400) failedRequests.push({ url: res.url(), status: res.status() }); });
  let status = 0;
  try {
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 });
    status = res?.status() ?? 0;
    // the document's own error status is reported as "didn't load", not twice as a failed request
    const doc = res?.url();
    for (let i = failedRequests.length - 1; i >= 0; i--) if (failedRequests[i].url === doc) failedRequests.splice(i, 1);
    if (click) {
      await page.locator(click).first().click({ timeout: 10_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    }
  } catch (e) {
    consoleErrors.push(`verify-ui: ${e.message.split('\n')[0]}`);
  }
  await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
  let axe = [];
  if (withAxe && status && status < 400) {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    axe = r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length }));
  }
  await ctx.close();
  return { status, console: consoleErrors, failedRequests, axe };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = path.resolve(args.repo);
  const outDir = path.join(dir, '.baseleap/reports', args.step);
  fs.mkdirSync(outDir, { recursive: true });
  const embeds = embedScreens(dir);
  const { chromium, AxeBuilder } = await loadPlaywright(dir, { withAxe: true });
  const browser = await launch(chromium);
  const results = [];
  try {
    for (const { id, route } of args.screens) {
      const url = args.base + (route.startsWith('/') ? route : `/${route}`);
      const widths = ['mobile', 'desktop', ...(embeds.has(baseId(id)) ? ['embed'] : [])];
      for (const w of widths) {
        const shot = path.join(outDir, `${id}-${w}.png`);
        const r = await observe(browser, { url, width: WIDTHS[w], headers: args.headers, click: args.clicks[id] ?? args.clicks[baseId(id)], withAxe: w === 'mobile', AxeBuilder, shot });
        results.push({ id, width: w, url, screenshot: path.relative(dir, shot), ...r });
      }
    }
  } finally {
    await browser.close();
  }
  const problems = evaluate(results, args.allow);
  fs.writeFileSync(path.join(outDir, 'verify-ui.json'), JSON.stringify({ base: args.base, checked_at: new Date().toISOString(), ok: problems.length === 0, problems, results }, null, 2));
  console.log(`verify-ui: ${results.length} view(s) of ${args.screens.length} screen(s) → .baseleap/reports/${args.step}/`);
  if (problems.length) { console.log(problems.map((p) => `  ${p}`).join('\n')); process.exitCode = 1; }
  else console.log('verify-ui: OK — no console errors, failed requests or axe violations');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`verify-ui: ${e.message}`); process.exit(1); });
}
