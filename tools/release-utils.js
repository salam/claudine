#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const CHANGELOG_VERSION_REGEX = /^## \[(\d+)\.(\d+)\.(\d+)\]/m;
const VSIX_NAME_REGEX = /^claudine-(\d+)\.(\d+)\.(\d+)\.vsix$/;

function compareSemverParts(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

function extractLatestChangelogVersion(changelogContent) {
  const match = CHANGELOG_VERSION_REGEX.exec(changelogContent);
  if (!match) {
    throw new Error('Could not find a changelog version heading like "## [1.2.3]"');
  }
  return `${match[1]}.${match[2]}.${match[3]}`;
}

function readLatestChangelogVersion(changelogPath) {
  const content = fs.readFileSync(changelogPath, 'utf8');
  return extractLatestChangelogVersion(content);
}

function parseVsixVersion(filePath) {
  const basename = path.basename(filePath);
  const match = VSIX_NAME_REGEX.exec(basename);
  if (!match) {
    return null;
  }

  return {
    filePath,
    versionParts: [Number(match[1]), Number(match[2]), Number(match[3])],
  };
}

function findLatestClaudineVsix(paths) {
  let best = null;

  for (const filePath of paths) {
    const parsed = parseVsixVersion(filePath);
    if (!parsed) continue;

    if (!best || compareSemverParts(parsed.versionParts, best.versionParts) > 0) {
      best = parsed;
    }
  }

  if (!best) {
    throw new Error('No VSIX files found matching claudine-x.y.z.vsix');
  }

  return best.filePath;
}

function findLatestClaudineVsixInDir(directoryPath) {
  const entries = fs.readdirSync(directoryPath)
    .map((entry) => path.join(directoryPath, entry));

  return findLatestClaudineVsix(entries);
}

function runCli() {
  const command = process.argv[2];

  if (command === 'changelog-version') {
    const changelogPath = process.argv[3] || path.join(process.cwd(), 'CHANGELOG.md');
    console.log(readLatestChangelogVersion(changelogPath));
    return;
  }

  if (command === 'latest-vsix') {
    const directoryPath = process.argv[3] || process.cwd();
    console.log(findLatestClaudineVsixInDir(directoryPath));
    return;
  }

  console.error('Usage: node tools/release-utils.js <changelog-version|latest-vsix> [path]');
  process.exit(1);
}

if (require.main === module) {
  runCli();
}

module.exports = {
  extractLatestChangelogVersion,
  readLatestChangelogVersion,
  findLatestClaudineVsix,
  findLatestClaudineVsixInDir,
};
