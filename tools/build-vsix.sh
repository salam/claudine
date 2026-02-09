#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

release_version="$(node tools/release-utils.js changelog-version CHANGELOG.md)"
current_version="$(node -p "require('./package.json').version")"

if [[ "$current_version" != "$release_version" ]]; then
  echo "Updating package version: $current_version -> $release_version"
  npm version "$release_version" --no-git-tag-version >/dev/null
else
  echo "Package version already matches changelog: $release_version"
fi

npm ci
(cd webview && npm ci)
npm run compile
npm run build:webview

# Swap in the marketplace README for the VSIX package
cp README.md README.md.bak
cp README.marketplace.md README.md
trap 'mv README.md.bak README.md' EXIT

npx @vscode/vsce package --no-dependencies "$release_version"
echo "Built claudine-$release_version.vsix"
