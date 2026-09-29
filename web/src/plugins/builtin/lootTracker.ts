// web/src/plugins/builtin/lootTracker.ts -- the v2 Loot panel (map-design 3.11).
//
// The mock draws this panel in exactly one state, its empty one, and calls that the pattern for
// every empty state in the shell: a bobbing dashed circle, a title, the copy, and one primary CTA
// that sends the player to Automation. The populated list is not drawn anywhere in the mock, so it
// composes the library rather than inventing a shape: the same header row the XP panel uses, and
// one `kv()` per item. Same 2 s timer as before, same wholesale repaint.
import { definePlugin, type PluginContext, type ShellPlugin } from '../types';
import { createLootLog } from '../../stats/loot';
import { LOOT_EMPTY_COPY } from '../../ui/copy';
import { h, kv } from '../../ui/el';
import { emptyState } from '../../ui/parts';
import type { PanelView } from '../../frame/panels';

const REFRESH_MS = 2000;

/** `log` is a getter: the shell hands over whichever character is active (SP7). */
export function createLootTrackerPlugin(log: () => ReturnType<typeof createLootLog>): ShellPlugin {
  function panel(ctx: PluginContext): PanelView {
    let timer: ReturnType<typeof setInterval> | null = null;

    function render(body: HTMLElement): void {
      const entries = [...log().entries()].sort((a, b) => b.firstSeen - a.firstSeen);
      if (entries.length === 0) {
        body.replaceChildren(emptyState('◌', 'Nothing looted yet', LOOT_EMPTY_COPY,
          h('button', {
            class: 'btn btn-primary btn-cta', type: 'button',
            onclick: () => ctx.openPanel('tasks')
          }, 'Run a script')));
        return;
      }
      const count = entries.reduce((n, e) => n + e.count, 0);
      body.replaceChildren(
        h('div', { class: 'loot-head' },
          h('span', { class: 'loot-count' }, `${count.toLocaleString()} in ${entries.length.toLocaleString()} stacks`),
          h('button', { class: 'btn btn-outline btn-quiet', type: 'button', 'data-loot-reset': '' }, 'Reset')),
        h('div', { class: 'loot-list' }, ...entries.map(e =>
          kv(ctx.client()?.getObjName(e.id) ?? `#${e.id}`, `x${e.count.toLocaleString()}`, { num: true })))
      );
    }

    // The same shared `#panel-body` the XP panel takes, and the same abort: see the note in
    // xpTracker.ts. A listener left on unmount here fires the Reset handler once per past open.
    let abort: AbortController | null = null;

    return {
      title: 'Loot Tracker',
      mount(body) {
        render(body);
        abort = new AbortController();
        body.addEventListener('click', e => {
          if ((e.target as HTMLElement).closest('[data-loot-reset]')) { log().reset(); render(body); }
        }, { signal: abort.signal });
        timer = setInterval(() => render(body), REFRESH_MS);
      },
      unmount() {
        if (timer !== null) { clearInterval(timer); timer = null; }
        abort?.abort();
        abort = null;
      }
    };
  }

  return definePlugin({
    manifest: {
      id: 'loot', name: 'Loot Tracker', icon: 'loot', tier: 'shell',
      description: 'Items gained this session.',
      defaultEnabled: true
    },
    panel
  });
}
