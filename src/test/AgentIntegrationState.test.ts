import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAgentIntegrationState } from '../extension';

describe('getAgentIntegrationState', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudine-agent-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns "missing" when CLAUDINE.AGENTS.md does not exist', () => {
    expect(getAgentIntegrationState(tmpDir)).toBe('missing');
  });

  it('returns "unreferenced" when CLAUDINE.AGENTS.md exists but neither AGENTS.md nor CLAUDE.md reference it', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDINE.AGENTS.md'), '# Agent instructions');
    expect(getAgentIntegrationState(tmpDir)).toBe('unreferenced');
  });

  it('returns "unreferenced" when AGENTS.md exists but does not mention CLAUDINE.AGENTS.md', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDINE.AGENTS.md'), '# Agent instructions');
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Other agents config');
    expect(getAgentIntegrationState(tmpDir)).toBe('unreferenced');
  });

  it('returns "unreferenced" when CLAUDE.md exists but does not mention CLAUDINE.AGENTS.md', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDINE.AGENTS.md'), '# Agent instructions');
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Project instructions');
    expect(getAgentIntegrationState(tmpDir)).toBe('unreferenced');
  });

  it('returns "ok" when CLAUDINE.AGENTS.md is referenced in AGENTS.md', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDINE.AGENTS.md'), '# Agent instructions');
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), 'See CLAUDINE.AGENTS.md for board control.');
    expect(getAgentIntegrationState(tmpDir)).toBe('ok');
  });

  it('returns "ok" when CLAUDINE.AGENTS.md is referenced in CLAUDE.md', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDINE.AGENTS.md'), '# Agent instructions');
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), 'Include CLAUDINE.AGENTS.md');
    expect(getAgentIntegrationState(tmpDir)).toBe('ok');
  });

  it('returns "ok" when referenced in CLAUDE.md even if AGENTS.md does not reference it', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDINE.AGENTS.md'), '# Agent instructions');
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Unrelated content');
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), 'Reference: CLAUDINE.AGENTS.md');
    expect(getAgentIntegrationState(tmpDir)).toBe('ok');
  });
});
