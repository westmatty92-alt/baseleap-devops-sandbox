# STEP OPS9 — QA's Playwright suite runs on staging (its own database)

Agent: bl-devops · Skills: ops-ci, ops-environments

## Context
QA's suite (`playwright.config.ts`, `tests/e2e/**`) now creates its own test organisation and users with the service
role, runs, and cleans up. It passes locally. `qa-staging.yml` already runs `npx playwright test --grep @smoke` against
the exact staging deployment, but its `smoke` job doesn't give the suite the staging database settings, so setup can't
create the tenant. What QA needs is in `.baseleap/reports/QA3.md` § "What staging needs".

The `staging` GitHub environment already holds (names only): secrets `SUPABASE_STAGING_URL`,
`SUPABASE_STAGING_ANON_KEY`, `SUPABASE_STAGING_SERVICE_ROLE_KEY`, `SUPABASE_STAGING_DB_URL`,
`VERCEL_AUTOMATION_BYPASS_SECRET`; variables `SUPABASE_STAGING_REF`, `PRODUCTION_HOSTS`.

## Do
1. In `qa-staging.yml`'s Playwright step only (not the read-only smoke step), map:
   `NEXT_PUBLIC_SUPABASE_URL` ← `secrets.SUPABASE_STAGING_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` ← `secrets.SUPABASE_STAGING_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` ← `secrets.SUPABASE_STAGING_SERVICE_ROLE_KEY`. Scope them to that step.
2. `SUPABASE_PROD_PROJECT_REF`: the suite refuses a Supabase URL containing it. It's an ID, not a secret, and it's
   already in `infra/environments.json` (`environments.production.supabase`). Read it from there in the workflow
   (`jq -r`), and fail the step if it's empty. Don't add a GitHub variable.
3. Add a guard before Playwright: fail if `SUPABASE_STAGING_URL` doesn't contain `vars.SUPABASE_STAGING_REF`, or
   contains the production ref. Print nothing secret.
4. Run the workflow policy (`node scripts/workflow-policy.mjs .github/workflows`) and actionlint if available.
5. Commit with `git add .github/workflows/qa-staging.yml`, then `git commit -m "STEP OPS9: qa-staging runs QA's suite on the staging database"`.
   Don't push; Claude pushes. Note in `.baseleap/reports/OPS9.md` what changed and what to look for in the run.
