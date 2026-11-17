# STEP OPS4 — fix loop: qa-staging never runs (run 43986927753 skipped)

Agent: bl-devops · Skill: ops-ci

## Finding (verified by Claude from the GitHub API)
`qa-staging.yml` job condition: `github.event.deployment.ref == 'staging'`. Vercel creates the GitHub deployment with **`ref` = the commit SHA** (e.g. `41be3e3f…`), `environment` = `Preview`, `task` = `deploy`. So the condition is always false and the job is skipped on every staging deploy. Vercel posts `deployment_status` events now (pending, then success with `environment_url` = the unique deployment URL `https://<project>-<hash>-<team>.vercel.app`).

## Fix
1. Run on `deployment_status.state == 'success'` and `deployment.environment == 'Preview'`.
2. First step decides whether this deployment is **staging**: it is when `deployment.sha` equals the current head of the `staging` branch (`gh api repos/${{ github.repository }}/branches/staging --jq .commit.sha`, with `GH_TOKEN: ${{ github.token }}`; read-only, `contents: read` is enough). Lane and other preview deploys: write one line to the job summary ("not staging, skipped") and stop the remaining steps cleanly (step output + `if:` on later steps, or a separate gating job the test job `needs:`). Don't fail them.
3. Keep every existing safety check (host allow-list, PRODUCTION_HOSTS refusal, bypass-secret presence).
4. Note the Vercel fact in `docs/ops/` (one short paragraph) so nobody re-adds `deployment.ref == 'staging'`.

## Verify
`actionlint` (shellcheck is installed at ~/.local/bin; run with that on PATH) clean. Commit on `ops/pipeline`. Don't push.

## Owned files
.github/workflows/qa-staging.yml · docs/ops/** · .baseleap/reports/OPS4.md

## Rules
Same as OPS3. Commit with one plain command per call: `git add <owned paths>`, then `git commit -m "STEP OPS4: qa-staging trigger fix"`.
