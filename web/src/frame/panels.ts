import { icon, type IconName } from '../ui/icon';
import type { PanelId } from '../types';

export interface PanelView { title: string; mount(body: HTMLElement): void; unmount?(): void }
export interface PluginManifest { id: PanelId; name: string; icon: IconName; tier: 'shell' }
const STORAGE_KEY = 'cs.panel';

/**
 * Panel ids that no longer exist, and where their players should land instead.
 *
 * This is permanent, not a migration step: `cs.panel` is only ever rewritten by a successful
 * `open()`, so a browser that has not been used since before the Characters merge can arrive at
 * any time, for as long as the key exists. Adding an entry here is cheaper than the alternative,
 * which is a player whose shell silently opens no panel at all.
 */
export const PANEL_ALIASES: Record<string, PanelId> = { characters: 'account' };

/**
 * Mirrors the open panel's glyph into the side-panel header (`#panel-icon`), or empties it when no
 * panel is open. It DRAWS the glyph: the name is a display name, so `host.textContent = m.icon`
 * paints the word "automation" in the header and looks close enough to pass a glance. It lives
 * here rather than in `main.ts`'s module body, which no unit test can execute; Task 9 of the shell
 * v2 plan recorded that as an open coverage gap and this is it closed.
 */
export function paintPanelIcon(host: HTMLElement, manifest: { icon: IconName } | undefined): void {
  host.replaceChildren(...(manifest ? [icon(manifest.icon)] : []));
}

const PANEL_ID_LIST = ['tasks', 'connect', 'xp', 'loot', 'events', 'notes', 'screenshot', 'bank', 'marketplace', 'account', 'plugins', 'config'] as const;

/**
 * Every id `views` can hold, as data, so an arbitrary stored string can be narrowed and not
 * asserted.
 *
 * The annotation is a conditional rather than a plain `readonly PanelId[]` because the plain one
 * catches half of the drift and reads as if it caught all of it. It catches an id DELETED from
 * `PanelId`; it says nothing about an id ADDED to it, and an added id (Task 12's Events, sprint
 * 3's panels) that never reaches this list can be registered, opened, written to `cs.panel` and
 * then silently never restore, with every suite green. `Exclude` is `never` exactly when the list
 * covers the union; when it is not, the declared type here is `never`, the initialiser does not
 * fit it, and the omission is a compile error on this line. The list is still assigned to
 * `readonly PanelId[]`, so a typo'd id that is in no union is an error too, and
 * `registerPanels.test.ts` pins the same set at runtime against what the shell registers.
 */
export const PANEL_IDS: [Exclude<PanelId, (typeof PANEL_ID_LIST)[number]>] extends [never] ? readonly PanelId[] : never = PANEL_ID_LIST;

export function createPluginRegistry(opts: { strip: HTMLElement; panel: HTMLElement; title: HTMLElement; body: HTMLElement; onChange?: (open: PanelId | null) => void }) {
  const views = new Map<PanelId, PanelView>();
  const registered: PluginManifest[] = [];
  let current: PanelId | null = null;

  function setActive(id: PanelId | null): void {
    for (const btn of Array.from(opts.strip.querySelectorAll<HTMLElement>('[data-panel]'))) {
      btn.classList.toggle('active', btn.dataset.panel === id);
    }
  }

  function close(): void {
    if (current) views.get(current)?.unmount?.();
    current = null;
    opts.body.replaceChildren();
    opts.panel.classList.add('hidden');
    setActive(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage blocked */ }
    opts.onChange?.(null);
  }

  function open(id: PanelId): void {
    const view = views.get(id);
    if (!view) return;
    if (current) views.get(current)?.unmount?.();
    current = id;
    opts.body.replaceChildren();
    opts.title.textContent = view.title;
    view.mount(opts.body);
    opts.panel.classList.remove('hidden');
    setActive(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* storage blocked */ }
    opts.onChange?.(id);
  }

  opts.strip.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-panel]');
    if (btn?.dataset.panel) toggle(btn.dataset.panel as PanelId);
  });

  function toggle(id: PanelId): void { if (current === id) { close(); } else { open(id); } }

  return {
    open, close, toggle,
    current: () => current,
    manifests: (): PluginManifest[] => [...registered],
    register(manifest: PluginManifest, view: PanelView) {
      const i = registered.findIndex(m => m.id === manifest.id);
      if (i >= 0) registered[i] = manifest; else registered.push(manifest);
      views.set(manifest.id, view);
    },
    restore() {
      let saved: string | null = null;
      try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* storage blocked */ }
      if (!saved) return;
      // The stored value is an arbitrary string out of an old browser, so it is narrowed through
      // `PANEL_IDS` rather than asserted: `saved as PanelId` is exactly the lie that let a
      // deleted id through. Both directions of drift are compile errors where `PANEL_IDS` is
      // declared, so this narrowing cannot quietly reject an id the shell really registers.
      const aliased = PANEL_ALIASES[saved] ?? saved;
      const id = PANEL_IDS.find(p => p === aliased) ?? null;
      if (id !== null && views.has(id)) open(id);
    }
  };
}
