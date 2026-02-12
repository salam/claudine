#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

release_version="$(node tools/release-utils.js changelog-version CHANGELOG.md)"
current_version="$(node -p "require('./package.json').version")"

if node -e "
  var c = '$current_version'.split('.').map(Number);
  var r = '$release_version'.split('.').map(Number);
  for (var i = 0; i < 3; i++) {
    if (r[i] > c[i]) process.exit(0);
    if (r[i] < c[i]) process.exit(1);
  }
  process.exit(1);
"; then
  echo "Updating package version: $current_version -> $release_version"
  npm version "$release_version" --no-git-tag-version >/dev/null
else
  echo "Package version $current_version is already >= changelog version $release_version — skipping"
fi

npm ci
(cd webview && npm ci)
npm run compile
npm run build:webview

tools/package-vsix.sh "$release_version"
echo "Built claudine-$release_version.vsix"
