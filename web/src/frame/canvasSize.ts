export const CANVAS_W = 789;
export const CANVAS_H = 532;
const MIN_AUTO_W = 320;
export type SizeMode = '1' | '2' | '3' | 'auto';

export function computeCanvasSize(opts: { available: number; mode: SizeMode }): { width: number; height: number } {
  if (opts.mode !== 'auto') {
    const m = Number(opts.mode);
    return { width: CANVAS_W * m, height: CANVAS_H * m };
  }
  const width = Math.max(MIN_AUTO_W, Math.floor(opts.available));
  return { width, height: Math.round(width * CANVAS_H / CANVAS_W) };
}

export function applyCanvasSize(canvas: HTMLCanvasElement, size: { width: number; height: number }, filter: 'auto' | 'pixelated'): void {
  canvas.style.width = `${size.width}px`;
  canvas.style.height = `${size.height}px`;
  canvas.style.imageRendering = filter;
}

/**
 * Sizes one character's iframe. The canvas inside `play.html` keeps the 789x532 aspect of its
 * own element box (CSS `aspect-ratio`, limited by whichever of width or height binds) and its
 * native 789x532 backing store, so the client's own coordinate space -- and every e2e mouse
 * calculation -- is unchanged.
 */
export function applyFrameSize(iframe: HTMLIFrameElement, size: { width: number; height: number }, filter: 'auto' | 'pixelated'): void {
  iframe.style.width = `${size.width}px`;
  iframe.style.height = `${size.height}px`;
  const canvas = iframe.contentDocument?.getElementById('canvas') as HTMLCanvasElement | null;
  if (canvas) canvas.style.imageRendering = filter;
}
