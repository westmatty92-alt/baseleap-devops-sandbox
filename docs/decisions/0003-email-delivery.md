# 0003 — Sign-in email delivery: custom SMTP on a free transactional plan (spend gate)

**Status:** proposed
**Date:** 2026-11-14
**Driven by:** FR-1, AC-001.8 · PRD OQ-3, Dependencies & Risks ("Transactional email account", "Magic-link mail goes to spam")
**Implemented in:** Supabase Auth → SMTP settings (devops) · `docs/architecture.md` "Capacity & reliability"

## Context
Supabase Auth sends the sign-in email. The PRD asks the architect whether Supabase's built-in mail (OQ-3 option B) is enough for 4 people. It isn't. Supabase's default service sends at most 2 messages an hour. It only delivers to addresses on the Supabase organisation's own team, so it would refuse the client's technicians. Supabase also says it is for non-production use, with no SLA.

## Decision
Configure Supabase Auth with custom SMTP from a transactional provider on its free plan. The recommendation is Resend Free: $0, 3,000 emails a month, 100 a day. The sender address must be on a domain Baseleap controls and verifies with the provider (SPF and DKIM). This is a sending domain only. The app stays on `*.vercel.app` (NG-13). The SMTP password is stored in Supabase Auth settings, not in the app's environment.

## Alternatives considered
### Supabase built-in mail (OQ-3 option B)
- **Pros:** zero setup.
- **Cons:** 2 per hour, and only to Supabase org team members.
- **Why not:** cannot reach the technicians at all.

### A personal or Google Workspace mailbox over SMTP
- **Pros:** free if a mailbox exists.
- **Cons:** sending limits, deliverability and spam risk. The PRD's risks section says not to use a personal mailbox.
- **Why not:** fragile, and it ties sign-in to someone's account.

### Another free tier (Postmark, SendGrid, Brevo)
- **Pros:** similar.
- **Cons:** free allowances are smaller or come with trial expiry.
- **Why not:** any of them works; Resend is recommended for the largest permanent free allowance. Matthew may pick another at the gate. The design doesn't depend on which one.

## Consequences
- **Easier:** reliable delivery. Volume (about 4 people, a few sign-ins a month each, plus e2e runs) is far under 100 a day.
- **Harder:** one more account and a DNS step on a Baseleap domain (devops). Nothing on production can sign in until it exists.
- **Cost:** $0/month on the free plan. It is still a new account, so this goes through the **`spend_approval` gate** (OQ-3).
- **Risks:** the provider is down → sign-in shows "We couldn't send the link" (AC-001.8); the failure is logged. Existing 30-day sessions are unaffected. → e2e runs don't send email (decision 0004), so they don't use up the daily cap.

## Sources
- Supabase custom SMTP (default service: 2 messages per hour, project team addresses only, not for production): https://supabase.com/docs/guides/auth/auth-smtp (read 2026-11-14)
- Resend pricing (Free: 3,000/month, 100/day, $0): https://resend.com/pricing (read 2026-11-14)
