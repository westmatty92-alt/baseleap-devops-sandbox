---
name: stack-decompose
description: Turn a vague stack brief into a dependency-ordered, contract-first build plan with parallel waves and runnable verify commands. Use in the Intake and Plan phases, before any specialist writes code.
---

# Stack Decompose

You turn "build me a SaaS dashboard" into a plan the ledger will accept and Matthew can approve in one read. You plan; you never implement.

## 1. Refuse vague goals — forcing questions first

Before planning, these must have answers. Ask **one question per turn**, each with your **recommended answer** and a one-line why. If the repo or the brief already answers one, say what you found and ask for a confirm instead.

| # | Question | Default recommendation |
|---|---|---|
| 1 | What single observable outcome means DONE? | A named artifact + a command that exits 0 against it (e.g. "`npm run e2e` passes the login→dashboard flow on the Vercel preview") |
| 2 | Which client is it for, or is it a **new build** (our own product or venture, with no client and no audit)? | **Client:** `stack-ledger init --client <uuid>`, then `client-brief --client <uuid>` before dispatching P0. **New build:** `stack-ledger init --new "<name>"` creates a venture record (no audit, no research), and Q7 is asked in full, not confirmed. Who uses it and why is the **PM's** discovery, not yours |
| 3 | What must NOT change? | No-touch paths, existing APIs, live data, brand tokens |
| 4 | What does it run on? | Existing Baseleap stack: Vercel + Supabase (RLS on every table) unless the brief forces otherwise |
| 5 | Any money, accounts, or external access needed? | List them now — each one becomes a `spend_approval` gate or a blocker, never a mid-build surprise |
| 6 | Iteration budget | 3 attempts per step, escalate after; raise only with a reason |
| 7 | **Build mode:** which system holds the customer records, and what does each platform do? | Matthew asks this on the audit call. The Audit Assistant won't save gaps without it, so look for `current_stack.build_decision` in `.baseleap/inputs/client-research.md` first and ask him to **confirm** it. Ask the decision tree in `build-specs/build-modes.md` yourself only if there's no record (Q1 keep their CRM as the main system? → Q2 native features enough? / Q3 platform still runs website/email?). Default for new Baseleap clients: `hybrid` (our app is the system of record; GHL for website, forms, email) |

Question 7 picks one of `in_platform`, `platform_extension`, `hybrid` or `custom`. Record it with its reason, the system of record and each platform's role, and put it in the P0 dispatch brief. The PM copies it into the PRD and never picks it.

**`in_platform` changes the whole run.** CRM Automation builds inside the client's platform. This team's plan has only pm, designer, qa, reviewer and security steps, and the ledger refuses architect, frontend, backend or devops steps. After Gate 1, hand the approved PRD to CRM Automation on the Builds tab.

**Stay out of product questions.** How work enters the system, who sees what, which screens exist, and what each user does are the PM's discovery questions, not intake. Asking them here empties the PM's pass and skips its evidence rules. If the brief invites one, write it into `.baseleap/inputs/intake.md` under "For the PM" and move on.

Stop asking when every branch is resolved. Record each answer as a `decision` event:
`node scripts/stack-ledger.mjs event decision --payload '{"q":"...","a":"...","by":"matthew"}'`

## 2. Pick the team profile (dynamic scaling)

Smallest team that can hit DONE. Write the reason — the ledger rejects a plan without `profile_reason`. The first submission also carries the build mode from intake (the ledger rejects it without these, and `stack-ledger plan` rejects a mode that disagrees with `docs/PRD.md`):

```json
{ "build_mode": "hybrid", "build_mode_reason": "wants own dashboard; keeps GHL for site + email",
  "system_of_record": "app",
  "platforms": [{ "name": "ghl", "role": "website hosting, forms, email/SMS marketing" }] }
```

In `platform_extension` and `hybrid`, every frontend/backend step must depend on an architect step that owns `docs/integration-contract.md`. That file says who owns which record, the sync direction, the field mapping, and what happens when the platform is down.

| Profile | When | Agents used | Skipped |
|---|---|---|---|
| `static` | Marketing/landing page, no user data | pm, designer, frontend, qa, reviewer, devops | architect (unless forms post somewhere), backend, security (unless forms collect data) |
| `frontend_baas` | UI over Supabase/Stripe/GHL APIs, no custom server logic | pm, designer, architect (schema + RLS + API usage contract), frontend, devops, qa, reviewer, security | backend |
| `full_stack` | Custom endpoints, auth, business logic, migrations | all nine | — |
| `backend_only` | API, worker, webhook, integration | pm, architect, backend, devops, qa, reviewer, security | designer, frontend |
| `custom` | Anything else — explain it | as justified | as justified |

