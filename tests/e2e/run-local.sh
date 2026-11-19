#!/usr/bin/env bash
# Runs the Playwright suite against the LOCAL stack (pre-staging check; not release evidence).
#   PRODUCTION_HOSTS=<prod hosts> bash tests/e2e/run-local.sh --grep @smoke
#   PRODUCTION_HOSTS=<prod hosts> bash tests/e2e/run-local.sh --project=api
# Arguments go straight to `playwright test`. Before it: `npx supabase start` and, in the background, `npm run dev` with the
# environment from `source tests/e2e/local-env.sh` (see .baseleap/reports/QA3.md).
set -euo pipefail

cd "$(dirname "$0")/../.."
# shellcheck source=/dev/null
source tests/e2e/local-env.sh

if ! curl -fsS --max-time 10 "$BASE_URL/api/health" >/dev/null; then
  echo "run-local: $BASE_URL/api/health did not answer. Start the app first: npm run dev (port 3000, background)." >&2
  exit 1
fi

exec npx playwright test "$@"
