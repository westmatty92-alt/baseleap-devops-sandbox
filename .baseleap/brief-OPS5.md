# STEP OPS5 — fix loop: automatic rollback failed (run 43998539571)

Agent: bl-devops · Skills: ops-release, ops-ci

## Findings (verified by Claude)
1. `vercel rollback --token="$VERCEL_TOKEN"` → `Error: User not found. (404)` after "Retrieving project…". The token is scoped to the team only (by design), and the command names neither the team nor the project, so the CLI fell back to the personal account. `vercel pull/build/deploy` worked because they run after `vercel pull` links the project with `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`.
2. `vercel rollback` with no argument means "whatever was before". The release must restore a **known** deployment: the production deployment that was live **before** this release.
3. Matthew restored production by hand with **Instant Rollback** in the dashboard. After an instant rollback, Vercel stops auto-assigning the production domains to new production deployments until a deployment is promoted. So `vercel deploy --prod` alone may leave the old version live, and the smoke check would fail on a good release.

## Fix (release.yml)
1. **Before deploying**, record the current production deployment (its URL or id) as a step output. Use the CLI with explicit `--scope "$VERCEL_ORG_ID"` (e.g. inspecting `$PRODUCTION_URL`), or the Vercel REST API with `teamId`, reading only deployment metadata, never env values. Fail the job **before** deploying if it can't be found: no restore point means no release.
2. **Deploy without auto-promotion, then promote explicitly**: build the prebuilt output, deploy it (`--prod` with `--skip-domain` if your CLI version supports it, otherwise a normal deploy), then `vercel promote <new deployment> --scope "$VERCEL_ORG_ID" --yes`. This works whether or not auto-assignment is currently off. Mark which flags you're sure exist in CLI 65.x and which you're not; don't guess silently.
3. **Rollback**: `vercel rollback <recorded deployment> --scope "$VERCEL_ORG_ID" --yes` (or `vercel promote <recorded>` if rollback can't target it). Then the informational smoke check must confirm production reports the **previous** commit's version.
4. Every `vercel` call passes `--scope "$VERCEL_ORG_ID"` and `--token`.
5. Summary lists: the restore point, the new deployment, whether it was promoted, and whether the rollback restored the recorded deployment.
6. Update `docs/runbook.md` → manual rollback: Vercel dashboard → Deployments → the last good production deployment → Instant Rollback; then the next release promotes explicitly.

## Verify
`actionlint` with shellcheck (`PATH=$HOME/.local/bin:$PATH`). Then **record the drill row** for this fix in `docs/ops/pipeline-drills.md` (attempt pending re-run). Commit on `ops/pipeline`. Don't push.

## Owned files
.github/workflows/release.yml · docs/runbook.md · docs/ops/** · .baseleap/reports/OPS5.md

## Rules
Same as OPS3/OPS4. No network. One plain command per call: `git add <owned paths>`, then `git commit -m "STEP OPS5: rollback fix"`.
