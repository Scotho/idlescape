import { describe, expect, test } from 'vitest';
import { computeCanvasSize } from './canvasSize';

describe('computeCanvasSize', () => {
  test('fixed multiples ignore available width', () => {
    expect(computeCanvasSize({ available: 400, mode: '1' })).toEqual({ width: 789, height: 532 });
    expect(computeCanvasSize({ available: 400, mode: '2' })).toEqual({ width: 1578, height: 1064 });
  });
  test('auto fills available width and keeps the ratio', () => {
    const s = computeCanvasSize({ available: 1000, mode: 'auto' });
    expect(s.width).toBe(1000);
    expect(s.height).toBe(Math.round(1000 * 532 / 789));
  });
  test('auto never goes below 1x on tiny widths? no: it shrinks, min 320', () => {
    expect(computeCanvasSize({ available: 100, mode: 'auto' }).width).toBe(320);
  });
});

import { applyFrameSize } from './canvasSize';

describe('applyFrameSize', () => {
  test('sizes the iframe and passes the filter down to the inner canvas', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const canvas = iframe.contentDocument!.createElement('canvas');
    canvas.id = 'canvas';
    iframe.contentDocument!.body.appendChild(canvas);
    applyFrameSize(iframe, { width: 800, height: 539 }, 'pixelated');
    expect(iframe.style.width).toBe('800px');
    expect(iframe.style.height).toBe('539px');
    expect(canvas.style.imageRendering).toBe('pixelated');
    iframe.remove();
  });

  test('is a no-op on a frame whose document is not reachable yet', () => {
    const iframe = document.createElement('iframe');
    expect(() => applyFrameSize(iframe, { width: 100, height: 67 }, 'auto')).not.toThrow();
    expect(iframe.style.width).toBe('100px');
  });
});
