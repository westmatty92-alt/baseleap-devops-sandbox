# OPS4 — qa-staging trigger fix

- Cause: Vercel sets `deployment.ref` to the commit SHA, so `ref == 'staging'` never matched; the job was always skipped.
- Fix: new `gate` job (contents: read, `GH_TOKEN` = github.token) runs on `deployment_status` success + `environment == 'Preview'`, compares `deployment.sha` with the head of `staging` (`gh api branches/staging`), outputs `staging`. `smoke` `needs: gate` and runs only if true. Non-staging deploys write a summary line and end green.
- Kept: host allow-list, PRODUCTION_HOSTS refusal, bypass-secret presence check, pinned actions, `environment: staging` (now only on smoke).
- Concurrency moved to the smoke job so skipped lane deploys can't cancel a staging run.
- Note added: docs/ops/vercel-deployment-events.md.
- Verify: actionlint clean. Not pushed. Still only active once on main (deployment_status runs from the default branch).
