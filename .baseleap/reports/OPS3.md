# OPS3: CI fix loop (run 43982095442)

Branch `ops/pipeline`. Not pushed. No secrets or values were read or written.

## Findings

| # | Finding | Fix | Status |
|---|---|---|---|
| 1 | `uptime.yml:46` SC2016 | The `printf` format held a literal markdown fence inside single quotes, which shellcheck read as a command substitution. The fence is now `fence="\`\`\`"` and is passed to `printf` as `%s` arguments. The output is the same and no `shellcheck disable` is needed. | Fixed. Not confirmable locally (see Limits). |
| 2 | OSV gate blocks on dev-only findings | `ci.yml` `security` job: `osv-scanner ... --format json --output-file`, then an inline Node script judges the JSON. Policy is in `docs/ops/osv-policy.md`. Upgrade suggestions are in `docs/ops/dependency-findings.md`. | Fixed. Tested on the sample. |
| 3 | Node 20 deprecation | checkout v7.0.1, setup-node v7.1.0 and upload-artifact v7.0.2, pinned to the SHAs you supplied. `# vX.Y.Z` comments updated in all four workflows. | Done. |
| 4 | shellcheck in `install-scanners.sh` | The `shellcheck` tool is added. **The digest is a `PIN-ME` placeholder** and the installer refuses to run until it is filled in. | Partly done (see Limits). |

## OSV policy

- Blocks on Critical/High in packages that ship, and on Critical in dev-only packages.
- Dev vs shipped comes from OSV's `dependency_groups`. A package is dev only if the list is non-empty and every entry is `dev`. Anything else counts as shipped. No package names are hard-coded.
- Severity is the worst of the CVSS score (9+ Critical, 7+ High) and the advisory label, and unknown counts as High. uuid is labelled Moderate but scores 7.5, so it counts as High. That matches the 4 High you saw.
- osv-scanner exit 0 or 1 is judged from the JSON. Any other exit code, or an empty report, fails the job.
- The summary table has package, version, severity, advisory and fixed version. High dev findings also get a `::warning` annotation.

### Tests

The gate's script was extracted from `ci.yml` and run unchanged against `.baseleap/osv-sample.json` and four modified copies:

| Input | Result |
|---|---|
| Sample (8 dev-only findings, 4 High) | exit 0, 8 warnings in the table, no blocking |
| First package with its dev group removed (High ships) | exit 1 |
| lodash marked `dev` + `prod` (mixed group) | exit 1 |
| faker raised to CVSS 9.8 while still dev-only | exit 1 (dev Critical) |
| No results | exit 0 |

## `with:` inputs against the new majors

| Action | Inputs used | Assessment |
|---|---|---|
| checkout v7 | `persist-credentials`, `ref`, `fetch-depth` | Long-standing inputs, expected to be unchanged. |
| setup-node v7 | `node-version`, `cache: npm` | Expected unchanged. **Unsure:** newer setup-node majors enable automatic package-manager caching from the `packageManager` field. We set `cache` explicitly, so I expect no effect. |
| upload-artifact v7 | `name`, `path` (multi-line), `if-no-files-found`, `retention-days` | Expected unchanged since v4. |

These come from my knowledge of earlier majors, not the v7 docs. The first CI run on the new pins is the real check.

## Verification

- `actionlint` (v1.7.12) is clean on all four workflows. **This machine has no shellcheck**, so that run does not include the shell checks that found SC2016 on the runner.
- I reviewed the new `run:` blocks by hand for single-quoted `$`/backtick strings. The only other hit, `release.yml` `echo '```'`, passed on the runner.
- `docs/ops/pin-actions.md` has a new section 4 covering the shellcheck pin.

## Limits and open items

1. **shellcheck digest not pinned.** I had no network access in this step and don't guess digests. `SHELLCHECK_VERSION=0.11.0` is from memory, so confirm it is a real, current release. Fill in the digest with `docs/ops/pin-actions.md` §4. Until then `install-scanners.sh ... shellcheck` exits 3 with a clear message. CI doesn't request shellcheck, so it is unaffected.
2. **`--output-file` flag.** I believe it is correct for osv-scanner 2.x (pinned 2.7.1) but couldn't run the real scanner here. If the flag is wrong, the job fails at the "osv-scanner failed" guard rather than passing silently.
3. **Stray files.** My test run left four untracked files in the repo root: `dev-critical.json`, `empty.json`, `shipped-high.json`, `shipped-mixed.json`. They're not committed. Delete them (`rm` needed approval that this session couldn't give).
4. `.baseleap/osv-sample.json` is still untracked and was not committed.

## Commit

Owned paths only: `.github/workflows`, `scripts/install-scanners.sh`, `docs/ops`, `.baseleap/reports/OPS3.md`.
