# QA5: closing the gaps the planted-bug drill found

Branch: current. Not pushed. **Not run:** QA has no local Supabase keys, so none of the new tests has been executed against the stack. They compile (`npx tsc --noEmit -p tsconfig.json` is clean; the repo tsconfig does not include `tests/`, so the tests were also checked with a temporary tsconfig that does, and only my own two strict-index slips needed fixing; the older specs show the same pre-existing `noUncheckedIndexedAccess` notes under that stricter check and were not touched for it). Claude runs them (commands at the bottom). Expected today on the unmodified app: all new tests pass, and QA4-001's two phone tests still fail. If a new test fails on the unmodified app, that is a finding (or a wrong guess of mine about the contract: see "Judgement calls"), not something to loosen.

## What was added, per class

| # | Class | Added | How a planted bug now fails |
|---|---|---|---|
| 1 | Tenant isolation | nothing (already caught) | cross-organisation board test |
| 2 | Field accepted, not saved | `tests/e2e/api/roundtrip.spec.ts` (`-g ROUNDTRIP`), 9 tests | Every writable field of `POST /jobs` is sent with a distinct value in 3 variants (two full ones with different values, one with optionals omitted), plus each optional field alone and the 200 replay. The response and fresh board reads (owner, assigned tech, other tech) are compared field by field: `customer_phone: sent "(905) 555-0147", a fresh read from the owner board returned null`. Status: every status through `PUT`, versions +1, no other field changes, fresh reads equal the response. A guard test fails if a property of the generated `CreateJobBody` has no variant. |
| 3 | `null` gives a 5xx | `tests/e2e/api/nulls.spec.ts` (`-g NULLS`), about 60 tests | `null` for each optional field (expect 201, stored null) and each required field (expect 422 naming it); 5 wrong types per field; `{}`, non-object, empty, malformed and wrong-content-type bodies; unknown property; odd path ids; null and garbage query values; null/garbage `Authorization`; technician and signed-out callers with null-laden bodies. `never5xx()` runs first in every case, so a 500 reads `5xx: POST /api/jobs with notes: null -> 500 …`. Status endpoint: 18 body variants, and each also proves nothing was saved. |
| 4 | Undefined field in a response | `tests/e2e/api/shapes.spec.ts` (`-g SHAPE`) + `tests/e2e/support/shapes.ts`, 8 tests | Each 2xx body is parsed with the generated zod schema (`GetHealthResponse`, `GetMeResponse`, `GetBoardResponse`, `CreateJobResponse`, `SetJobStatusResponse`) and walked for unknown keys at any depth (zod's `.strict()` is one level only, so the walker reads the schema tree). Failure text: `extra (not in the contract): $.jobs[0].org_id` or `missing/invalid: $.version (…)`. Error bodies (400, 401, 403, 404, 409 with `current`, 422) are checked against `Problem` / `StaleProblem` from `openapi.yaml`. A self-test plants extra and missing fields and requires them to be named. |
| 5 | Console error on load | `tests/e2e/support/console.ts`, auto fixture `consoleGuard` in `support/fixtures.ts` | Every browser test (mobile and desktop projects, `@smoke` included) collects `console.error` and uncaught page errors from the default context and from every context it opens, and fails after the body: `the browser reported 1 console/page error(s) … - console.error: … (url)`. API-only tests never launch a browser. `CONSOLE_ALLOWLIST` is empty. The four specs that call `browser.newContext` (board, signin, team, loop) now call `watchedContext(browser, …)`; `newSignedInContext` watches too. |

Docs: `docs/test-plan.md` section 7.1 (classes, tests, failure texts, limits) and two rows in section 10.

## Judgement calls (the contract is silent or loose; each is flagged in the test)

- Unknown property in a body: contract says `additionalProperties: false`, but not 400 vs 422. Test accepts 400 or 422, and that nothing was saved.
- Empty / non-object / no body: 400 or 422 accepted; must be problem+json, never 5xx.
- Required field `null` or wrong type: asserted as 422 `validation_failed` with the field named (ValidationError response).
- `GET /api/board?date=` (empty) and similar odd query values: 200 or a 4xx problem, never 5xx.
- Owner permission booleans are checked for type by the schema, not for value, to avoid inventing matrix rules.
- A same-status `PUT` with a wrong version returns 200 with the unchanged job (AC-007.9, contract text).

## Risks to read before the first run

- **Console guard on the local stack** also sees Next.js dev-server messages. If `/sign-in`, `/link-expired`, `/offline` or `/` log anything (including `Failed to load resource` for a 401), `@smoke` now fails by design. That is the point of the class; list it, don't allow-list it. Release evidence is the staging run.
- The console guard only protects pages a test opens. Screens are still placeholders and most browser tests are `fixme`, so today it guards the four `@smoke` pages. It widens automatically as `fixme` is removed.
- The checker's own runtime behaviour (zod v4 internals `_zod.def`) is covered by the first test in `shapes.spec.ts`; if zod is upgraded and that test fails, the walker needs updating, not the app.

## Run (Claude, local stack)

```
PRODUCTION_HOSTS=<prod hosts> bash tests/e2e/run-local.sh --project=api -g "ROUNDTRIP|NULLS|SHAPE"
PRODUCTION_HOSTS=<prod hosts> bash tests/e2e/run-local.sh --grep @smoke
PRODUCTION_HOSTS=<prod hosts> bash tests/e2e/run-local.sh
```

Then re-run the drill: each of classes 2 to 5 must fail at least one of the tests above.

## Files changed

`tests/e2e/support/{console,fixtures,session,shapes}.ts` · `tests/e2e/api/{roundtrip,nulls,shapes}.spec.ts` · `tests/e2e/{board,signin,team,loop}.spec.ts` (context helper only) · `docs/test-plan.md` · `.baseleap/reports/QA5.md`
