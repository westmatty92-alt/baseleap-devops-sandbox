#!/usr/bin/env bash
# Source this file (do not execute it): `source tests/e2e/local-env.sh`
# Exports the local stack's connection settings for BOTH the dev server and the Playwright run, without printing any value.
# Needs `npx supabase start` to be running for THIS repo (ports 554xx, supabase/config.toml). It never reads another project's containers.
#
# Exports: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, E2E_TARGET=local, BASE_URL.
# Needs from you: PRODUCTION_HOSTS (comma-separated production hosts). The suite refuses to run without it.

if [ -z "${PRODUCTION_HOSTS:-}" ]; then
  echo "local-env: PRODUCTION_HOSTS is not set. Export the production host list first (the suite refuses to run without it)." >&2
  return 1 2>/dev/null || exit 1
fi

# `supabase status -o env` prints KEY="value" lines. Keep only the three names we need; print nothing.
_status="$(npx supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')" || _status=""
if [ -z "$_status" ]; then
  echo "local-env: could not read the local stack. Is \`npx supabase start\` running in this repo?" >&2
  unset _status
  return 1 2>/dev/null || exit 1
fi
eval "$_status"
unset _status

case "${API_URL:-}" in
  http://127.0.0.1:554[0-9][0-9]|http://localhost:554[0-9][0-9]) ;;
  *)
    echo "local-env: the Supabase API is not on a 554xx port of this machine. Refusing." >&2
    unset API_URL ANON_KEY SERVICE_ROLE_KEY
    return 1 2>/dev/null || exit 1
    ;;
esac

if [ -z "${ANON_KEY:-}" ] || [ -z "${SERVICE_ROLE_KEY:-}" ]; then
  echo "local-env: \`supabase status -o env\` did not return ANON_KEY and SERVICE_ROLE_KEY (names may differ in this CLI version). Check with: npx supabase status -o env | cut -d= -f1" >&2
  unset API_URL ANON_KEY SERVICE_ROLE_KEY
  return 1 2>/dev/null || exit 1
fi

export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
unset API_URL ANON_KEY SERVICE_ROLE_KEY
export E2E_TARGET=local
export BASE_URL=http://localhost:3000
echo "local-env: ready (Supabase on a 554xx port, app expected on http://localhost:3000). No values printed."
