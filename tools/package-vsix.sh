#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f README.marketplace.md ]]; then
  echo "README.marketplace.md not found"
  exit 1
fi

if [[ ! -f README.md ]]; then
  echo "README.md not found"
  exit 1
fi

tmp_readme="$(mktemp)"
cp README.md "$tmp_readme"

cleanup() {
  cp "$tmp_readme" README.md
  rm -f "$tmp_readme"
}
trap cleanup EXIT

cp README.marketplace.md README.md
npx @vscode/vsce package --no-dependencies "$@"
