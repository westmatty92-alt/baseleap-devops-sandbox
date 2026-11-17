# STEP OPS2 — pipeline for the DevOps sandbox (build the files; nothing goes live in this step)
Agent: bl-devops · Skills: ops-ci, ops-environments, ops-release, ops-observe, ops-platform, ops-secrets

## The sandbox (throwaway, deleted after the drills)
- GitHub repo `westmatty92-alt/baseleap-devops-sandbox` (private), this checkout, branch `ops/pipeline`. The app is a Next.js + Supabase practice app; `GET /api/health` reports the version from `VERCEL_GIT_COMMIT_SHA`.
- Vercel project `baseleap/baseleap-devops-sandbox`, production URL `https://baseleap-devops-sandbox.vercel.app`; currently deploys every push through Vercel's Git integration.
- Supabase project ref `lrwtbrycrjturxnyqdta` (ca-central-1). **Sandbox exception:** there is one Supabase project, used for both staging and production. Record that in environments.json as a sandbox-only exception; real projects never share.

## Do
1. `infra/environments.json` from the ops-environments template, filled for this sandbox: branches `main` (production), `staging` (preview), the lanes; variables this app actually reads (find them in the code: names only); GitHub environments `staging` and `production` with their secrets and variables; `production` requires Matthew's review.
2. `.github/workflows/`: `ci.yml` (lint, typecheck, unit tests, build, actionlint, gitleaks, osv, on push to `lane/*`, `staging` and PRs), `qa-staging.yml` (`@smoke` against the staging preview through the bypass header), `release.yml` (production only through this workflow, behind the `production` environment; migrations first, then `vercel deploy --prebuilt --prod`, then smoke; automatic `vercel rollback` when the health check reports the wrong version), `uptime.yml`. Pin every action by full commit SHA; least-privilege `permissions`.
3. `vercel.json` (ops-platform): turn off automatic production deploys from Git so `release.yml` is the only path to production; previews still build.
4. `docs/ops/setup-for-matthew.md`: **click-by-click** steps, for a non-developer, for everything only Matthew can do: each Vercel environment variable (name, which environments, where to find the value in Supabase), each GitHub secret and variable per environment, the `production` environment with Matthew as required reviewer, the Vercel token to create (minimum scope, expiry), the Supabase access token, and Vercel's Protection Bypass for Automation secret. Never a value; say where each value comes from.
5. Prove the files: `actionlint` (or `npx --yes actionlint`), `node scripts/env-check.mjs` against environments.json (file mode), JSON valid. Commit on `ops/pipeline`. Do not push.

## Owned files
.github/workflows/** · infra/** · vercel.json · scripts/env-check.mjs · scripts/smoke.mjs · scripts/install-scanners.sh · docs/ops/** · docs/runbook.md · .baseleap/reports/OPS2.md

## Rules
Never run `vercel` against production, `vercel env pull`, `supabase db push`, or `git push`. No tokens: you hold none and need none in this step. Commit with one plain command per call: `git add <owned paths>`, then `git commit -m "STEP OPS2: sandbox pipeline"`.
