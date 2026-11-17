# OPS2: sandbox pipeline (bl-devops)

Branch `ops/pipeline`, committed, **not pushed**. Nothing is live. No tokens were used, no `vercel`, `supabase` or `git push` was run.

## Read this first

1. **The actions are not SHA-pinned yet.** This session had no network access (Bash network commands and WebFetch were refused), so I could not resolve a single commit SHA, and I will not invent one. Every `uses:` carries a placeholder (`actions/checkout@PIN-ME-v4.2.2`, `setup-node` `v4.4.0`, `upload-artifact` `v4.6.2`) and `release.yml` has `VERCEL_CLI_VERSION: PIN-ME`. These **fail loudly on purpose**: the `workflows` job rejects any `uses:` that isn't a 40-hex SHA, and `release.yml` aborts before touching anything if the CLI version isn't an exact `x.y.z`. The fix is one pass with internet: `docs/ops/pin-actions.md` (a script plus two commands). **Do this before the first push.** The tags named in the placeholders are from memory; the script fails if one doesn't exist, and you then substitute the current release.
2. **`actionlint` was not run.** It isn't installed here and couldn't be downloaded. `gitleaks`/`osv-scanner` are installed, but running them needed approval I didn't have, so the CI scanner command lines are unverified locally. I hand-reviewed the workflows against the usual actionlint findings, but that is not proof. Run the check in `pin-actions.md` §3 after pinning.
3. **Never started a real run.** None of the workflows has executed anywhere.

## Proof

| Check | Result |
|---|---|
| `node scripts/env-check.mjs` (file mode) | ✓ `environments match the manifest` (every `process.env` name in `src/` is declared; every manifest variable is in `.env.example`; no public/secret mix-ups) |
| `infra/environments.json` valid JSON | ✓ (parsed by env-check) |
| `vercel.json` valid JSON | **by inspection only**: I couldn't run a parser (command blocked). The file is 22 lines. |
| `actionlint` | **not run** (see above) |
| `--vercel` drift check, smoke against a live URL | not possible in this step (needs token / live deployment) |

## What was built