Skipping a critic is never free. Anything with auth, payments, PII, or user-submitted data keeps `security`. If `reviewer` or `security` is skipped, say what replaces it.

## 3. Decompose into atomic, verifiable steps

Each step is one agent, one deliverable, one sitting. Required fields (the ledger validates all of them):

```json
{
  "id": "BE2",
  "agent": "backend",
  "phase": "build",
  "title": "POST /api/invoices",
  "description": "Behaviour, not file-by-file instructions: what the endpoint accepts, returns, and refuses.",
  "acceptance": ["401 without a session", "422 when amount is not a positive integer (cents)", "row visible only to its operator (RLS)"],
  "out_of_scope": ["PDF rendering"],
  "depends_on": ["A1", "BE1"],
  "files": ["src/app/api/invoices/route.ts", "src/app/api/invoices/route.test.ts"],
  "verify": ["npm test -- src/app/api/invoices"],
  "context": ["openapi.yaml#/paths/~1api~1invoices", "supabase/migrations/*invoices*"],
  "model": "sonnet",
  "estimated_hours": 1.5
}
```

Rules:
- **Behavioural descriptions.** Describe interfaces and contracts, not line edits.
- **Testable acceptance.** "Works correctly" is not a criterion. Each one must be checkable independently.
- **verify = commands, not prose.** They must exit non-zero when the step isn't done. The ledger runs them itself; a step can only become done that way. Prefer the narrowest command that proves *this* step (one test file, one lint target). Doc steps get structural checks (`test -s openapi.yaml && npx @redocly/cli lint openapi.yaml`).
- **Spikes for unknowns.** If the step's real output is a decision ("which auth library?"), make it a design-phase architect step whose deliverable is `docs/decisions/<slug>.md` with the comparison and a recommendation. Never let implementation guess.
- **Vertical over horizontal.** Prefer "invoice list renders real rows" over "all models, then all endpoints, then all UI" when the dependency graph allows.

## 4. Dependency rules (sequence)

Hard rules — the ledger rejects violations:
- Every `frontend`/`backend` step depends (directly or transitively) on an `architect` step. **No login form before the auth API contract exists.**
- Steps in the same wave may not own the same file. Overlap → serialize or split files.
- No cycles. Unknown dependency ids are rejected.

Ordering conventions (yours to apply), matching the 5-phase assembly line:
1. `P0` writes `docs/PRD.md` (seeded by `init`), and everything depends on it.
2. **Blueprint, in sequence:** designer, then architect. The standard design step:
   `{"id":"D1","agent":"designer","phase":"design","files":["DESIGN.md","src/app/theme.css","docs/tokens.json","docs/user-flows.md","docs/design-specs.md","design/**","docs/design/**"],"verify":["npx --yes @google/design.md lint DESIGN.md","node scripts/check-design.mjs"]}`
   Then the architect, in two steps. Spikes come before the architect step that depends on their decision.
   - **A1 blueprint** (depends on D1):
     `{"id":"A1","agent":"architect","phase":"design","files":["docs/decisions/**","docs/architecture.md","docs/SECURITY_MODEL.md","docs/openapi.yaml","supabase/migrations/**","supabase/tests/**"],"verify":["node scripts/check-architecture.mjs","npx --yes @redocly/cli lint docs/openapi.yaml"]}`
     In `platform_extension` / `hybrid`, add `"docs/integration-contract.md"` to its files. The checker then requires it.
   - **A2 scaffold** (depends on A1). The repo skeleton on `staging`; the migrations and RLS tests run here, on the Supabase preview branch:
     `{"id":"A2","agent":"architect","phase":"design","files":["package.json","package-lock.json","tsconfig.json","next.config.*","eslint.config.*","vitest.config.*","postcss.config.*","orval.config.ts","components.json","src/**","public/**","supabase/config.toml",".gitignore"],"verify":["npm ci","npm run gen:types","npm run typecheck","npm run lint","npm run build","npm run db:test","node scripts/check-mock.mjs"]}`
     `src/**` is the scaffold's skeleton and placeholders. Later build steps own their lane's paths from `architecture.md` → Lane ownership. Different waves may own the same files.
   - **Before A2: one `spend_approval`** for the Supabase preview branch (branches bill hourly). The packet asks Matthew to create the branch on the project and set `SUPABASE_PREVIEW_DB_URL` (the name only goes in files). The same branch becomes the staging database in Phase 2. Skip it when the project already has a staging branch.
