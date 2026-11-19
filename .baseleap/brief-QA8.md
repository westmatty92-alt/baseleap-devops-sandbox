# STEP QA8 — first staging run, and CI lint

Agent: bl-qa · Skills: qa-report, qa-e2e

## Context
1. **CI `verify` fails on `npm run lint`** (required check; PR #10 can't merge): 2 errors in `tests/e2e/support/fixtures.ts`
   (`react-hooks/rules-of-hooks`: the rule reads Playwright's fixture callback `use` as a React hook) and 17
   unused-variable warnings in `roundtrip.spec.ts` / `shapes.spec.ts`.
2. **First staging run** (qa-staging run 44434945604, exact staging deployment of 1727926, staging Supabase project):
   log at `.baseleap/inputs/qa8-staging-run.log`. Setup created the tenant, mobile + desktop smoke passed, cleanup ran.
   One failure: `AC-006.3 GET /api/health?check=db` → **503** (passed on the local stack). Claude checked: production
   answers `{"status":"degraded","checks":{"app":"ok","db":"down"}}` too, and the hosted Supabase REST root (`/rest/v1/`)
   refuses the anon key while the local stack accepts it. See `src/app/api/health/route.ts` `dbReachable()`.

## Do
1. Fix the lint errors in your files without disabling the rule globally (e.g. name the fixture callback something
   other than `use`, or a scoped, commented eslint override inside your file), and clear the warnings. Run `npm run lint`
   and `npx tsc --noEmit -p tsconfig.json`; both must be clean.
2. Write the ticket for the health check (`docs/qa-reports/tickets/`): class, owner, AC, steps, expected/actual, evidence,
   request id if the 503 carries one, and why the local stack can't show it. Don't change the test.
3. Verdict for the staging run in `docs/qa-reports/latest-run.md` and `.baseleap/reports/QA8.md`, including whether the
   staging DoD items held (tenant created and cleaned up, mobile/desktop, production refused) and what's still missing
   (embed project, full suite beyond @smoke).

## Owned files
tests/e2e/** · docs/qa-reports/** · .baseleap/reports/QA8.md
One plain command per Bash call. Commit with `git add tests/e2e docs/qa-reports .baseleap/reports/QA8.md`, then
`git commit -m "STEP QA8: staging run verdict, lint"`. Don't push.
