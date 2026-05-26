#!/usr/bin/env bash
# Install local git hooks for OpenExpertise contributors.
# Run once after cloning:
#
#   bash scripts/install-git-hooks.sh
#
# The hook runs typecheck + lint + format:check + test before each commit.
# To skip a single commit (when you know what you're doing):
#
#   git commit --no-verify -m "..."
#
# To uninstall:
#
#   rm .git/hooks/pre-commit

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
hook_path="${repo_root}/.git/hooks/pre-commit"

mkdir -p "$(dirname "${hook_path}")"

cat > "${hook_path}" <<'HOOK'
#!/usr/bin/env bash
# OpenExpertise pre-commit hook.
# Installed by scripts/install-git-hooks.sh.
set -euo pipefail

# Only check what's staged. If nothing's staged, exit clean.
if git diff --cached --quiet; then
  exit 0
fi

echo "[pre-commit] typecheck..."
pnpm typecheck

echo "[pre-commit] lint (errors only)..."
pnpm lint

echo "[pre-commit] format:check..."
pnpm format:check

echo "[pre-commit] tests..."
pnpm test

echo "[pre-commit] OK"
HOOK

chmod +x "${hook_path}"

echo "Installed pre-commit hook at ${hook_path}"
echo ""
echo "It runs: typecheck → lint → format:check → test"
echo "Skip once with: git commit --no-verify"
echo "Uninstall with: rm ${hook_path}"
