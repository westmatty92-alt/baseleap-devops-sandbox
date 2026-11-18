# Staging database and its migrations

Staging has its own Supabase project (org `baseleap-sandbox-free`, ca-central-1). Production's project is separate.

**How staging gets its schema:** `.github/workflows/staging-migrations.yml` runs on every push to `staging` that changes
`supabase/migrations/**` (and on manual `workflow_dispatch`). It links the staging project, shows a dry run of the
pending migrations in the job summary, then applies them. Production still receives migrations only from `release.yml`,
after Gate 3.

**First run on an empty project** applies every migration in `supabase/migrations/` in order. Run it once with
`workflow_dispatch` after Matthew sets the settings below.

**Settings (GitHub `staging` environment):** secrets `SUPABASE_ACCESS_TOKEN` (limited to the staging org),
`SUPABASE_STAGING_DB_PASSWORD`; variable `SUPABASE_STAGING_REF`. Optional repository variable
`SUPABASE_PRODUCTION_REF_PUBLIC` (the production ref; an identifier, not a secret).

**Guard:** the job exits 1 if the staging ref is empty, equals `SUPABASE_PRODUCTION_REF_PUBLIC` (when set), or appears in
`PRODUCTION_HOSTS`. Why both: the production ref isn't readable from the staging environment, so the public variable is the
only direct comparison; the `PRODUCTION_HOSTS` substring check still works if that variable was never set. The staging-only
token is the real boundary: it can't reach the production project even if the guard fails.

**Also needed:** the Vercel Preview variables for the `staging` branch (`NEXT_PUBLIC_SUPABASE_URL`, anon key, service
role key) must point at the staging project. The api-tests CI job can now run against staging.
