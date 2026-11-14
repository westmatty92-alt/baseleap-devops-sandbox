---
name: review-quality
description: Code-quality review for bl-reviewer — check the staging diff against the PRD acceptance criteria, the API contract and the architect's boundaries, then for minimal diffs, dead or duplicated code, strict typing, error handling and test honesty. Use on every code-review step together with review-performance and review-verdict.
---

# Review · Correctness, Contract & Maintainability

The question isn't "would I have written it this way?" It's "does this do what was promised, inside the rules, without leaving a trap for the next change?"

## 1. Does it do what was promised?

For every AC the diff serves: find the code path that satisfies it and the test that proves it. Mark **met** (cite the line and the test), **not met** (Critical), or **can't tell** (say what's missing — usually a test).
- Business rules match the PRD exactly (money in integer cents, time zones, limits, edge cases in `[edge]`/`[error]` criteria).
- Nothing the PRD marks out of scope was built (scope creep is Important: it's untested, unowned surface).

## 2. Does it keep the contract and the architecture?

- Every handler matches `docs/openapi.yaml`: paths, shapes, status codes, problem+json errors. No undocumented fields, endpoints or codes.
- **Generated code untouched:** `src/lib/api/generated/**`, `src/types/database.ts`, `src/app/theme.css` match a fresh generation; no hand edits.
- **Boundaries:** handlers stay thin and call services; services don't import UI; client components don't import `src/lib/server/**`; the frontend reaches the API only through generated hooks; tokens only from `DESIGN.md`.
- Migrations, the contract and decisions changed only through the architect (check the diff's file list against lane ownership).

## 3. Is the change minimal and clean?

- **Diff hygiene:** only what the steps needed. Unrelated reformatting, drive-by refactors and speculative abstractions are findings (Minor, or Important if they touch risky code).
- **Dead and duplicated code:** unused exports, unreachable branches, commented-out code, two implementations of the same rule (Important when the duplicates can drift on a business rule).
- **Types:** `strict` holds; no `any`, no `as` casts that hide a mismatch, no `@ts-ignore`/`@ts-expect-error` without a reason; nullable values handled.
- **Errors:** no swallowed errors (`catch {}`), no generic 500s where the contract defines a code, no user-facing stack traces.
- **Readability:** names say what things are; non-obvious rules have a one-line comment with the AC id.

## 4. Are the tests honest?

- Tests assert outcomes, not implementation details; no assertions removed or loosened in the diff to make something pass (Critical — a weakened test hides a defect).
- No `skip`/`only`/`fixme` left in; mocks don't mock the thing under test.
- Each AC the diff serves has a test (from the builder or QA's plan).

## 5. Run, don't assume

`npm run typecheck`, `npm run lint`, `npm run build`, and a regeneration diff for generated code (`orval` / `supabase gen types` / the DESIGN.md export, then `git diff --exit-code` on the generated paths). Results go in the audit table.

---
Sources (ideas adapted, text written for Baseleap): VoltAgent `code-reviewer.md` (MIT — review checklist), obra/superpowers `requesting-code-review` (MIT — review against the plan/spec, minimal diffs), multica-ai/andrej-karpathy-skills (no licence file — ideas only: surgical changes, no speculative abstraction), qodo-ai/pr-agent (MIT — reviewed for ideas: duplicated/dead code, ranking findings).
