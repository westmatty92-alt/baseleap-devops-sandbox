// Reasons for tests that cannot run yet. Each one is a `test.fixme(true, REASON)` on a describe block or file: the test stays,
// is listed as "fixme" in the report, and is switched on by deleting that one line when the thing it needs is built.
// Nothing here weakens a test. (State of the app when QA3 was written: src/app has screens that are placeholders, and the
// API routes health, me, board, POST /jobs and PUT /jobs/{id}/status only.)

export const UNBUILT = {
  screen: 'the screen is still a placeholder (src/components/placeholder-screen.tsx); the real screen is not built yet',
  signin: 'sign-in is not built: no /auth/confirm route, no sign-in form, no src/proxy.ts redirect (AC-001); browser sessions cannot be made yet',
  getJob: 'GET /api/jobs/{job_id} is not built (src/app/api/jobs has POST /jobs and PUT /jobs/{job_id}/status only)',
  patchJob: 'PATCH /api/jobs/{job_id} is not built',
  cancel: 'POST /api/jobs/{job_id}/cancel is not built',
  technicians: 'GET /api/technicians is not built',
  team: 'the /api/team routes (GET, POST, POST {id}/remove) are not built',
  events: 'POST /api/events is not built',
  pwa: 'the PWA is not built: no manifest, service worker, icons or /offline screen content (US-005)',
  sw: 'public/sw.js does not exist (PWA not built)',
  audit: 'depends on an endpoint that is not built (see the other reasons)',
  p2: 'P2 story: not in the approved scope (docs/user-flows.md) and its screen is not built',
} as const;

/**
 * Checks that depend on Vercel, not on the app: vercel.json sets the security headers, and `next dev` does not apply
 * vercel.json. They run on the staging preview and are skipped on the local stack, with this reason in the report.
 */
export const VERCEL_ONLY = 'security headers come from vercel.json, which only a Vercel deployment applies; this check runs on the staging preview';
