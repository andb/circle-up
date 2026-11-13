#!/usr/bin/env bash
# Usage: smoke.sh <public-url> [wait-seconds=300]. Checks the deployed app. Exit 0 pass, 1 fail.
# shellcheck disable=SC2015
# Uses GET /api/health -> JSON {"eventCode":"1234","round":1}, no secrets or participant text.
# If that route is missing, falls back to hashing the join page (weaker: catches a redeploy, not always a restart).
set -uo pipefail
url=${1:?usage: smoke.sh <public-url> [wait-seconds]}; url=${url%/}; wait=${2:-300}
case $url in https://*) ;; *) echo "FAIL url must start with https://"; exit 1;; esac
fail=0
pass() { echo "PASS $*"; }
bad() { echo "FAIL $*"; fail=1; }
code() { curl -s -o /dev/null -m 20 -w '%{http_code}' "$@"; }

[ "$(code "$url/join")" = 200 ] && pass "join page 200 over HTTPS" || bad "join page did not answer 200"
body=$(curl -s -m 20 "$url/organiser")
grep -qi 'type="password"' <<<"$body" && pass "organiser page shows a password form" || bad "organiser page has no password field"
grep -q 'ORGANISER_SECRET\|secret=' <<<"$body" && bad "organiser page mentions a secret in its body"
[ "$(code "$url/api/apify" -X POST -H 'Content-Type: application/json' -d '{}')" = 401 ] && pass "sponsor route answers 401 without the secret" || bad "sponsor route did not answer 401"

snap() {
  local h; h=$(curl -s -m 20 -w '\n%{http_code}' "$url/api/health")
  if [ "${h##*$'\n'}" = 200 ]; then jq -c '{eventCode,round}' <<<"${h%$'\n'*}" 2>/dev/null || echo bad-json
  else curl -s -m 20 "$url/join" | sha256sum | cut -c1-16 | sed 's/^/page-hash:/'; fi
}
before=$(snap)
case $before in page-hash:*) echo "WARN no /api/health; comparing join-page hash only." ;; bad-json) bad "health route answered but not JSON"; ;; esac
echo "before: $before"
for ((left = wait; left > 0; left -= 30)); do echo "waiting, $left s left"; sleep $((left < 30 ? left : 30)); done
after=$(snap)
echo "after:  $after"
[ "$before" = "$after" ] && [ "$before" != bad-json ] && pass "same round after ${wait}s" || bad "round changed or unreadable after ${wait}s: the process restarted or slept"
[ $fail = 0 ] && echo "SMOKE OK" || echo "SMOKE FAILED"
exit $fail
