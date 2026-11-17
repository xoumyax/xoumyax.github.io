import { test, expect } from 'vitest';
import { classifyWheel, classifyTouch, overOf, wheelZoomFactor } from '../../src/world/input';

const k = (o: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => ({ ctrlKey: false, metaKey: false, shiftKey: false, ...o });

test('plain wheel is native scroll everywhere', () => {
  expect(classifyWheel(k(), 'world')).toBe('native');
  expect(classifyWheel(k(), 'card-row')).toBe('native');
  expect(classifyWheel(k(), 'content')).toBe('native');
  expect(classifyWheel(k({ shiftKey: true }), 'card-row')).toBe('native');
  expect(classifyWheel(k({ shiftKey: true }), 'world')).toBe('native');
});

test('ctrl/⌘ + wheel (and trackpad pinch) zooms only over open world', () => {
  expect(classifyWheel(k({ ctrlKey: true }), 'world')).toBe('zoom');
  expect(classifyWheel(k({ metaKey: true }), 'world')).toBe('zoom');
  expect(classifyWheel(k({ ctrlKey: true }), 'card-row')).toBe('browser');
  expect(classifyWheel(k({ ctrlKey: true }), 'content')).toBe('browser');
});

test('touch: vertical swipe scrolls, horizontal drag on open world orbits, two fingers zoom', () => {
  expect(classifyTouch({ touches: 1, dx: 2, dy: 30 }, 'world')).toBe('native');
  expect(classifyTouch({ touches: 1, dx: 30, dy: 3 }, 'world')).toBe('orbit');
  expect(classifyTouch({ touches: 1, dx: -30, dy: 3 }, 'world')).toBe('orbit');
  expect(classifyTouch({ touches: 2, dx: 0, dy: 0 }, 'world')).toBe('zoom');
  expect(classifyTouch({ touches: 1, dx: 30, dy: 3 }, 'card-row')).toBe('native');
  expect(classifyTouch({ touches: 1, dx: 30, dy: 3 }, 'content')).toBe('native');
  expect(classifyTouch({ touches: 2, dx: 0, dy: 0 }, 'card-row')).toBe('browser');
  expect(classifyTouch({ touches: 2, dx: 0, dy: 0 }, 'content')).toBe('browser');
});

test('touch: a diagonal drag stays native (scroll wins ties)', () => {
  expect(classifyTouch({ touches: 1, dx: 20, dy: 20 }, 'world')).toBe('native');
});

// A stand-in for Element.closest over a chain of fake nodes.
function node(chain: string[]) {
  return { closest: (sel: string) => (sel.split(',').some((s) => chain.includes(s.trim())) ? {} : null) };
}

test('overOf: card rows, panels and chrome are not open world', () => {
  expect(overOf(node(['[data-card-row]', '[data-panel]']))).toBe('card-row');
  expect(overOf(node(['[data-panel]']))).toBe('content');
  expect(overOf(node(['header']))).toBe('content');
  expect(overOf(node(['footer']))).toBe('content');
  expect(overOf(node(['#landmarks', 'a']))).toBe('world');
  expect(overOf(node([]))).toBe('world');
  expect(overOf(null)).toBe('world');
  expect(overOf({})).toBe('world'); // window or document as target
});

test('wheelZoomFactor: wheel up zooms in, down zooms out, lines scale like pixels', () => {
  expect(wheelZoomFactor(-100, 0)).toBeGreaterThan(1);
  expect(wheelZoomFactor(100, 0)).toBeLessThan(1);
  expect(wheelZoomFactor(100, 0) * wheelZoomFactor(-100, 0)).toBeCloseTo(1, 6);
  expect(wheelZoomFactor(3, 1)).toBeCloseTo(wheelZoomFactor(48, 0), 6);
});
