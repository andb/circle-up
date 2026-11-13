#!/usr/bin/env bash
# Usage: keys-check.sh [env-file]   (default ../.env.local, relative to infra/)
# Reports set / missing / optional per variable; never prints values. Exit 0 all required set, 3 otherwise, 1 file unreadable.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
file=${1:-$here/../.env.local}
[ -r "$file" ] || { echo "FAIL cannot read $file"; exit 1; }
required=(FEATHERLESS_API_KEY APIFY_TOKEN ORGANISER_SECRET SPONSOR_MODE POSTHOG_KEY POSTHOG_HOST)
optional=(GITHUB_TOKEN NAME_SEARCH EVENT_CODE)
isset() { # non-empty after trimming spaces, quotes and CR; value stays inside this function
  local v
  v=$(sed -n "s/^[[:space:]]*\(export[[:space:]]\+\)\?$1[[:space:]]*=[[:space:]]*//p" "$file" | tail -n 1 | tr -d '\r"'"'"' ')
  [ -n "$v" ]
}
rc=0
for n in "${required[@]}"; do
  if isset "$n"; then echo "set      $n"; else echo "MISSING  $n"; rc=3; fi
done
for n in "${optional[@]}"; do
  if isset "$n"; then echo "set      $n (optional)"; else echo "optional $n (not set)"; fi
done
exit $rc
