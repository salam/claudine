import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

/**
 * BUG9 — Standalone mode: live monitoring not working
 *
 * chokidar v4 does not fire `change` events when watching glob patterns.
 * The fix watches the base directory instead and filters by extension in
 * the event callbacks. These tests verify the filtering behaviour.
 */

// Fake chokidar watcher backed by an EventEmitter
class FakeWatcher extends EventEmitter {
  public watchedPath: string = '';
  close() { this.removeAllListeners(); }
}

let fakeWatcher: FakeWatcher;

// Mock chokidar so we can capture what path is watched and emit fake events
vi.mock('chokidar', () => ({
  watch: (pathArg: string) => {
    fakeWatcher.watchedPath = pathArg;
    return fakeWatcher;
  },
}));

describe('BUG9 – StandaloneAdapter.watchFiles', () => {
  let adapter: InstanceType<typeof import('../platform/StandaloneAdapter').StandaloneAdapter>;

  beforeEach(async () => {
    fakeWatcher = new FakeWatcher();
    // Lazy-import after mock is set up
    const { StandaloneAdapter } = await import('../platform/StandaloneAdapter');
    adapter = new StandaloneAdapter();
    // Inject the mocked chokidar module
    await adapter.initAsync();
  });

  it('watches the base directory, not the glob pattern', () => {
    adapter.watchFiles('/base/path', '**/*.jsonl', {});
    expect(fakeWatcher.watchedPath).toBe('/base/path');
  });

  it('fires onChange only for files matching the glob extension', () => {
    const changed: string[] = [];
    adapter.watchFiles('/base', '**/*.jsonl', {
      onChange: (p) => changed.push(p),
    });

    fakeWatcher.emit('change', '/base/project/conv.jsonl');
    fakeWatcher.emit('change', '/base/project/readme.md');
    fakeWatcher.emit('change', '/base/project/data.json');
    fakeWatcher.emit('change', '/base/deep/nested/other.jsonl');

    expect(changed).toEqual([
      '/base/project/conv.jsonl',
      '/base/deep/nested/other.jsonl',
    ]);
  });

  it('fires onCreate only for files matching the glob extension', () => {
    const created: string[] = [];
    adapter.watchFiles('/base', '**/*.jsonl', {
      onCreate: (p) => created.push(p),
    });

    fakeWatcher.emit('add', '/base/new-file.jsonl');
    fakeWatcher.emit('add', '/base/new-file.txt');

    expect(created).toEqual(['/base/new-file.jsonl']);
  });

  it('fires onDelete only for files matching the glob extension', () => {
    const deleted: string[] = [];
    adapter.watchFiles('/base', '**/*.jsonl', {
      onDelete: (p) => deleted.push(p),
    });

    fakeWatcher.emit('unlink', '/base/removed.jsonl');
    fakeWatcher.emit('unlink', '/base/removed.log');

    expect(deleted).toEqual(['/base/removed.jsonl']);
  });

  it('passes all events through when glob has no extension filter', () => {
    const changed: string[] = [];
    adapter.watchFiles('/base', '**/*', {
      onChange: (p) => changed.push(p),
    });

    fakeWatcher.emit('change', '/base/a.txt');
    fakeWatcher.emit('change', '/base/b.jsonl');

    expect(changed).toEqual(['/base/a.txt', '/base/b.jsonl']);
  });

  it('dispose stops the watcher', () => {
    const closeSpy = vi.spyOn(fakeWatcher, 'close');
    const disposable = adapter.watchFiles('/base', '**/*.jsonl', {});
    disposable.dispose();
    expect(closeSpy).toHaveBeenCalled();
  });
});
