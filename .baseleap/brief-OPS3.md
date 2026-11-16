# STEP OPS3 — fix loop: first CI run on `staging` failed two jobs (run 43982095442)

Agent: bl-devops · Skills: ops-ci, sec-supply-chain (read for policy only)

## Findings to fix
1. **`workflows` job:** actionlint on GitHub's runner (which has shellcheck) reports `.github/workflows/uptime.yml:46` — SC2016 "Expressions don't expand in single quotes, use double quotes" in the `run:` script (line 2 of that script). Fix the script so it's correct, not just silenced; only use a `# shellcheck disable=SC2016` comment if the single quotes are intentional, with a one-line reason.
2. **`security` job:** OSV-Scanner found 8 vulnerabilities (4 High), **all in dev-only packages** (`@faker-js/faker`, `fast-xml-parser`, `lodash`, `minimatch`, `uuid`, marked `(dev)`), none shipped to users. Change the gate's policy, in the workflow and in a short note in `docs/ops/`: **block** on any Critical/High in packages that ship (non-dev); **report** dev-only findings as warnings in the job summary (table with package, severity, fixed version) without blocking, unless Critical. Use OSV's JSON output to tell dev from non-dev; don't hard-code package names. Dependency upgrades are not yours (package.json belongs to the architect/backend): list the upgrade suggestions in `docs/ops/dependency-findings.md` for them.
3. **Node 20 deprecation:** bump the pinned actions to these verified releases (SHAs resolved by Claude from the GitHub API today):
   - actions/checkout v7.0.1 → `3d3c42e5aac5ba805825da76410c181273ba90b1`
   - actions/setup-node v7.1.0 → `949feb2413d6458794dcd2491c4babbbce0c15c1`
   - actions/upload-artifact v7.0.2 → `cf430e030ddbb5b0abf93d22962f4752f3646cd9`
   Keep the `# vX.Y.Z` comment next to each. These are major-version bumps: check every `with:` input you use still exists in that major (from your knowledge; flag anything you're unsure of in the report rather than guessing).
4. Add `shellcheck` to `scripts/install-scanners.sh` (pinned version, checksum-verified like the others) so a local actionlint run matches the runner's.

## Verify
`actionlint` locally (after installing shellcheck if you can't, say so), JSON valid, the OSV policy tested against `.baseleap/osv-sample.json` if present (otherwise describe the test). Commit on `ops/pipeline`. Don't push.

## Owned files
.github/workflows/** · scripts/install-scanners.sh · docs/ops/** · .baseleap/reports/OPS3.md

## Rules
Same as OPS2. Commit with one plain command per call: `git add <owned paths>`, then `git commit -m "STEP OPS3: CI fix loop"`.
