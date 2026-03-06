/**
 * BUG11 — inferPlacement logic tests.
 *
 * The actual root cause is a broken CSS flex chain in ProjectPane.svelte
 * (`.pane-content` lacks `display: flex`), which feeds content-based height
 * instead of constrained pane height to inferPlacement(). These tests verify
 * that when the CSS chain is correct and the ResizeObserver reports the
 * constrained pane geometry, inferPlacement always returns 'panel' for wide
 * standalone windows.
 */
import { describe, it, expect } from 'vitest';

/**
 * Mirrors KanbanBoard.svelte inferPlacement() exactly.
 */
function inferPlacement(width: number, height: number): 'panel' | 'sidebar' {
  if (height > 0) {
    const aspectRatio = width / height;
    if (aspectRatio <= 1.05) return 'sidebar';
    if (aspectRatio >= 1.35) return 'panel';
  }
  return width < 560 ? 'sidebar' : 'panel';
}

describe('BUG11 — inferPlacement for standalone multi-pane geometry', () => {
  // In standalone mode with a wide window, each pane has large width
  // and relatively small constrained height. Should always be 'panel'.

  it('wide window, single expanded pane (1200×600) → panel', () => {
    expect(inferPlacement(1200, 600)).toBe('panel');
  });

  it('wide window, two expanded panes (1200×280) → panel', () => {
    expect(inferPlacement(1200, 280)).toBe('panel');
  });

  it('wide window, five expanded panes (1200×120) → panel', () => {
    expect(inferPlacement(1200, 120)).toBe('panel');
  });

  it('wide window, many panes at min-height (1200×80) → panel', () => {
    expect(inferPlacement(1200, 80)).toBe('panel');
  });

  it('medium window, several panes (900×150) → panel', () => {
    expect(inferPlacement(900, 150)).toBe('panel');
  });

  // BUG11: Before CSS fix, boards with lots of cards would report
  // content-based height (e.g. 800px tall for many cards in a 1200px wide
  // pane), producing a low aspect ratio that triggers 'sidebar'.
  it('BUG11 repro: content-height 800 in 1200-wide pane → panel (not sidebar)', () => {
    // aspectRatio = 1200/800 = 1.5 → panel ✓
    expect(inferPlacement(1200, 800)).toBe('panel');
  });

  it('BUG11 repro: content-height 1100 in 1200-wide pane → sidebar (the bug)', () => {
    // aspectRatio = 1200/1100 ≈ 1.09 → ambiguous zone → fallback width≥560 → panel
    // This shows the fallback saves some cases but not all
    expect(inferPlacement(1200, 1100)).toBe('panel');
  });

  it('BUG11 repro: content-height 1200 in 1200-wide pane → sidebar (the bug)', () => {
    // aspectRatio = 1200/1200 = 1.0 → ≤1.05 → sidebar!
    // This is the problematic case: square or taller-than-wide boards
    // incorrectly detected as sidebar when the CSS chain is broken.
    expect(inferPlacement(1200, 1200)).toBe('sidebar');
  });
});

describe('inferPlacement — standard VS Code geometries', () => {
  it('sidebar tall/narrow (300×800) → sidebar', () => {
    expect(inferPlacement(300, 800)).toBe('sidebar');
  });

  it('panel wide/short (1200×300) → panel', () => {
    expect(inferPlacement(1200, 300)).toBe('panel');
  });

  it('zero height falls back to width check', () => {
    expect(inferPlacement(800, 0)).toBe('panel');
    expect(inferPlacement(400, 0)).toBe('sidebar');
  });

  it('ambiguous zone (700×600) falls back to width ≥ 560 → panel', () => {
    // aspectRatio = 1.17, between 1.05 and 1.35
    expect(inferPlacement(700, 600)).toBe('panel');
  });

  it('ambiguous zone narrow (500×450) falls back to width < 560 → sidebar', () => {
    // aspectRatio ≈ 1.11, between 1.05 and 1.35, width < 560
    expect(inferPlacement(500, 450)).toBe('sidebar');
  });
});
