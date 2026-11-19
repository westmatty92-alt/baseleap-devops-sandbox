# OPS7: workflow policy check

**Added:** `scripts/workflow-policy.mjs`, run by the `workflows` job in `ci.yml` after actionlint (with a pinned `setup-node` step so the Node version is known). The job also runs `node --test tests/workflow-policy.test.mjs`.

**YAML reader:** a small one is built into the script. No YAML parser is declared in `package.json` (`yaml` is only a transitive dependency, so it is not relied on). Anything the reader cannot parse is reported as a violation.

**Rules (each violation prints file, job and scope or expression):**
- `pull_request_target` / `workflow_run` triggers fail unless the file starts with `# policy-exception: <reason>`. That waives this rule only.
- `permissions: write-all` fails anywhere. Workflow-level permissions must be exactly `contents: read` or `{}`; a missing block also fails.
- Job-level write scopes are checked against an allow-list in the script: `release.yml` → `deployments`, `id-token`; `uptime.yml` → `issues`; everything else is read-only.
- `secrets: inherit` fails.
- `${{ github.event.* }}` inside `run:` fails. Allowed: `github.event.deployment.sha`, `.deployment.environment`, `github.event.deployment_status.state`.
- Beyond the brief: `github.head_ref` (same injection class) and `script:` (github-script) are covered by the same check. Say if you want either dropped.

**Our own workflows:** one violation. `uptime.yml` granted `issues: write` at workflow level. I moved it to the `check` job and left the workflow level at `contents: read`. The policy is unchanged. The other three workflows already passed.

**Tests:** `tests/workflow-policy.test.mjs` runs on `node:test`, 15 cases. Today's workflows pass. Fixtures in `tests/fixtures/workflows/` cover each violation, the exception comment, the allow-list (including per-file scoping) and the allowed event fields. vitest's `include` list does not cover `.mjs` files here, and `vitest.config.ts` is not an owned file, so CI calls `node --test` directly.

**Verify (run locally):** `node scripts/workflow-policy.mjs` exits 0 on the four workflows; 15/15 tests pass; `actionlint` is clean. Not run: CI itself, because nothing was pushed. `ubuntu-24.04` has not been confirmed to have the Node version this needs, hence `setup-node`.
