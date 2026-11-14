---
name: be-testing
description: API testing and observability for bl-backend — Vitest integration tests per operation against the staging Supabase branch, validating every response against the generated contract schemas and covering the 401/403/404/409/422 matrix; unit tests for services; structured logging with request ids; and the health endpoint. Use before reporting any endpoint step.
---

# Back-End · Testing & Observability

Your tests are the evidence that each endpoint does what the contract says, for the right people only. The ledger re-runs them; QA tests the integrated app on top.

## 1. Integration tests — one file per resource (`tests/api/<resource>.test.ts`)

Template: `templates/api.test.ts`. For every operation your step builds:
- **Happy path** for each acceptance criterion it serves (named by AC id).
- **Contract check:** parse every response body with the generated Zod schema for that operation + status — an extra, missing or wrongly typed field fails the test.
- **Auth matrix:** no session → 401 · wrong role → 403 · another tenant's id → 404 · (for each role in the permission matrix that should be allowed → 2xx).
- **Validation:** missing/invalid field → 422 with the field named in `errors[]`; unknown field rejected.
- **Conflicts & edges:** the story's `[edge]`/`[error]` criteria (slot taken → 409, double submit with the same `Idempotency-Key` → one record).

Call the handlers in-process (import the route's `GET`/`POST` and pass a `NextRequest`) — fast, no server to boot.

## 2. Against the staging branch, not a laptop database

Integration tests run against the **staging Supabase branch** (the architect's migrations applied, `seed.sql` loaded), using dedicated test users per role created by the test setup and cleaned up after. Each test file creates and deletes its own rows (or uses a unique tenant per run) so runs never collide. Never point tests at production.

## 3. Unit tests for services

Pure business rules (pricing, eligibility, time-window rules) get fast unit tests with the data layer stubbed — especially money and time-zone edges.

## 4. Coverage that matters

Every operation has its matrix; every AC your step serves has a named test. Line-coverage percentages are not a target on their own.

## 5. Observability

- **Structured logs** (`src/lib/server/log.ts`): JSON with `level`, `request_id`, `route`, `operator_id`, `outcome`, `duration_ms`. Never tokens, secrets, request bodies with personal data, or full error objects from providers.
- Every response carries `x-request-id`; 500s return it in the problem body so a support question can be traced.
- `GET /api/health` (scaffolded by the architect) stays cheap; add a DB check only if it's a single fast query.
- Errors go to Vercel logs by default; an error tracker only with a spend gate.

## 6. Done means

Step verify (the ledger runs it), typically:
`npm run typecheck && npm run lint && npm test -- tests/api/<resource> src/lib/server/services/<resource> && npm run build`
Report: the AC → test mapping, the auth-matrix results, the key queries' plans (`be-data` §5), and any CONTRACT QUESTION.

---
Sources (ideas adapted, text written for Baseleap): laurigates/claude-plugins `vitest-testing` (MIT — test structure, mocking, thresholds), charlieviettq `api-security-testing` (MIT — authorisation test matrix), Jeffallan/claude-skills (MIT). borghei/Claude-Skills `api-test-suite-builder` reviewed for ideas only (Commons Clause — contract validation of payloads; done here with the Orval-generated Zod schemas instead).
