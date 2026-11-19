# STEP QA3 — the end-to-end suite runs against the real app (local first, then staging)

Agent: bl-qa · Skills: qa-plan, qa-e2e, qa-probe, qa-report

## Context
On Nov 15 (QA1) you wrote a test plan and Playwright specs for this product from the blueprint, before any app code
existed: copies in `.baseleap/inputs/qa1/` (test-plan.md, playwright.config.ts, specs). The app now exists in this repo
(Next.js + Supabase; screens under `src/app/(app)` and `src/app/(auth)`, API under `src/app/api`). Staging now has its
own Supabase project; production is separate.

## Do
1. Bring the plan and specs into the repo (`docs/test-plan.md`, `playwright.config.ts`, `tests/e2e/**`) and adapt them
   to the app as built: real routes, labels and API shapes (read the code and `docs/openapi.yaml`; don't change app code).
   Every AC keeps a row; tests for screens that don't exist yet are marked `test.fixme` with the reason, not deleted.
2. Keep the safety rules: the config refuses to run with `PRODUCTION_HOSTS` unset or a production host; the tenant
   setup creates its own org/users with the service role and tears them down; never touches data it didn't create.
3. Run locally against the local stack: `npx supabase start` (this repo's ports 554xx only; never other containers),
   `npm run dev` on port 3000 (in the background), then the `@smoke` tag and the API probes. Local env comes from
   `npx supabase status -o env` — you can't read it yourself, so write the commands you need into
   `.baseleap/reports/QA3.md` and stop there if the run needs keys; Claude will run them.
4. Report: ACs covered / fixme / failing, the exact commands to run the suite, and what staging needs
   (`qa-staging.yml` env names) for the same run in CI.

## Owned files
docs/test-plan.md · playwright.config.ts · tests/e2e/** · tests/api/** · docs/qa-reports/** · .baseleap/reports/QA3.md
Commit with one plain command per call (`git add <owned paths>`, then `git commit -m "STEP QA3: e2e suite on the real app"`). Don't push.
