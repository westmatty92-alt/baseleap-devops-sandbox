# STEP OPS8 — staging gets its own database: apply migrations to it automatically

Agent: bl-devops · Skills: ops-ci, ops-environments, ops-release (§3)

## Why
Until now the sandbox's staging and production shared one Supabase project (sandboxException in `infra/environments.json`).
Matthew created a separate staging project (free org `baseleap-sandbox-free`, ca-central-1), like every real client gets.
Gap found: the kit applies migrations only to production, at release. A separate staging database would never receive them.

## Build
1. `.github/workflows/staging-migrations.yml`:
   - on `push` to `staging` when `supabase/migrations/**` changes, and `workflow_dispatch`;
   - job uses the `staging` environment; permissions `contents: read` only;
   - env from the staging environment: `SUPABASE_ACCESS_TOKEN` (secret; a token limited to the staging org),
     `SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_STAGING_DB_PASSWORD }}`, `SUPABASE_PROJECT_REF: ${{ vars.SUPABASE_STAGING_REF }}`;
   - guard: refuse (exit 1) if the ref is empty or equals the production ref. The production ref isn't readable from the
     staging environment, so add a repository variable check: refuse if it equals `vars.SUPABASE_PRODUCTION_REF_PUBLIC`
     when set, and always refuse if `PRODUCTION_HOSTS` contains the ref (belt and braces). Say which you chose and why.
   - `npx --no-install supabase link --project-ref "$SUPABASE_PROJECT_REF"`, then
     `npx --no-install supabase db push --remote="$SUPABASE_PROJECT_REF" --dry-run` (tee to the job summary), then the same with `--yes`;
   - pinned actions exactly as in the other workflows; passes `scripts/workflow-policy.mjs` (add it to the allow-list only if it needs a write scope — it shouldn't).
2. `infra/environments.json`: staging now has its own project (ref filled by Claude from Matthew; leave `"<staging ref>"` if you don't have it), remove the `sandboxException` for staging, keep it for the lane previews only if they still share; document that the api-tests CI job can run against staging now.
3. `docs/ops/`: a short note — how staging gets its schema (this workflow), and that the first run on an empty project applies all migrations in order.
4. Record the change in `docs/ops/pipeline-drills.md` → Planted breaks/notes table ("staging database split, 2026-11-18").

## Verify
`node scripts/workflow-policy.mjs` and its tests pass; `PATH=$HOME/.local/bin:$PATH actionlint` clean. Commit on `ops/pipeline`
(`git add <owned paths>`, then `git commit -m "STEP OPS8: staging migrations"`), one plain command per call. Don't push.

## Owned files
.github/workflows/** · infra/environments.json · docs/ops/** · .baseleap/reports/OPS8.md
