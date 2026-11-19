# QA run report

**Verdict: NOT RUN.** There is no verdict yet, and nothing in this file is evidence of a pass.

- Step: QA3 (suite brought into the repo and adapted to the app as built)
- Written: 2026-11-18
- Target: none. The local run needs Supabase keys that QA cannot read; the commands are in `.baseleap/reports/QA3.md` for Claude to run.
- What was checked without keys: the suite lists and compiles (`npx playwright test --list`: 334 test cases across projects; TypeScript clean on `playwright.config.ts` and `tests/e2e/**`), and the config refuses to start with `BASE_URL` unset.
- Not run: `tests/api/e2e-guard.test.ts` (vitest was not approved in this session), `@smoke`, the API project, anything in a browser.

When a run exists, this file is replaced by the run's results: counts per project, failures Critical first with trace paths, FLAKY listed separately, `fixme` listed with reasons, and the commit SHA and target of the run. The Playwright HTML and JSON reports are written to `docs/qa-reports/playwright/`.
