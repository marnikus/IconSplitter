#!/usr/bin/env bash
# Combined pre-push verification (docs/current/CODE_VERIFICATION.md).
# Lanes: types + lint + quality gate (changed, legacy allowed, ratchet)
#        + tests + coverage + production build.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
step() { printf "\n=== %s ===\n" "$1"; }

step "1/6 Types (tsc --noEmit)"
npx tsc --noEmit || fail=1

step "2/6 Lint (ESLint: hygiene errors + complexity/nesting warns)"
npx eslint src tests tools --max-warnings 1000 || fail=1

step "3/6 Quality gate — changed files (legacy allowed + ratchet)"
node tools/quality.mjs --changed --allow-legacy || fail=1

step "4/6 Tests (vitest, RULE 8 — real logic)"
npx vitest run || fail=1

step "5/6 Coverage (src/lib, RULE 16.3)"
npx vitest run --coverage || fail=1

step "6/6 Production build (vite single-file)"
npm run build || fail=1

if [ "$fail" -eq 0 ]; then
  printf "\nALL LANES PASSED — safe to push.\n"
else
  printf "\nPRE-PUSH CHECK FAILED — fix before pushing.\n"
fi
exit "$fail"
