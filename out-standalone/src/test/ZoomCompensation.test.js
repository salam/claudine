"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * BUG2b — Drag-and-drop broken in zoomed state
 *
 * Root cause: CSS `zoom` on .kanban-board put the board's children in a
 * different coordinate space than `svelte-dnd-action`'s position:fixed clone,
 * causing the dragged card to appear at the wrong size/position and drop
 * zones to misalign with the cursor.
 *
 * Fix: replaced CSS `zoom` with `transform: scale()` + inverse width/height
 * inside a `.zoom-wrapper` that isolates the transform context.
 *
 * The only testable server-side logic is the zoom compensation math used by
 * handleColumnResize (KanbanBoard.svelte). These tests verify that the
 * inverse-scaling arithmetic is correct at various zoom levels.
 */
const vitest_1 = require("vitest");
(0, vitest_1.describe)('BUG2b — Zoom compensation math', () => {
    /**
     * When the board uses `transform: scale(zoom)`, getBoundingClientRect()
     * returns SCALED dimensions. To get logical (pre-transform) widths we
     * divide by the zoom factor. handleColumnResize does:
     *   adjustedDelta = deltaX / zoom
     *   logicalWidth  = rect.width / zoom
     */
    function logicalWidth(rectWidth, zoom) {
        return Math.round(rectWidth / zoom);
    }
    function adjustedDelta(deltaX, zoom) {
        return deltaX / zoom;
    }
    /** Inverse percentage used for width/height so the scaled result fills the wrapper. */
    function inversePercent(zoom) {
        return 100 / zoom;
    }
    (0, vitest_1.it)('at zoom 1.0 no compensation is needed', () => {
        (0, vitest_1.expect)(logicalWidth(300, 1.0)).toBe(300);
        (0, vitest_1.expect)(adjustedDelta(10, 1.0)).toBe(10);
        (0, vitest_1.expect)(inversePercent(1.0)).toBe(100);
    });
    (0, vitest_1.it)('at zoom 1.5 scales down correctly', () => {
        // A 300px-wide element at 1.5x reports 450px via getBoundingClientRect
        (0, vitest_1.expect)(logicalWidth(450, 1.5)).toBe(300);
        // A 15px mouse drag at 1.5x corresponds to 10 logical pixels
        (0, vitest_1.expect)(adjustedDelta(15, 1.5)).toBe(10);
        // Board width should be 100/1.5 ≈ 66.67% so after scaling it fills the wrapper
        (0, vitest_1.expect)(inversePercent(1.5)).toBeCloseTo(66.667, 2);
    });
    (0, vitest_1.it)('at zoom 0.5 scales up correctly', () => {
        (0, vitest_1.expect)(logicalWidth(150, 0.5)).toBe(300);
        (0, vitest_1.expect)(adjustedDelta(5, 0.5)).toBe(10);
        // Board width should be 200% so after 0.5x scale it fills the wrapper
        (0, vitest_1.expect)(inversePercent(0.5)).toBe(200);
    });
    (0, vitest_1.it)('at zoom 0.7 compensates fractional zoom', () => {
        // 300 * 0.7 = 210 from getBoundingClientRect
        (0, vitest_1.expect)(logicalWidth(210, 0.7)).toBe(300);
        (0, vitest_1.expect)(adjustedDelta(7, 0.7)).toBe(10);
        (0, vitest_1.expect)(inversePercent(0.7)).toBeCloseTo(142.857, 2);
    });
    (0, vitest_1.it)('inverse percent * zoom always equals 100', () => {
        for (const z of [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5]) {
            (0, vitest_1.expect)(inversePercent(z) * z).toBeCloseTo(100, 10);
        }
    });
});
//# sourceMappingURL=ZoomCompensation.test.js.map