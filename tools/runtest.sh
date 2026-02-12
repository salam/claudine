#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npm ci
(cd webview && npm ci)
npm run lint
npm run compile:check
npm test
npm run compile
npm run build:webview
# tools/package-vsix.sh
