# Runbook: baseleap-devops-sandbox

Owner: bl-devops (kept current every release) · Actions marked **Matthew** need his access.
**Sandbox exception:** staging and production share ONE Supabase project (`lrwtbrycrjturxnyqdta`). Real projects never do.

## At a glance

| | |
|---|---|
| Production | https://baseleap-devops-sandbox.vercel.app · Vercel project `baseleap/baseleap-devops-sandbox` · Supabase `lrwtbrycrjturxnyqdta` (ca-central-1) |
| Staging | stable branch URL `https://baseleap-devops-sandbox-git-staging-<team-slug>.vercel.app` (**not yet confirmed**, see `docs/ops/setup-for-matthew.md` 1.5) · same Supabase project as production (sandbox exception) |
| Health | `GET /api/health` → `{ status: "ok", checks, version: <first 7 chars of the commit> }`; `?check=db` adds a database round trip (503 when it fails) |
| Logs | Vercel → project → Logs (filter by `request_id`) |
| Uptime | GitHub Actions `uptime` workflow (every 15 min) → issue labelled `uptime` |
| Release log | `docs/deployments/release-log.md` |
| Setup (Matthew) | `docs/ops/setup-for-matthew.md` |
| Pinning the workflows | `docs/ops/pin-actions.md` |

## Deploy (normal release)

Production is deployed **only** by `.github/workflows/release.yml`. Vercel's own Git deploy of `main` is off (`vercel.json`).

1. Gate 3 approved in the ledger → DevOps opens PR `staging → main` → required checks (`verify`, `security`, `workflows`) pass → merge.
2. **Matthew:** GitHub emails "Review pending deployments". Open the `release` run → **Review deployments → production → Approve and deploy**.
3. Workflow: drift check (names only) → migrations (`supabase db push --dry-run`, then apply) → `vercel pull` / `vercel build --prod` / `vercel deploy --prebuilt --prod` → read-only smoke (health must report this commit; every `smokePaths` entry 200) → automatic `vercel rollback` if smoke fails.
4. DevOps writes the release-log entry (PR to `staging`).

## Roll back

- **App (Matthew):** `vercel rollback` (previous production deployment) or `vercel rollback <deployment-url>`; undo with `vercel promote <deployment-url>`. Or Vercel dashboard → Deployments → the previous production deployment → **Instant Rollback**.
- **Automatic:** the release workflow does `vercel rollback` itself when smoke fails, then fails the run.
- **Database:** no down-migrations. Migrations are expand/contract, so the previous app version still works on the new schema. Ship a forward-fix migration through the normal flow. Data loss → **Matthew:** Supabase point-in-time recovery (Dashboard → Database → Backups), after deciding the restore point. (Sandbox: staging shares this database, so a restore affects both.)

## Check health by hand

```
curl -s https://baseleap-devops-sandbox.vercel.app/api/health
node scripts/smoke.mjs https://baseleap-devops-sandbox.vercel.app [expected-commit]
```
Staging needs the bypass header: set `VERCEL_AUTOMATION_BYPASS_SECRET` in your shell first (never print it).

## Platform settings (not in code: verify each release)

Status column: **unverified** until Matthew has done `docs/ops/setup-for-matthew.md` and DevOps has read them back (read-only).

| Setting | Expected | Status |
|---|---|---|
| GitHub branch protection `main` | PR required; checks `verify`, `security`, `workflows` required; no force push; no bypass | unverified |
| GitHub environment `production` | required reviewer: Matthew; deployment branch `main` only; secrets `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`; variables `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `SUPABASE_PRODUCTION_REF` | unverified |
| GitHub environment `staging` | secret `VERCEL_AUTOMATION_BYPASS_SECRET`; variable `PRODUCTION_HOSTS` | unverified |
| GitHub repository variable | `PRODUCTION_URL` | unverified |
| GitHub Actions default token | read-only | unverified |
| Vercel deployment protection | Vercel Authentication on previews; Protection Bypass for Automation enabled | unverified |
| Vercel Git | production branch `main`; Git deploys of `main` disabled in `vercel.json` | unverified (`vercel.json` not yet on `main`) |
| Vercel env vars | match `infra/environments.json` (`node scripts/env-check.mjs --vercel`) | unverified |
| Supabase Auth URLs | Site URL = production; redirect URLs = production and staging | unverified |
| Supabase | no separate staging branch (sandbox exception); PITR per plan | n/a |

## Secrets and rotation (Matthew)

Full inventory: `docs/ops/secret-inventory.md`. Order for every rotation: create new → store everywhere → redeploy → verify → revoke old.

| Secret | Created in | Stored in | Rotation |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys | Vercel (production, preview; Sensitive) | new key → Vercel → redeploy (next release, or Vercel redeploy of staging) → verify sign-in → revoke old |
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens (team-scoped, 30 days) | GitHub `production` | new token → GitHub → run `env-check`/next release → delete old |
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens (30 days) | GitHub `production` | new token → GitHub → verify → revoke old |
| `SUPABASE_DB_PASSWORD` | Supabase → Project Settings → Database | GitHub `production` | reset → GitHub → verify the next migration dry run |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Vercel → Settings → Deployment Protection | GitHub `staging` | regenerate → GitHub → verify `qa-staging` |

## Incidents

1. Confirm (health/smoke, logs); note the start time.
2. If the last release caused it: **roll back first, investigate second** (see above).
3. Root cause from logs and the diff; fix through the normal flow (ticket → fix → QA → review → Gate 3). No hotfixes straight to `main`.
4. Add an entry below.

_None yet._

<!-- <date> · <what happened> · detected by <uptime / user / logs> · fixed by <rollback / fix PR> · follow-up <change> -->
