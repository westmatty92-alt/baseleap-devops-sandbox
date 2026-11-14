STEP: A1

## Task
Write the blueprint for the Northside Plumbing Tech Job Board: decision records, architecture.md, SECURITY_MODEL.md, Supabase SQL migrations with RLS plus RLS tests, docs/openapi.yaml, and — because the PRD's build_mode is hybrid — docs/integration-contract.md.

## Behaviour required
- Read build_mode, system of record and platform roles from the PRD first.
- Derive tables from the screens' data needs in docs/user-flows.md and the stories, not the other way round.
- This is a dry run: there is no Supabase branch and no package.json yet. Don't create either. Don't run npm install or any network install beyond the two verify commands.

## Acceptance criteria (each independently checked)
1. `node scripts/check-architecture.mjs` exits 0.
2. `npx --yes @redocly/cli lint docs/openapi.yaml` exits 0.

## Out of scope
The repo scaffold (A2), feature code, creating any cloud resource.

## Context packet
docs/PRD.md · docs/user-stories.md · docs/metrics-spec.md · docs/user-flows.md · docs/design-specs.md · DESIGN.md · .baseleap/inputs/client-research.md · .baseleap/inputs/discovery-answers.md

## You own these files (edit nothing else)
docs/decisions/** · docs/architecture.md · docs/SECURITY_MODEL.md · docs/openapi.yaml · docs/integration-contract.md · supabase/migrations/** · supabase/tests/** · .baseleap/reports/A1.md

## Report back (≤15 lines)
Write the full report (key queries → indexes, decisions, costs, spike requests, Gate 2 summary) to .baseleap/reports/A1.md and return only its summary. Commit your files as "STEP A1: <title>".
