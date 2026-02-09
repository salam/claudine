import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const releaseUtils = require('../../tools/release-utils.js');
const { extractLatestChangelogVersion, findLatestClaudineVsix } = releaseUtils;

describe('release-utils', () => {
  it('extracts the latest version from the first changelog heading', () => {
    const changelog = [
      '# Changelog',
      '',
      '## [1.3.2] - 2026-02-09',
      '',
      '### Added',
      '- Something',
      '',
      '## [1.3.1] - 2026-02-08',
    ].join('\n');

    expect(extractLatestChangelogVersion(changelog)).toBe('1.3.2');
  });

  it('throws when no valid changelog heading exists', () => {
    expect(() => extractLatestChangelogVersion('# Changelog\n\nNo versions yet')).toThrow(
      'Could not find a changelog version heading like "## [1.2.3]"'
    );
  });

  it('selects the highest semantic version vsix file', () => {
    const candidates = [
      '/tmp/claudine-1.0.6.vsix',
      '/tmp/claudine-1.12.0.vsix',
      '/tmp/claudine-1.2.10.vsix',
      '/tmp/something-else.vsix',
      '/tmp/claudine-0.9.0.vsix',
    ];

    expect(findLatestClaudineVsix(candidates)).toBe('/tmp/claudine-1.12.0.vsix');
  });

  it('throws when no matching claudine vsix file exists', () => {
    expect(() => findLatestClaudineVsix(['/tmp/other-1.0.0.vsix'])).toThrow(
      'No VSIX files found matching claudine-x.y.z.vsix'
    );
  });
});
