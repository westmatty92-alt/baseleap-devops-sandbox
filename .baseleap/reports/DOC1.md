# DOC1: SOPs for the release pipeline

## Written (all kind 2, operator; nothing published, nothing committed)
| SOP | Main evidence |
|---|---|
| `docs/sops/2-operator/approve-a-release.md` | `release.yml`, `docs/runbook.md`, `docs/ops/setup-for-matthew.md` 3.3, drills 3 and 4 |
| `docs/sops/2-operator/restore-production.md` | manual rollback row in `pipeline-drills.md` (2026-11-17), `release.yml` summary and rollback, runbook "Roll back" |
| `docs/sops/2-operator/pause-uptime-monitor.md` | `uptime.yml`, drill 6, OPS2 report |

Also: `docs/sops/evidence.md` (step → evidence per SOP) and `docs/sops/changelog.md`.
`node scripts/sop-check.mjs docs/sops`: 3 SOPs, 0 errors, 3 unverified-step warnings.

## Unverified (3 steps, all in pause-uptime-monitor)
- **Disable workflow**, its confirmation, and **Enable workflow**. The repo has no evidence that the uptime workflow was ever paused, and no mention of those button names. Marked `⚠ unverified`. To verify: pause and resume `uptime` once in the sandbox and record the exact labels. The SOP warns against pausing by changing `PRODUCTION_URL` (this opens a false outage issue).
- The **Run workflow** button name is also not in the evidence (the workflow allows manual runs). Written as conditional.

## Other gaps in the evidence
- Restore: the exact position of **Instant Rollback** in the Vercel menu and any confirm box are not documented. Only the path "Deployments → deployment → Instant Rollback" is. The SOP says to confirm if a box appears and to stop if the screen differs.
- Approve: the approval was done in drills, but no screenshots exist. Button names come from the runbook and setup guide.
- Platform settings in the runbook (environment reviewer, branch protection) are all still listed "unverified" by devops. The approve SOP depends on the `production` reviewer setting being in place.
- Direct links: only the production health URL, the repo's Actions page and the `uptime.yml` workflow page are linked. No Vercel deployments URL is given in evidence, so none is written.

## Plan vs. build
All three planned procedures were written as planned. None was cut or changed. `templates/sop.md` is at `.claude/skills/docs-sop/templates/sop.md`, not `templates/sop.md`.

## Findings for the orchestrator
- Runbook platform settings table is still all "unverified".
- The release Summary tells the operator to use Instant Rollback, but if the automatic rollback fails the operator cannot tell which deployment is "last good" except by commit. Consider adding the Vercel deployment URL of the restore point to the Summary (it already prints `RESTORE_URL`).
- There is no alert if the uptime monitor itself is disabled or forgotten.

DOC1 done.
