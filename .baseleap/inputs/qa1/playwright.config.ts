// playwright.config.ts: QA-owned. Black-box e2e, API and permission probes against the STAGING preview only.
//
// Environment (names only, never values):
//   BASE_URL                          the staging Vercel preview (or the named staging host). Required to run.
//   STAGING_HOST                      optional: one named staging host that is allowed besides *.vercel.app previews.
//   PRODUCTION_HOSTS                  comma-separated production hosts (and aliases). Required to run: with it unset
//                                     the run is refused, because production is also a *.vercel.app address (PRD constraints).
//   VERCEL_AUTOMATION_BYPASS_SECRET   Vercel Deployment Protection bypass secret, sent as `x-vercel-protection-bypass`.
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PROD_PROJECT_REF   the e2e sign-in helper (decision 0004).
//   E2E_OWNER_EMAIL, E2E_TECH_A_EMAIL, E2E_TECH_B_EMAIL   the three accounts of the "Baseleap E2E" org (is_test).
//
// `playwright test --list` needs none of them. Any real run does, and the guard in tests/e2e/support/guard.ts refuses
// production, a non-https URL, localhost and any host that is not a Vercel preview or STAGING_HOST.
import { defineConfig, devices } from '@playwright/test';
import { assertSafeTarget, BYPASS_HEADER } from './tests/e2e/support/guard';

const listing = process.argv.includes('--list');
const baseURL = process.env.BASE_URL?.replace(/\/+$/, '');

// Hard refusal, at config load, before any browser starts. Listing runs nothing, so it is the only exemption;
// every spec file also re-checks through the fixtures in tests/e2e/support/fixtures.ts.
if (!listing) assertSafeTarget(baseURL, process.env);

const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const extraHTTPHeaders: Record<string, string> = bypass
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
    // Signs in the three e2e accounts without reading email (decision 0004) and stores their sessions.
    { name: 'setup', testMatch: /support\/auth\.setup\.ts/ },

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
    // Instead tests/e2e/api/headers.spec.ts asserts the app refuses to be framed.

    // HTTP only: contract, validation, permission probes. No browser.
    {
      name: 'api',
      dependencies: ['setup'],
      testMatch: /api\/.*\.spec\.ts/,
    },
  ],
});
