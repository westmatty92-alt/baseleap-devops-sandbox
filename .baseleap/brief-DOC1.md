# STEP DOC1 — SOPs for the release pipeline (verify phase)

Agent: bl-docs · Skills: docs-sop, docs-evidence

Write the SOPs listed in `docs/sops/plan.md`, from what was actually built and tested in this repo. Evidence lives in:
`.github/workflows/` (release.yml, uptime.yml, qa-staging.yml, ci.yml), `docs/ops/` (pipeline-drills.md, runbook,
vercel-deployment-events.md, setup guide), `docs/runbook.md`, and `.baseleap/reports/OPS*.md`.
The reader is Matthew, a non-developer, who approves releases in GitHub and restores production from the Vercel dashboard if needed.

Deliver: one file per procedure under `docs/sops/2-operator/`, `docs/sops/evidence.md`, `docs/sops/changelog.md`,
and your report `.baseleap/reports/DOC1.md` (what you wrote, from which evidence, anything unverified or left out and why).
Check with `node scripts/sop-check.mjs docs/sops` (must exit 0). Don't publish anywhere. Don't commit.

Owned files: docs/sops/** · .baseleap/reports/DOC1.md
