#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${VSCE_PAT:-}" ]]; then
  echo "VSCE_PAT is not set. Export your VS Code Marketplace personal access token first." >&2
  exit 1
fi

latest_vsix="$(node tools/release-utils.js latest-vsix .)"
echo "Publishing ${latest_vsix} to VS Code Marketplace..."

npx @vscode/vsce publish --no-dependencies --packagePath "$latest_vsix"

echo "Published ${latest_vsix}"
