# STEP OPS6 — fix loop: release failed at deploy (run 44001232117), nothing deployed

Agent: bl-devops · Skills: ops-release

## Finding (verified by Claude from the run log)
`vercel deploy --prebuilt --prod --skip-domain --scope "$VERCEL_ORG_ID" --token=…` → `Error: Not able to load user because of unexpected error: User not found. (404)`.
Passing `--scope` makes the CLI look up the **user** behind the token, and a token scoped to one team can't read a user. The same lookup broke `vercel rollback` in attempt 1. The earlier successful release ran `vercel pull/build/deploy` **without** `--scope` (the project is linked from `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`), and the restore-point step's REST call with `?teamId=` works.

## Fix (release.yml)
1. `vercel pull` and `vercel deploy --prebuilt --prod --skip-domain`: **no `--scope`** (keep `--token`; linking comes from the env IDs, as in the release that passed). `--skip-domain` exists in CLI 65.16.0 (Claude checked `--help`).
2. **Promote and roll back through the Vercel REST API**, not the CLI, the same way the restore-point step reads metadata:
   - New deployment id: `GET https://api.vercel.com/v13/deployments/<deployment host>?teamId=$VERCEL_ORG_ID` → `.id` (validate `^dpl_[A-Za-z0-9]+$`).
   - Promote: `POST https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/promote/<deploymentId>?teamId=$VERCEL_ORG_ID` (Bearer token, empty body, success = 2xx; the documented response is `{}`).
   - Rollback = the same promote call with the **recorded restore id** (`steps.restore.outputs.id`).
   - curl with `--fail-with-body --max-time 60`; never print the token; on non-2xx, print the status and body (no secrets in it) and fail.
3. After promote or rollback, the live address can take a few seconds to switch: make sure the smoke check retries (it already retries health; confirm and say how long).
4. Remove the now-unused `--scope` notes from the header. Keep the "flags verified" line accurate.
5. Add this attempt to `docs/ops/pipeline-drills.md` (rollback drill, attempt 2: failed safely at deploy; cause and fix).

## Verify
`PATH=$HOME/.local/bin:$PATH actionlint` clean. Commit on `ops/pipeline`. Don't push.

## Owned files
.github/workflows/release.yml · docs/ops/** · docs/runbook.md · .baseleap/reports/OPS6.md

## Rules
Same as OPS5. No network. One plain command per call: `git add <owned paths>`, then `git commit -m "STEP OPS6: promote/rollback via REST"`.