| File | Notes |
|---|---|
| `infra/environments.json` | Branches `main` (production), `staging`, `lane/frontend`, `lane/backend`. Variables the app actually reads: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (sensitive), `SITE_URL`, `SESSION_MAX_AGE_DAYS` (optional). `VERCEL_GIT_COMMIT_SHA` is a system variable. Tooling-only names listed separately so they're flagged if they ever reach Vercel. GitHub `staging` and `production` environments; `production` requires Matthew and is limited to `main`. **Sandbox exception recorded** (one Supabase project for staging and production). |
| `.github/workflows/ci.yml` | On push to `staging`, `lane/**`, and PRs to `staging`/`main`. Jobs `verify` (lint, typecheck, unit tests, build), `security` (gitleaks over history, osv-scanner on the lockfile; both via the checksum-verified installer), `workflows` (pin check, then actionlint). Required checks for `main`: `verify`, `security`, `workflows`. |
| `.github/workflows/qa-staging.yml` | On a successful `staging` preview deployment: refuses any host that isn't this project's preview (so the bypass secret can't go elsewhere), runs the read-only smoke against that exact deployment with the commit check, then QA's `@smoke` Playwright suite **if** a Playwright config exists (none does yet). |
| `.github/workflows/release.yml` | Push to `main` → waits in the `production` environment for Matthew → config check → drift check (`env-check --vercel`) → `supabase db push --dry-run` then apply → `vercel pull` / `vercel build --prod` / `vercel deploy --prebuilt --prod` → smoke (health must report this commit) → `vercel rollback` automatically if smoke fails, then an informational smoke. Secrets only reach the steps that need them (not `npm ci`; the build runs with the Vercel token removed). |
| `.github/workflows/uptime.yml` | Every 15 min, read-only smoke of production; opens/updates one `uptime` issue, closes it on recovery. A missing `PRODUCTION_URL` fails the check without opening a false outage issue. |
| `vercel.json` | `git.deploymentEnabled.main = false`; security headers on every route including `frame-ancestors 'none'` / `X-Frame-Options: DENY`, `Referrer-Policy: same-origin` (per SECURITY_MODEL invariant 14); region `iad1`. Template parts that don't apply were removed: no crons (retention is `pg_cron`), no `/embed` block (no embedding in v1, no GHL domains). |
| `scripts/env-check.mjs`, `scripts/smoke.mjs`, `scripts/install-scanners.sh` | From the skill templates. Smoke already compares the first 7 characters, which matches what `/api/health` reports. |
| `docs/ops/setup-for-matthew.md` | Click-by-click guide: every Vercel variable, the bypass secret, IDs, the Vercel and Supabase tokens, Supabase auth redirect URLs, GitHub environments, `production` reviewer, branch protection, cleanup. No values. |
| `docs/ops/pin-actions.md`, `docs/ops/secret-inventory.md`, `docs/runbook.md` | Pinning procedure; secret inventory (names only); runbook filled for this sandbox with a Platform settings table whose status is **unverified** until Matthew has done the setup. |

## Decisions and deviations

- **`api-tests` job omitted.** `tests/api` needs a real Supabase and `tests/helpers/auth.ts` refuses the production project. In the sandbox staging *is* production, so running it would either be refused or write test data into production. CI runs the other tests with `--exclude 'tests/api/**'`. Re-enable when staging has its own project/branch.
- **No generated-code guard.** The template's `gen:api` / `gen:theme` scripts don't exist in this app (`gen:types` needs a database). Not added; flag to the architect if wanted.
- **`.nvmrc` doesn't exist**, so workflows use `node-version: 22` (matches `engines`).
- **Supabase CLI** comes from the lockfile (`npx --no-install supabase`, 3.1.0) instead of `supabase/setup-cli@latest`, so it's version-locked and one less third-party action.
- **`PRODUCTION_URL` is a repository variable**, not a `production`-environment variable. Otherwise every 15-minute uptime run would wait for Matthew's approval.
- **Staging GitHub environment holds only the bypass secret and `PRODUCTION_HOSTS`.** `SUPABASE_STAGING_*` are held back until QA's e2e suite exists to use them (least privilege).
- **Lane previews get the same variables as staging** (no per-branch rules). The template's "service role absent on lane/frontend" can't be expressed with Vercel's all-branches variables and this app has no mocking switch.
- **Release log not created:** `docs/deployments/release-log.md` isn't in this step's owned files. First entry comes with the first release.

## Things to watch in the drills (unverified assumptions)

1. **`/api/health` version after a CLI prebuilt deploy.** The app reports `VERCEL_GIT_COMMIT_SHA`. I could not confirm that Vercel populates it for `vercel deploy --prebuilt` from Actions. If it comes back `dev`, the release smoke will fail and **auto-rollback every release**. That's safe but useless. If so, the fix is app-side (a variable the workflow passes, e.g. `--build-env`/`--meta` plus a code change in `health/route.ts`, which isn't mine) → route to backend/architect.
2. **`vercel build` without the token.** I withheld the token from the build step. If the CLI insists on it, add it to that step only.
3. **First release.** Pushing `vercel.json` to `main` should itself not deploy (Vercel reads it from the pushed commit); the first `release.yml` run then performs the first real production deploy after Matthew approves.
4. **`deployment_status` and `schedule` workflows only run from `main`.** `qa-staging` and `uptime` do nothing until the pipeline is merged to `main`.
5. **GitHub plan:** required reviewers and branch protection on a private repo may need a paid plan. The setup guide stops Matthew there rather than paying. Unresolved spend decision if so.
6. Scanner flags (`gitleaks git`, `osv-scanner scan source -L`) are unverified here; osv-scanner failing on an existing dependency vulnerability is expected behaviour, not something to disable.

## Setting requests for Matthew (names, where, why; no values)

All detailed in `docs/ops/setup-for-matthew.md`.

| Name | Where | Why |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel, Production + Preview | App runtime and health `?check=db` |
| `SUPABASE_SERVICE_ROLE_KEY` (Sensitive) | Vercel, Production + Preview | Server-side admin client |
| `SITE_URL` (two rows) | Vercel, Production and Preview | Sign-in email redirect |
| Protection Bypass for Automation → `VERCEL_AUTOMATION_BYPASS_SECRET` | Vercel project → GitHub `staging` secret | Staging checks past preview protection |
| `PRODUCTION_HOSTS` | GitHub `staging` variable | Staging checks refuse production |
| `VERCEL_TOKEN` (team-scoped, 30 days) | GitHub `production` secret | Release deploy / rollback |
| `SUPABASE_ACCESS_TOKEN` (30 days) | GitHub `production` secret | Release migrations |
| `SUPABASE_DB_PASSWORD` | GitHub `production` secret | Release migrations |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `SUPABASE_PRODUCTION_REF` | GitHub `production` variables | Release targets |
| `PRODUCTION_URL` | GitHub repository variable | Smoke and uptime |
| Required reviewer = Matthew; deployment branch `main` | GitHub `production` environment | The mechanical human gate |
| Protect `main`: PR + `verify`, `security`, `workflows` | GitHub branch protection (after the first CI run) | Only path to production |
| Auth redirect URLs (production + staging) | Supabase → Authentication → URL Configuration | Sign-in links return to the app |

## Next

1. Someone with internet: `docs/ops/pin-actions.md`, then actionlint, then commit.
2. Matthew: `docs/ops/setup-for-matthew.md`.
3. Push `ops/pipeline`, PR to `staging`, confirm CI green; then `env-check --vercel` and `smoke.mjs <staging URL>`; merge to `main` for the scheduled and deployment-triggered workflows to start.
