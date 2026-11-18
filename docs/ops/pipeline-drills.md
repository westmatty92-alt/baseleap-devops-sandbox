# Pipeline drills for baseleap-devops-sandbox

Kept by bl-devops from `ops-release/templates/pipeline-drills.md`. One row per attempt; failures stay with their fix.
Sandbox: public practice repo, one Supabase project (ca-central-1), Vercel team `baseleap` (yul1). Matthew approves every production step.

## Summary

| Drill | Status | Last attempt | Evidence |
|---|---|---|---|
| 1. Checks on staging (verify, security, workflows) | ✅ pass | 2026-11-17 | run 43984109262 |
| 2. Staging tests start by themselves and pass | ✅ pass | 2026-11-17 | run 43988760997 (health `dd94905`, /sign-in 200, /offline 200 through the bypass) |
| 3. Release | ✅ pass | 2026-11-18 | run 44219627968 (new promote flow, `7db3098`); first pass run 43993698910: approval → dry run listed 4 migrations → applied → deploy → health `cadc497`, served from yul1 |
| 4. Rollback | ✅ pass | 2026-11-18 | run 44213878230: restore point `cadc497` recorded, broken `b973d3c` promoted, live check failed, recorded deployment promoted back automatically, health `cadc497` ok |
| 5. Expand/contract | ☐ | | |
| 6. Uptime alert | ✅ pass | 2026-11-18 | runs 44220381934 (down → issue #7), second run commented (no duplicate), restored → #7 closed |
| 7. Guardrails | ✅ pass | 2026-11-18 | 15/15 production commands refused by the prod-guard hook (attempt 1: 3 got through; fixed in the kit) |

## Attempts

| Date | Drill | Version | Result | What happened | Fix (where it went) |
|---|---|---|---|---|---|
| 2026-11-17 | 4 Rollback | OPS6 fix | ⏳ attempt pending re-run | `release.yml`: `vercel pull`/`deploy --prebuilt --prod --skip-domain` run with `--token` only (no `--scope`); the new deployment id is read with `GET /v13/deployments/<host>?teamId=`, then promoted with `POST /v10/projects/<project>/promote/<id>?teamId=`. Rollback is the same promote call with the recorded restore id. curl uses `--fail-with-body --max-time 60`; status and body are printed on failure, never the token. Smoke retries health every 5 s for up to 120 s, which covers the domain switch. actionlint clean. | OPS6 (sandbox `release.yml`, runbook). Re-run the drill with the planted break. |
| 2026-11-17 | 4 Rollback | OPS5 fix (run 44001232117, attempt 2) | ❌ safe | Failed at deploy, nothing deployed: `vercel deploy --scope` → `Error: Not able to load user because of unexpected error: User not found. (404)`. `--scope` makes the CLI look up the user behind the token, which a team-scoped token can't read (the same lookup broke `vercel rollback` in attempt 1). The earlier passing release used no `--scope`; the restore-point REST call with `?teamId=` works. | OPS6: no `--scope`; promote and rollback via REST (above). |
| 2026-11-17 | 4 Rollback | OPS5 fix | superseded | `release.yml` now records the live production deployment before anything changes (fails the release if it can't), deploys with `--skip-domain`, promotes explicitly, and rolls back to the recorded deployment with `--scope`/`--token` (falls back to `vercel promote <recorded>`). Post-rollback smoke must report the previous commit. actionlint + shellcheck clean. Unverified until the drill: `--skip-domain` on CLI 65.x, `vercel rollback` targeting a non-previous deployment. | OPS5 (sandbox `release.yml`, runbook). Re-run the drill with the planted break. |
| 2026-11-18 | 7 Guardrails | kit 426a281 | ✅ | Same 15 commands, fake tools: all refused, nothing reached a tool. | n/a |
| 2026-11-18 | 7 Guardrails | kit 0cae6ef | ❌ | Fake tools logged 3 that got through the prefix deny rules: `vercel deploy --prebuilt --prod`, `npx --no-install supabase db push --remote=…`, `gh workflow run release.yml`. | Kit: prod-guard hook judges what a command does (`scripts/lib/command-guard.mjs`, 49 tests). |
| 2026-11-18 | 6 Uptime | 7db3098 | ✅ | PRODUCTION_URL pointed at a protected address: issue #7 opened; second run added a comment; real address restored: #7 closed. Each failing check takes about 2 minutes (smoke retries). | n/a |
| 2026-11-18 | 3 Release | 7db3098 | ✅ | Planted break reverted. Restore point `cadc497` recorded, deployed, promoted via REST, live check passed on `7db3098`. | n/a |
| 2026-11-18 | 4 Rollback | b973d3c | ✅ | Restore point recorded (`dpl_13go…`, `cadc497`); deploy with `--skip-domain`; promoted via REST; live check failed as planted; rollback = REST promote of the recorded id; post-rollback smoke on `cadc497` passed. No click from Matthew beyond the approval. | n/a |
| 2026-11-17 | 4 Rollback | 0bfafef | ❌ safe | Deploy failed before upload: `--scope` makes the CLI look up the token's user, which a team-scoped token can't read (`User not found`). Nothing deployed. | OPS6: no `--scope`; promote and rollback through `POST /v10/projects/{id}/promote/{deploymentId}?teamId` (sandbox + kit). |
| 2026-11-17 | 4 Rollback | manual | ✅ restored | Matthew used Vercel → Deployments → `cadc497` → Instant Rollback. Health back to `cadc497` ok. Note: after an Instant Rollback, Vercel stops auto-assigning the production domain to new deploys until one is promoted. | Release must promote explicitly (OPS5). |
| 2026-11-17 | 4 Rollback | ed77171 | ❌ | Planted production-only "degraded" health. Smoke failed as intended; `vercel rollback --token` → `Error: User not found. (404)`. The team-scoped token was used without naming the team, so the CLI looked in the personal account. Production served the broken version until Matthew restored `cadc497` from the Vercel dashboard. | Pending: rollback names the team (`--scope`) and the exact deployment to restore (sandbox + kit `release.yml`). Re-run the drill. |
| 2026-11-17 | 3 Release | cadc497 | ✅ | Approved by Matthew; dry run listed 4 migrations, applied; prebuilt deploy; health reported `cadc497`. | n/a |
| 2026-11-17 | 3 Release | ce08781 (attempt 3) | ❌ safe | Migrations dry run targeted a local database (Supabase CLI 3 `db push` is local by default). Nothing applied. | `--remote="$SUPABASE_PROJECT_REF"` on both commands (sandbox + kit template); CLIs no longer installed at "latest" (kit). |
| 2026-11-17 | 3 Release | ce08781 (attempt 2) | ❌ safe | Drift check: three Supabase variables Production-only in Vercel. | Matthew ticked Preview (all branches). Setup checklist updated (kit). |
| 2026-11-17 | 3 Release | ce08781 (attempt 1) | ❌ safe | Drift check: Preview variables missing; `SITE_URL` Preview limited to `staging`. Re-runs reused the first approval (same commit). | `SITE_URL` Preview → all preview branches. Lesson logged: approvals belong to the Console, per commit. |
| 2026-11-17 | 2 Staging tests | dd94905 | ✅ | Started by Vercel's deployment event; smoke passed. | n/a |
| 2026-11-17 | 2 Staging tests | 41be3e3 | ❌ silent skip | Vercel's deployment `ref` is the commit SHA, so `deployment.ref == 'staging'` never matched. | OPS4: gate job compares `deployment.sha` with the staging head (sandbox + kit template). |
| 2026-11-17 | 2 Staging tests | 62dd71e | ❌ never ran | No deployment events reached GitHub. | Matthew turned on Vercel → Git → deployment_status Events (setup checklist, kit). |
| 2026-11-17 | 1 Checks | 62dd71e | ✅ | All three checks green. | n/a |
| 2026-11-16 | 1 Checks | 7f56b47 | ❌ | SC2016 in uptime.yml (runner's shellcheck); OSV blocked on 8 dev-only advisories; Node 20 action runtime deprecated. | OPS3: fence fix, OSV dev/shipped policy, v7 action pins, shellcheck pinned in the installer (sandbox + kit). |

## Planted breaks (must be reverted)

| Drill | Change | Reverted in |
|---|---|---|
| 4 Rollback | `src/app/api/health/route.ts`: production-only `degraded` 503 (commit on `ed77171`) | reverted after attempt 3 passed (2026-11-18) |
