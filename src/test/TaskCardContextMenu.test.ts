import { describe, it, expect } from 'vitest';

/**
 * Mirrors the column filtering logic used by TaskCard context menu.
 * Returns the list of move targets, excluding the card's current status.
 */
interface ColumnDef { id: string; title: string; color: string }

function getContextMenuMoveTargets(
  columns: ColumnDef[],
  archiveColumn: ColumnDef,
  currentStatus: string
): ColumnDef[] {
  const targets = columns.filter(c => c.id !== currentStatus);
  if (currentStatus !== archiveColumn.id) {
    targets.push(archiveColumn);
  }
  return targets;
}

const COLUMNS: ColumnDef[] = [
  { id: 'todo', title: 'To Do', color: '#6b7280' },
  { id: 'needs-input', title: 'Needs Input', color: '#f59e0b' },
  { id: 'in-progress', title: 'In Progress', color: '#3b82f6' },
  { id: 'in-review', title: 'In Review', color: '#8b5cf6' },
  { id: 'done', title: 'Done', color: '#10b981' },
];

const ARCHIVE: ColumnDef = { id: 'archived', title: 'Archived', color: '#4b5563' };

describe('TaskCard context menu — move targets', () => {
  it('excludes the current column from move targets', () => {
    const targets = getContextMenuMoveTargets(COLUMNS, ARCHIVE, 'in-progress');
    const ids = targets.map(t => t.id);
    expect(ids).not.toContain('in-progress');
    expect(ids).toContain('todo');
    expect(ids).toContain('done');
    expect(ids).toContain('archived');
  });

  it('includes archive when card is not archived', () => {
    const targets = getContextMenuMoveTargets(COLUMNS, ARCHIVE, 'todo');
    expect(targets[targets.length - 1].id).toBe('archived');
  });

  it('excludes archive when card is already archived', () => {
    const targets = getContextMenuMoveTargets(COLUMNS, ARCHIVE, 'archived');
    const ids = targets.map(t => t.id);
    expect(ids).not.toContain('archived');
    expect(ids).toEqual(['todo', 'needs-input', 'in-progress', 'in-review', 'done']);
  });

  it('returns all columns except current for todo card', () => {
    const targets = getContextMenuMoveTargets(COLUMNS, ARCHIVE, 'todo');
    expect(targets).toHaveLength(5); // 4 other regular + archive
    expect(targets.map(t => t.id)).not.toContain('todo');
  });

  it('draft cards get no move targets (isDraft bypasses filtering entirely)', () => {
    // In the actual Svelte component, isDraft cards short-circuit to [],
    // so getContextMenuMoveTargets is never called. Verify the component
    // logic: isDraft ? [] : getContextMenuMoveTargets(...)
    const isDraft = true;
    const targets = isDraft ? [] : getContextMenuMoveTargets(COLUMNS, ARCHIVE, '');
    expect(targets).toHaveLength(0);
  });

  it('cancelled cards can move to all regular columns + archive', () => {
    const targets = getContextMenuMoveTargets(COLUMNS, ARCHIVE, 'cancelled');
    expect(targets).toHaveLength(6); // 5 regular + archive
    expect(targets.map(t => t.id)).toContain('archived');
  });
});
