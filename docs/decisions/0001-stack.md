# 0001 — Stack: the house stack, no deviations

**Status:** proposed
**Date:** 2026-11-14
**Driven by:** PRD Technical Considerations (Constraints), FR-7, FR-8, NG-8, NG-13 · intake decision "Next.js on Vercel with Supabase, $0 new spend"
**Implemented in:** `supabase/migrations/*` · `docs/openapi.yaml` · `docs/architecture.md`

## Context
Northside Plumbing needs a phone-first, installable job board for 1 owner and 3 technicians, at $0 new spend, on a `*.vercel.app` address. The PRD names the house stack as a constraint. Nothing in the PRD needs payments, workflows outside the app, a second deployable or long-running work. The one new piece is installability (FR-8), which every modern browser supports from a plain web app.

## Decision
Use the Baseleap house stack unchanged: one Next.js (App Router, TypeScript strict) app on Vercel, Tailwind + shadcn/ui themed from `DESIGN.md`, Supabase Postgres with RLS on every table and SQL migrations, Supabase Auth for sign-in. Installability comes from a Next.js web app manifest plus a small hand-written service worker that caches only the offline screen (no job data, NG-9). No Stripe, no n8n, no GHL calls in v1 (decision 0007).

## Alternatives considered
### Native or store app (React Native / Expo)
- **Pros:** sign-in links can open the app directly; push notifications later.
- **Cons:** store accounts and review, two more build pipelines, cost.
- **Why not:** NG-13 rules it out, and an installable web app meets FR-8.

### A PWA framework plugin (e.g. a Next.js PWA package with generated service worker)
- **Pros:** less code for caching strategies.
- **Cons:** another dependency; generated workers tend to cache API responses, which would put customer names, phones and addresses on the device (against NG-9 and the PII rules).
- **Why not:** we need exactly one cached page. A 30-line worker we can read is safer.

### Supabase Realtime for the board from day one
- **Pros:** live updates (US-013).
- **Cons:** US-013 is P2 and not approved; adds a client subscription and a publication change.
- **Why not:** deferred. It is nearly free when approved: one additive migration (add `public.jobs` to the `supabase_realtime` publication) and a client subscription that refetches the board. RLS applies to Realtime `postgres_changes`.

## Consequences
- **Easier:** every agent already knows this stack; nothing new to provision except the email sender (decision 0003).
- **Harder:** iPhone installed-app sign-in needs care (decision 0002).
- **Cost:** none new. Vercel and Supabase run on Baseleap's existing team and org (intake decision 6). The 30-day session cap needs Supabase Pro "Time-box user sessions" (decision 0002); unverified which plan the org is on.
- **Risks:** Vercel function cold starts on the board → board is a server-rendered page with one indexed query; checked against the 2 s guardrail in QA.

## Sources
- Supabase Realtime and RLS: https://supabase.com/docs/guides/realtime/postgres-changes (read 2026-11-14)
- PRD `docs/PRD.md` Technical Considerations, NG-9, NG-13
