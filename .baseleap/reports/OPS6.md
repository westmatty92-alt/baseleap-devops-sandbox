# OPS6: promote/rollback via REST

**Cause (run 44001232117):** `vercel deploy --scope` makes the CLI look up the user behind the token. A team-scoped token can't read a user, so it returned 404. Nothing was deployed. The same lookup broke `vercel rollback` in attempt 1.

**Changes (`release.yml`):**
- `vercel pull` and `vercel deploy --prebuilt --prod --skip-domain` now pass `--token` only. There is no `--scope`; linking comes from `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`.
- Promote is done through the REST API:
  1. `GET /v13/deployments/<host>?teamId=` returns the new deployment id, validated against `^dpl_[A-Za-z0-9]+$`.
  2. `POST /v10/projects/<project>/promote/<id>?teamId=` promotes it.
- Rollback is the same POST with `steps.restore.outputs.id`. The id is validated first.
- All curl calls use `--fail-with-body --max-time 60`. On failure they print the status and body, never the token.
- The header's `--scope` notes are gone. The "flags verified" line now lists only `--token`, `deploy --prebuilt --prod --skip-domain` and the REST endpoints.
- The deploy URL and ids reach the shell only through `env:`, not inline in `run:`.

**Smoke retry:** `scripts/smoke.mjs` polls `/api/health` every 5 s for up to 120 s, until it returns status ok and the expected commit. The other paths are checked after health passes. That covers the domain switch after a promote or rollback.

**Docs:** the runbook and the `docs/ops/pipeline-drills.md` attempt rows are updated. Attempt 2 is logged as failed safely at deploy, with cause and fix. The OPS5 row is marked superseded. The drill row stays pending a re-run.

**Verify:** actionlint is clean. Not run: any network call or the live drill. The promote response shape and the rollback via a promote call are unverified until the drill.
