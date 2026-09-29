// web/src/plugins/builtin/screenshot.test.ts
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createScreenshotPlugin } from './screenshot';
import type { PluginContext } from '../types';

function ctx(): PluginContext {
  return {
    client: () => null,
    settings: { get: (() => undefined) as PluginContext['settings']['get'], set: vi.fn(), subscribe: () => () => {} },
    storage: { get: () => null, set: () => {} },
    notify: vi.fn(), openPanel: vi.fn(), user: () => null
  };
}

/** jsdom has neither createObjectURL nor a working anchor download; both are stubbed per test. */
function stubUrls(): void {
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:stub');
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
}

/** Every href an `<a download>` was clicked with, in order. */
function recordDownloads(): string[] {
  const hrefs: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    hrefs.push(this.getAttribute('href') ?? '');
  });
  return hrefs;
}

function stubCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const blob = new Blob(['x'], { type: 'image/png' });
  canvas.toBlob = ((cb: (b: Blob | null) => void) => cb(blob)) as HTMLCanvasElement['toBlob'];
  return canvas;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('screenshot plugin', () => {
  test('manifest is a shell plugin, off by default', () => {
    const p = createScreenshotPlugin();
    expect(p.manifest.id).toBe('screenshot');
    expect(p.manifest.defaultEnabled).toBeUndefined();
  });

  test('capture calls toBlob on the provided canvas and adds a thumbnail', async () => {
    const canvas = stubCanvas();
    stubUrls();
    const createURL = URL.createObjectURL as unknown as ReturnType<typeof vi.fn>;

    const p = createScreenshotPlugin({ canvas: () => canvas });
    const body = document.createElement('div');
    p.panel!(ctx()).mount(body);
    body.querySelector<HTMLButtonElement>('[data-shot-capture]')!.click();
    await Promise.resolve();
    expect(createURL).toHaveBeenCalledTimes(1);
    expect(body.querySelectorAll('img.shot-thumb').length).toBe(1);
  });

  test('capture with no canvas notifies instead of throwing', () => {
    const c = ctx();
    const p = createScreenshotPlugin({ canvas: () => null });
    const body = document.createElement('div');
    p.panel!(c).mount(body);
    body.querySelector<HTMLButtonElement>('[data-shot-capture]')!.click();
    expect(c.notify).toHaveBeenCalled();
  });

  // map-design 3.17: the call to action is panel width, and the caption states both the cap and
  // the interaction. Both are literals the panel had neither of before Task 20.
  test('the panel ships the mock call to action and the caption that explains the grid', () => {
    stubUrls();
    const p = createScreenshotPlugin({ canvas: () => stubCanvas() });
    const body = document.createElement('div');
    p.panel!(ctx()).mount(body);
    const button = body.querySelector<HTMLButtonElement>('[data-shot-capture]')!;
    expect(button.textContent).toBe('Capture the canvas');
    expect(button.className).toBe('btn btn-primary btn-lg btn-block btn-cta');
    expect(body.querySelector('.shot-note')!.textContent).toBe('Keeps the last 10. Click a thumbnail to download.');
  });

  // The caption promises this, so it is behaviour and not decoration.
  test('clicking a thumbnail downloads that capture again', async () => {
    stubUrls();
    const hrefs = recordDownloads();
    const p = createScreenshotPlugin({ canvas: () => stubCanvas() });
    const body = document.createElement('div');
    p.panel!(ctx()).mount(body);

    body.querySelector<HTMLButtonElement>('[data-shot-capture]')!.click();
    await Promise.resolve();
    expect(hrefs).toEqual(['blob:stub']);

    body.querySelector<HTMLImageElement>('img.shot-thumb')!.click();
    expect(hrefs).toEqual(['blob:stub', 'blob:stub']);
  });

  // `frame/panels.ts` hands every panel the SAME `#panel-body`, so a listener that outlives its
  // mount fires once per past open: one Capture click, two captures.
  test('unmount releases the click listener, so a reopen captures once and not twice', async () => {
    stubUrls();
    recordDownloads();
    const canvas = stubCanvas();
    const toBlob = vi.spyOn(canvas, 'toBlob');
    const view = createScreenshotPlugin({ canvas: () => canvas }).panel!(ctx());

    const body = document.createElement('div');
    view.mount(body);
    view.unmount?.();
    view.mount(body);

    body.querySelector<HTMLButtonElement>('[data-shot-capture]')!.click();
    await Promise.resolve();
    expect(toBlob).toHaveBeenCalledTimes(1);
  });
});