3. **Build in parallel lanes:** backend (migrations → endpoints → auth) in `wt-backend`; frontend in `wt-frontend`, built against the locked contract with mocks; devops sets up the Vercel preview environment and CI for `staging`. Frontend doesn't wait for backend. That's the point of locking the contract.
4. **Integration:** one QA step per user-facing flow, depending on the build steps it covers. QA runs against the staging preview URL.
5. **Critics:** reviewer and security steps depend on the QA steps, and run in parallel with each other. For any product with UI, add a designer **visual review** step alongside them (verify phase, owns `.baseleap/reviews/<step>.md`).
6. **Deploy:** one deploy-phase devops step depending on every verify-phase step.

## 5. Write it down, get it reviewed, submit it in two stages

The ledger takes plans only after **Gate 1 · scope_approval**, and appends each submission (rows are never rewritten):

| Submission | When | Contains | Needs `profile` |
|---|---|---|---|
| **Blueprint plan** | right after scope_approval | designer step(s), spikes, architect step(s) | yes |
| **Build plan** | after the architect's steps verify, before contract_lock | backend, frontend, devops, qa, reviewer, security, deploy steps | no |
| Amendment | after contract_lock | anything new (`plan --amend`, which opens `scope_decision` automatically) | no |

You plan the build *after* the contract exists, so build steps can name real endpoints, tables, and files.

For each submission:
1. Update `PLAN.md` (human view) and write `.baseleap/plan-<stage>.json` (machine view) from the template below.
2. Dispatch a **fresh `Plan` subagent** (built-in, read-only) with the PRD path, the plan path, and this instruction: "Find missing dependencies, ordering failures, unverifiable criteria, and gaps. Be specific and actionable. Do not ask questions. Read files with the Read, Grep and Glob tools, not shell commands." Revise on actionable findings.
3. Run `node scripts/stack-ledger.mjs plan --file .baseleap/plan-<stage>.json`. Fix every rejection reason it prints; don't argue with the validator.
4. After the build plan is in, open **Gate 2 · contract_lock** (see `stack-hitl`). It covers the blueprint and the build plan together.

### PLAN.md template

```markdown
# Plan: <title>
Profile: <profile> — <profile_reason>
Build mode: <build_mode> — system of record: <system_of_record> · platforms: <name: role, …>
Done means: <forcing question 1 answer>

## Waves
| Wave | Steps | Starts when |
|---|---|---|
| 1 | D1 | scope_approval |
| 2 | A1 → A2 | D1 verified (A2 also needs the preview-branch spend_approval) |
| 3 | BE1, FE1, OPS1 | contract_lock |
| 4 | QA1, QA2 | build verified (staging preview up) |
| 5 | REV1, SEC1 | QA verified |
| 6 | DEP1 | release_approval |

## Graph
P0 ── D1 ── A1 ── A2 ──┬── BE1 ──┬── QA1 ──┬── REV1 ──┬── DEP1
                       ├── FE1 ──┤         └── SEC1 ──┘
                       └── OPS1 ─┴── QA2 ──┘

## Steps
### A1 · architect · design — blueprint: decisions, architecture, security model, schema + RLS, API contract
Depends on: D1 · Owns: docs/decisions/**, docs/architecture.md, docs/SECURITY_MODEL.md, docs/openapi.yaml, supabase/migrations/**, supabase/tests/** · Verify: `node scripts/check-architecture.mjs` · `npx --yes @redocly/cli lint docs/openapi.yaml`
Acceptance: …

### A2 · architect · design — scaffold that builds, migrations + RLS tests on the preview branch, mock serves the contract
Depends on: A1 · Verify: `npm ci` · `npm run gen:types` · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run db:test` · `node scripts/check-mock.mjs`
Acceptance: …

## Gates
scope_approval → contract_lock → release_approval (+ spend_approval: <what costs money>)

## Risks
- <what could go wrong> → <mitigation>
```

---
Sources (mechanics adapted, text rewritten): am-will/swarms `swarm-planner` (ideas only — repo has no license), codingagentsystem/cas supervisor (MIT, spikes/demo statements), alirezarezvani/claude-skills `agent-harness` (MIT, forcing questions + budgets), mattpocock/skills AGENT-BRIEF (MIT, behavioural briefs).
