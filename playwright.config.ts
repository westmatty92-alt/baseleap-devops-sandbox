// playwright.config.ts: QA-owned. Black-box e2e, API and permission probes against the STAGING preview, or (pre-staging
// check only) this repo's local stack on http://localhost:3000.
//
// Environment (names only, never values):
//   BASE_URL                          staging Vercel preview (or the named staging host); http://localhost:3000 with E2E_TARGET=local.
//   E2E_TARGET                        `local` for the local stack. Anything else (or unset) means a remote staging target.
//   STAGING_HOST                      optional: one named staging host that is allowed besides *.vercel.app previews.
//   PRODUCTION_HOSTS                  comma-separated production hosts (and aliases). Required in BOTH modes: with it unset
//                                     the run is refused, because production is also a *.vercel.app address (PRD constraints).
//   VERCEL_AUTOMATION_BYPASS_SECRET   Vercel Deployment Protection bypass, sent as `x-vercel-protection-bypass` (never to localhost).
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY   tenant setup and the Data API probes.
//   SUPABASE_PROD_PROJECT_REF         remote mode only: the suite refuses a Supabase URL containing it.
//
// The setup project creates its own `is_test` organisation with an owner and two technicians (service role), signs them
// in, and the cleanup project removes what setup created (decision 0004). No pre-seeded accounts are needed.
// `playwright test --list` needs none of the variables. Any real run does, and tests/e2e/support/guard.ts refuses
// production, and in remote mode a non-https URL, localhost, and any host that is not a Vercel preview or STAGING_HOST.
import { defineConfig, devices } from '@playwright/test';
import { assertSafeTarget, BYPASS_HEADER, isLocalRun } from './tests/e2e/support/guard';

const listing = process.argv.includes('--list');
const baseURL = process.env.BASE_URL?.replace(/\/+$/, '');

// Hard refusal, at config load, before any browser starts. Listing runs nothing, so it is the only exemption;
// every spec file also re-checks through the fixtures in tests/e2e/support/fixtures.ts.
if (!listing) assertSafeTarget(baseURL, process.env);

const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const extraHTTPHeaders: Record<string, string> = bypass && !isLocalRun(process.env)
  ? { [BYPASS_HEADER]: bypass, 'x-vercel-set-bypass-cookie': 'true' }
  : {};

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  // Same-day reruns must pass (AC-006.5): every test makes its own uniquely titled data.
  fullyParallel: false,
  workers: process.env.CI ? 2 : 1,
  // No retries hide anything: a pass on retry is FLAKY, reported as such. Retries are on only so the report can say so.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'docs/qa-reports/playwright', open: 'never' }],
    ['json', { outputFile: 'docs/qa-reports/playwright/results.json' }],
  ],
  // Default timeouts are kept on purpose. Raising them to hide slowness is not allowed (the 2 s board budget is asserted).
  use: {
    baseURL,
    extraHTTPHeaders,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'en-CA',
    timezoneId: 'America/Toronto',
    acceptDownloads: false,
  },
  projects: [
    // Creates the e2e org, owner, Tech A and Tech B, signs them in (no email) and records ids and tokens.
    { name: 'setup', testMatch: /support\/auth\.setup\.ts/, teardown: 'cleanup' },
    // Removes only what setup and the specs registered in the manifest (auth users; the org when the database allows it).
    { name: 'cleanup', testMatch: /support\/auth\.teardown\.ts/ },

    // Phone: 390 px wide (AC-004.1, AC-004.13). Technicians and the owner on a phone.
    {
      name: 'mobile',
      dependencies: ['setup'],
      testMatch: /.*\.spec\.ts/,
      testIgnore: /api\//,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    // Owner on a laptop (1024+ side column layout, SCR-03 three-column cards).
    {
      name: 'desktop',
      dependencies: ['setup'],
      testMatch: /.*\.spec\.ts/,
      // Sign-in, PWA and performance specs are phone-first and make requests that share a per-IP rate limit
      // (10 / 15 min, SECURITY_MODEL), so they run once, in the mobile project.
      testIgnore: [/api\//, /signin\.spec/, /pwa\.spec/, /perf\.spec/],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    // No "embed" project: the PRD has no embed screens (no GHL embed in v1, SECURITY_MODEL invariant 14).
    // Instead tests/e2e/api/contract.spec.ts asserts the app refuses to be framed (on Vercel, where vercel.json sets it).

    // HTTP only: contract, validation, permission probes. No browser.
    {
      name: 'api',
      dependencies: ['setup'],
      testMatch: /api\/.*\.spec\.ts/,
    },
  ],
});
