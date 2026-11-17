# Pipeline drills for baseleap-devops-sandbox

Kept by bl-devops from `ops-release/templates/pipeline-drills.md`. One row per attempt; failures stay with their fix.
Sandbox: public practice repo, one Supabase project (ca-central-1), Vercel team `baseleap` (yul1). Matthew approves every production step.

## Summary

| Drill | Status | Last attempt | Evidence |
|---|---|---|---|
| 1. Checks on staging (verify, security, workflows) | ✅ pass | 2026-11-17 | run 43984109262 |
| 2. Staging tests start by themselves and pass | ✅ pass | 2026-11-17 | run 43988760997 (health `dd94905`, /sign-in 200, /offline 200 through the bypass) |
| 3. Release | ✅ pass | 2026-11-17 | run 43993698910: approval → dry run listed 4 migrations → applied → deploy → health `cadc497`, served from yul1 |
| 4. Rollback | ❌ failing | 2026-11-17 | run 43998539571: live check failed correctly, `vercel rollback` errored, production left on the broken version |
| 5. Expand/contract | ☐ | | |
| 6. Uptime alert | ☐ | | |
| 7. Guardrails | ☐ | | |

## Attempts

| Date | Drill | Version | Result | What happened | Fix (where it went) |
|---|---|---|---|---|---|
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
| 4 Rollback | `src/app/api/health/route.ts`: production-only `degraded` 503 (commit on `ed77171`) | pending (after the rollback fix passes) |
