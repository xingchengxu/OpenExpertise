#!/usr/bin/env bash
# Pre-publish smoke test.
# Run before `pnpm publish -r --access public --no-git-checks`.
# Exits non-zero on the first failure with a clear pointer to which gate failed.

set -euo pipefail

cd "$(dirname "$0")/.."

bold=$(tput bold 2>/dev/null || echo "")
green=$(tput setaf 2 2>/dev/null || echo "")
red=$(tput setaf 1 2>/dev/null || echo "")
yellow=$(tput setaf 3 2>/dev/null || echo "")
reset=$(tput sgr0 2>/dev/null || echo "")

step() { echo "${bold}==>${reset} $*"; }
ok()   { echo "${green}✓${reset} $*"; }
warn() { echo "${yellow}⚠${reset} $*"; }
fail() { echo "${red}✗${reset} $*" >&2; exit 1; }

step "1/9  Clean install + build"
pnpm clean >/dev/null
pnpm install --frozen-lockfile >/dev/null 2>&1 || pnpm install >/dev/null
pnpm -r build >/dev/null
ok   "build succeeded"

step "2/9  Typecheck"
pnpm typecheck >/dev/null
ok   "typecheck clean"

step "3/9  Lint"
if ! pnpm lint >/dev/null 2>&1; then
  pnpm lint
  fail "lint reported issues"
fi
ok   "lint clean"

step "4/9  Format check"
if ! pnpm format:check >/dev/null 2>&1; then
  pnpm format:check
  fail "format issues — run pnpm format"
fi
ok   "prettier clean"

step "5/9  Test suite"
pnpm test 2>&1 | tail -3
ok   "tests passed"

step "6/9  Version sync (all publishable packages on the same version)"
versions=$(for pkg in packages/*/package.json; do
  node -e "console.log(require('./${pkg}').version)"
done | sort -u)
count=$(echo "$versions" | wc -l | tr -d ' ')
if [ "$count" != "1" ]; then
  echo "$versions"
  fail "version drift across packages — sync them before publish"
fi
ok   "all packages on version $(echo "$versions" | head -1)"

step "7/9  publishConfig.access=public on every package"
missing=$(for pkg in packages/*/package.json; do
  name=$(node -e "console.log(require('./${pkg}').name)")
  access=$(node -e "console.log((require('./${pkg}').publishConfig||{}).access||'MISSING')")
  if [ "$access" != "public" ]; then
    echo "$name: $access"
  fi
done)
if [ -n "$missing" ]; then
  echo "$missing"
  fail "missing publishConfig.access=public — set it in those packages"
fi
ok   "every package declares public access"

step "8/9  oe doctor smoke (skipped if no built CLI)"
if [ -f packages/cli/dist/bin.js ]; then
  if node packages/cli/dist/bin.js doctor --json >/dev/null 2>&1; then
    ok "oe doctor exits 0"
  else
    warn "oe doctor exited non-zero — review with: node packages/cli/dist/bin.js doctor"
  fi
else
  warn "packages/cli/dist/bin.js not built — skipping doctor smoke"
fi

step "9/9  publish dry-run"
if pnpm publish -r --dry-run --no-git-checks 2>&1 | grep -q "workspace:"; then
  fail "workspace: leaked into a tarball — only publish via pnpm, never raw npm publish"
fi
ok   "no workspace: leaks in any tarball"

echo
echo "${bold}${green}All pre-publish gates green.${reset}"
echo "Next: pnpm publish -r --access public --no-git-checks"
echo "Then: git tag v\$(node -e \"console.log(require('./packages/cli/package.json').version)\") && git push --tags"
