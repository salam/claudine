/**
 * Pane resize logic tests — validates the height distribution math
 * used when users drag the resize handle between project panes in
 * standalone multi-project view.
 *
 * The approach mirrors ColumnResizeHandle (horizontal) but works on
 * the vertical axis (row-resize).
 */
import { describe, it, expect } from 'vitest';

const MIN_PANE_HEIGHT = 80;

/**
 * Core resize math: given the current heights of the pane above and
 * below the handle plus a vertical delta (positive = drag down),
 * compute the new heights while respecting the minimum.
 */
function computePaneResize(
  topHeight: number,
  bottomHeight: number,
  deltaY: number,
  minHeight = MIN_PANE_HEIGHT
): { top: number; bottom: number } {
  const total = topHeight + bottomHeight;
  let newTop = Math.round(topHeight + deltaY);

  // Clamp to minimum constraints
  newTop = Math.max(minHeight, Math.min(total - minHeight, newTop));
  const newBottom = total - newTop;

  return { top: newTop, bottom: newBottom };
}

/** Zoom compensation for vertical drag deltas. */
function adjustedDeltaY(deltaY: number, zoom: number): number {
  return deltaY / zoom;
}

describe('Pane resize — height distribution', () => {
  it('splits delta equally when there is room', () => {
    const { top, bottom } = computePaneResize(300, 300, 50);
    expect(top).toBe(350);
    expect(bottom).toBe(250);
  });

  it('preserves the total height', () => {
    const { top, bottom } = computePaneResize(200, 400, -30);
    expect(top + bottom).toBe(600);
  });

  it('clamps the top pane to minHeight', () => {
    const { top, bottom } = computePaneResize(100, 300, -200);
    expect(top).toBe(MIN_PANE_HEIGHT);
    expect(bottom).toBe(320); // 400 - 80
  });

  it('clamps the bottom pane to minHeight', () => {
    const { top, bottom } = computePaneResize(100, 300, 400);
    expect(bottom).toBe(MIN_PANE_HEIGHT);
    expect(top).toBe(320); // 400 - 80
  });

  it('handles zero delta (no-op)', () => {
    const { top, bottom } = computePaneResize(250, 250, 0);
    expect(top).toBe(250);
    expect(bottom).toBe(250);
  });

  it('handles both panes at minimum', () => {
    // Total is 160 (2 * MIN_PANE_HEIGHT), no room to grow either
    const { top, bottom } = computePaneResize(80, 80, 50);
    expect(top).toBe(MIN_PANE_HEIGHT);
    expect(bottom).toBe(MIN_PANE_HEIGHT);
  });
});

describe('Pane resize — zoom compensation', () => {
  it('at zoom 1.0 no compensation needed', () => {
    expect(adjustedDeltaY(10, 1.0)).toBe(10);
  });

  it('at zoom 1.5 scales delta down', () => {
    expect(adjustedDeltaY(15, 1.5)).toBe(10);
  });

  it('at zoom 0.5 scales delta up', () => {
    expect(adjustedDeltaY(5, 0.5)).toBe(10);
  });
});

describe('Pane resize — height persistence helpers', () => {
  /**
   * When panes are collapsed/expanded, stored heights need
   * redistribution. This simulates the redistribution logic.
   */
  function redistributeHeights(
    totalAvailable: number,
    expandedCount: number,
    storedHeights: Record<string, number>,
    expandedPaths: string[]
  ): Record<string, number> {
    // Only expanded panes participate
    const participating = expandedPaths.filter(p => p in storedHeights);
    const storedTotal = participating.reduce((s, p) => s + storedHeights[p], 0);

    if (storedTotal === 0 || participating.length === 0) {
      // No stored heights — distribute equally
      const each = Math.round(totalAvailable / expandedCount);
      const result: Record<string, number> = {};
      for (const p of expandedPaths) result[p] = each;
      return result;
    }

    // Scale stored heights to fit available space
    const scale = totalAvailable / storedTotal;
    const result: Record<string, number> = {};
    for (const p of participating) {
      result[p] = Math.round(storedHeights[p] * scale);
    }
    // Give remaining to first pane to avoid rounding drift
    const actual = Object.values(result).reduce((s, v) => s + v, 0);
    if (actual !== totalAvailable && participating.length > 0) {
      result[participating[0]] += totalAvailable - actual;
    }
    return result;
  }

  it('distributes equally when no stored heights', () => {
    const h = redistributeHeights(600, 3, {}, ['a', 'b', 'c']);
    expect(h.a).toBe(200);
    expect(h.b).toBe(200);
    expect(h.c).toBe(200);
  });

  it('scales stored heights to available space', () => {
    const h = redistributeHeights(600, 2, { a: 200, b: 400 }, ['a', 'b']);
    expect(h.a).toBe(200);
    expect(h.b).toBe(400);
  });

  it('rescales when available space changes', () => {
    const h = redistributeHeights(300, 2, { a: 200, b: 400 }, ['a', 'b']);
    expect(h.a).toBe(100);
    expect(h.b).toBe(200);
  });
});
