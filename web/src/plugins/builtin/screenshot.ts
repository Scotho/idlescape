// web/src/plugins/builtin/screenshot.ts
import { definePlugin, type PluginContext, type ShellPlugin } from '../types';
import type { PanelView } from '../../frame/panels';

const MAX_THUMBS = 10;

export function createScreenshotPlugin(deps: { canvas?: () => HTMLCanvasElement | null } = {}): ShellPlugin {
  const getCanvas = deps.canvas ?? (() => document.querySelector<HTMLCanvasElement>('#canvas'));

  function panel(ctx: PluginContext): PanelView {
    const urls: string[] = [];
    let strip: HTMLElement | null = null;
    // `frame/panels.ts` reuses ONE `#panel-body` element for every panel, so a listener added in
    // mount() and never removed accumulates one per open and fires capture() once per past open.
    let abort: AbortController | null = null;

    function download(url: string): void {
      const a = document.createElement('a');
      a.href = url;
      a.download = `idlescape-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    function addThumb(url: string): void {
      urls.unshift(url);
      while (urls.length > MAX_THUMBS) { const old = urls.pop()!; URL.revokeObjectURL(old); }
      if (strip) {
        strip.innerHTML = urls.map(u => `<img class="shot-thumb" src="${u}" alt="screenshot" />`).join('');
      }
    }

    function capture(): void {
      const canvas = getCanvas();
      if (!canvas) { ctx.notify('No game canvas to capture yet.', 'error'); return; }
      canvas.toBlob(blob => {
        if (!blob) { ctx.notify('Screenshot failed.', 'error'); return; }
        const url = URL.createObjectURL(blob);
        addThumb(url);
        download(url);
      }, 'image/png');
    }

    return {
      title: 'Screenshot',
      mount(body) {
        // map-design 3.17: one panel-width call to action, a two-column grid of 58px tiles, and a
        // caption that says what the grid keeps and what clicking a tile does. The click is wired
        // below, because a caption that promises a download and delivers nothing is worse copy
        // than no caption at all.
        body.innerHTML = `<button class="btn btn-primary btn-lg btn-block btn-cta" data-shot-capture>Capture the canvas</button>
          <div class="shot-strip" data-shot-strip></div>
          <span class="shot-note">Keeps the last 10. Click a thumbnail to download.</span>`;
        strip = body.querySelector<HTMLElement>('[data-shot-strip]');
        abort = new AbortController();
        body.addEventListener('click', e => {
          const target = e.target as HTMLElement;
          if (target.closest('[data-shot-capture]')) { capture(); return; }
          const thumb = target.closest<HTMLImageElement>('.shot-thumb');
          if (thumb) download(thumb.src);
        }, { signal: abort.signal });
      },
      unmount() {
        abort?.abort();
        abort = null;
        for (const u of urls) URL.revokeObjectURL(u);
        urls.length = 0;
        strip = null;
      }
    };
  }

  return definePlugin({
    manifest: {
      id: 'screenshot', name: 'Screenshot', icon: 'screenshot', tier: 'shell',
      description: 'Capture the game view and download a PNG.'
    },
    panel
  });
}
