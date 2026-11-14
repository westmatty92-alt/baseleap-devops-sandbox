STEP: A2

## Task
Scaffold the Northside Plumbing Tech Job Board repo on top of the locked A1 blueprint (docs/architecture.md, docs/openapi.yaml, supabase/migrations, supabase/tests). Follow arch-structure: Next.js App Router + TypeScript strict, Tailwind v4 reading src/app/theme.css, Supabase SSR client helpers, generated types, Orval client + Zod + MSW mocks, a health route, a placeholder page per lane, the npm scripts in arch-structure §2.3, and the Supabase CLI as a dev dependency.

## Dry-run setup (read carefully)
- There is no Supabase preview branch. A throwaway local Supabase Postgres stands in for it. `SUPABASE_PREVIEW_DB_URL` is already set in your environment; use only the variable name in files.
- `gen:types` must generate `src/types/database.ts` from that database (`supabase gen types typescript --db-url "$SUPABASE_PREVIEW_DB_URL"`) after `db:test` has applied the migrations, or from the migrations another way. Say which in your report.
- Never run `supabase db push`, `supabase link`, `supabase start` or anything against a remote project. Never touch any other Docker container.
- If a blueprint migration or RLS test fails on the real database, you may fix it in supabase/** (it's yours), and you must list every such fix in the report as a blueprint correction for Gate 2.

## Acceptance criteria (each independently checked, in this order, on a clean checkout)
1. `npm ci` exits 0
2. `npm run gen:types` exits 0
3. `npm run typecheck` exits 0
4. `npm run lint` exits 0
5. `npm run build` exits 0
6. `npm run db:test` exits 0 (migrations applied + all pgTAP files pass)
7. `node scripts/check-mock.mjs` exits 0
8. `node scripts/check-architecture.mjs` still exits 0

## Out of scope
Feature code (the build lanes write it), auth flows beyond the client helpers, deployment.

## Context packet
docs/architecture.md (Lane ownership, Environment variables) · docs/openapi.yaml · supabase/** · src/app/theme.css · docs/design-specs.md (screen list only) · .baseleap/reports/A1.md (notes for A2)

## You own these files (edit nothing else)
package.json · package-lock.json · tsconfig.json · next.config.* · eslint.config.* · vitest.config.* · postcss.config.* · orval.config.ts · components.json · src/** (except src/app/theme.css) · public/** · supabase/** · .gitignore · .env.example · .baseleap/reports/A2.md

## Report back (≤15 lines)
Write the full report to .baseleap/reports/A2.md (every acceptance command with its result, blueprint corrections, anything the build lanes must know) and return only its summary. Commit your files as "STEP A2: <title>".
