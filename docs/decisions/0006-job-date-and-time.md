# 0006 — Job date and start time stored as Hamilton wall-clock values

**Status:** proposed
**Date:** 2026-11-14
**Driven by:** FR-5, FR-6, FR-7, FR-12 · AC-004.8, AC-010.7 · PRD OQ-7
**Implemented in:** `supabase/migrations/20261114000300_jobs.sql` (`job_date date`, `start_time time`, `organizations.time_zone`) · `docs/openapi.yaml` (`job_date` `format: date`, `start_time` `HH:MM`)

## Context
A job has a day and a start time, both meaning "in Hamilton" (America/Toronto). The board shows one day in time order. "Today" is the Toronto date whatever the phone's clock says (AC-004.8). On 2027-03-14 the clocks move forward, and jobs at 08:00 and 09:00 must still sort in order (AC-010.7). The house convention is UTC `date-time` for times.

## Decision
Store `job_date` as `date` and `start_time` as `time`: the wall-clock values the owner typed, in the org's time zone (`organizations.time_zone`, default `America/Toronto`). The server works out "today" as `(now() at time zone org.time_zone)::date` and returns it in every board response; the client never uses its own clock for that. The contract sends `job_date` as `YYYY-MM-DD` and `start_time` as `HH:MM`. This is a deliberate deviation from the UTC `date-time` convention.

## Alternatives considered
### `starts_at timestamptz` (UTC instant)
- **Pros:** the house convention; one column.
- **Cons:** "which day is this job on" becomes a time-zone calculation in every query and index. A job typed for 02:30 on the spring-forward day has no instant. Editing the time changes the instant.
- **Why not:** the owner schedules wall-clock appointments in one city. The calendar day is the primary key of the board.

### Both columns
- **Pros:** an instant for future notifications.
- **Cons:** two sources of truth that can disagree.
- **Why not:** nothing in v1 needs an instant (NG-8). It can be derived later from the date, time and zone.

## Consequences
- **Easier:** the board query is one index range (`org_id, job_date, start_time, created_at`); DST can't reorder a day.
- **Harder:** the frontend must not convert these values to or from local time. Audit and record timestamps (`created_at`, `updated_at`) stay `timestamptz` in UTC.
- **Cost:** none.
- **Risks:** a second org in another zone → `time_zone` is per org already.

## Sources
- PostgreSQL date/time types and `AT TIME ZONE`: https://www.postgresql.org/docs/current/datatype-datetime.html and https://www.postgresql.org/docs/current/functions-datetime.html (read 2026-11-14)
