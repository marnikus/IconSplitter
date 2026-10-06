#!/usr/bin/env bash
# Installs the pre-push quality gate into .git/hooks (RULE 16 enforcement).
set -euo pipefail
cd "$(dirname "$0")/.."
cp tools/hooks/pre-push .git/hooks/pre-push
chmod +x .git/hooks/pre-push
echo "Installed .git/hooks/pre-push (quality gate). Uninstall: rm .git/hooks/pre-push"
