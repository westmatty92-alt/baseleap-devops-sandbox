# OPS5 — rollback fix (run 43998539571)

- Cause: `vercel rollback --token` named neither team nor project, so the team-scoped token fell back to the personal account (`User not found`, 404). It also meant "whatever was before", not a known deployment. After a dashboard Instant Rollback, Vercel stops auto-assigning domains, so `deploy --prod` alone could leave the old version live.
- `release.yml`:
  - New step **Record the restore point** (before migrations and deploy): Vercel REST `GET /v13/deployments/<production host>?teamId=$VERCEL_ORG_ID`, metadata only. Outputs id, url, commit sha, all validated by regex. Fails the job if absent: no restore point, no release.
  - Deploy: `vercel deploy --prebuilt --prod --skip-domain`, then new step **Promote** (`vercel promote <new> --yes`).
  - Rollback: `vercel rollback <recorded url>`, falling back to `vercel promote <recorded>`. Runs when promote or smoke fails.
  - Post-rollback smoke now expects the recorded (previous) commit; paths only, with a warning, if the restore point has no commit metadata.
  - Every `vercel` call passes `--scope "$VERCEL_ORG_ID"` and `--token` (the sandboxed build step has no token by design and only reads pulled settings).
  - Summary lists restore point, new deployment, promoted, smoke, rollback result, post-rollback smoke.
- CLI 65.x confidence: sure — `--scope`, `--token`, `--prebuilt`, `--prod`, `promote <url>`, `rollback <url>`. Fairly sure — `deploy --skip-domain`. Not sure — `rollback --yes` (omitted), `rollback` to a non-previous deployment (promote fallback covers it), `promote --yes`. All to be proven by the re-run drill.
- Runbook: manual rollback is now dashboard → Deployments → last good production deployment → Instant Rollback; the next release promotes explicitly.
- Drill row added (attempt pending re-run). Planted break stays until the drill passes.
- Verify: actionlint (with shellcheck) clean. Not pushed.
