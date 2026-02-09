import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const LOCALES = ['de', 'es', 'fr', 'it'] as const;

function readJson(relativePath: string): Record<string, string> {
  const filePath = path.join(PROJECT_ROOT, relativePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, string>;
}

function sortedKeys(record: Record<string, string>): string[] {
  return Object.keys(record).sort();
}

describe('Localization bundles', () => {
  it('keeps package.nls locale keys in sync', () => {
    const base = readJson('package.nls.json');
    const baseKeys = sortedKeys(base);

    for (const locale of LOCALES) {
      const translated = readJson(`package.nls.${locale}.json`);
      expect(sortedKeys(translated)).toEqual(baseKeys);
    }
  });

  it('keeps l10n bundle locale keys in sync', () => {
    const base = readJson('l10n/bundle.l10n.json');
    const baseKeys = sortedKeys(base);

    for (const locale of LOCALES) {
      const translated = readJson(`l10n/bundle.l10n.${locale}.json`);
      expect(sortedKeys(translated)).toEqual(baseKeys);
    }
  });
});
