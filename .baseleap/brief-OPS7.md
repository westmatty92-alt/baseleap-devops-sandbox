# STEP OPS7 — workflow policy check (guardrails DoD item)

Agent: bl-devops · Skill: ops-ci

## Finding (Claude)
CI's `workflows` job runs actionlint and the pin check only. It does **not** fail on:
- a workflow triggered by `pull_request_target` (or `workflow_run`) that checks out or runs code from the PR;
- `permissions: write-all`, or a job/workflow granting write scopes outside an allow-list.
The guardrails DoD requires CI to fail on both.

## Build
1. `scripts/workflow-policy.mjs` (Node, no dependencies; a small YAML reader is fine since our workflows are simple, or reuse a YAML parser already in devDependencies if there is one: say which). For every file in `.github/workflows/`:
   - **fail** on `pull_request_target` or `workflow_run` triggers, unless the file has a top comment `# policy-exception: <reason>` (none exist today);
   - **fail** on `permissions: write-all` anywhere, or `permissions` at workflow level other than `contents: read` (or `{}`);
   - job-level write scopes allowed only from an allow-list kept in the script: `release.yml` → `deployments: write`, `id-token: write` if used; `uptime.yml` → `issues: write`; everything else read-only. Print the file, job and scope for each violation;
   - **fail** on `secrets: inherit` and on `${{ github.event.* }}` used directly inside `run:` (script injection), except `github.event.deployment.sha`/`.environment` and `deployment_status.state` (read via `env:`, as qa-staging does).
2. Call it from the `workflows` job in `ci.yml` after actionlint.
3. Tests: `tests/workflow-policy.test.mjs` (or the repo's test runner): today's four workflows pass; fixtures for each violation fail with a clear message.
4. Run it on today's workflows: if any of our own files violates the policy, fix the workflow (owned), not the policy; report what you changed.

## Verify
`node scripts/workflow-policy.mjs` exits 0 on our workflows; the tests pass; `PATH=$HOME/.local/bin:$PATH actionlint` clean. Commit on `ops/pipeline`: `git add <owned paths>`, then `git commit -m "STEP OPS7: workflow policy check"`. Don't push.

## Owned files
.github/workflows/** · scripts/workflow-policy.mjs · tests/workflow-policy.test.mjs · tests/fixtures/workflows/** · docs/ops/** · .baseleap/reports/OPS7.md
