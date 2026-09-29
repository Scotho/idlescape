// web/src/plugins/pluginsPanel.ts
import type { PanelView } from '../frame/panels';
import type { ShellPluginRegistry } from './registry';
import type { PluginManifest, SettingsValues } from './types';
import { renderSettingsForm } from './settingsForm';
import { escapeHtml } from '../dom';
import { iconHtml } from '../ui/icon';

export function createPluginsPanel(reg: ShellPluginRegistry, currentSettings: (id: string) => SettingsValues): PanelView {
  let root: HTMLElement | null = null;
  let filter = '';
  const open = new Set<string>();
  // `frame/panels.ts` hands every panel the SAME `#panel-body`, so a listener added in mount() and
  // never removed survives the close and fires once per past open. Two surviving gear handlers
  // toggle `open` twice and the settings form never appears; two change handlers call
  // reg.enable/disable twice. One controller per mount, aborted in unmount(), like screenshot.ts.
  let abort: AbortController | null = null;

  function rowMarkup(m: PluginManifest): string {
    const on = reg.isEnabled(m.id) || m.alwaysOn === true;
    const toggle = m.alwaysOn
      ? `<span class="muted">always on</span><input class="switch" type="checkbox" data-toggle="${escapeHtml(m.id)}" checked disabled aria-label="${escapeHtml(m.name)} is always on" />`
      : `<input class="switch" type="checkbox" data-toggle="${escapeHtml(m.id)}" ${on ? 'checked' : ''} aria-label="Enable ${escapeHtml(m.name)}" />`;
    // The last font glyph in the shell was this button's `gear`; Task 9 drew the eleven-icon set
    // and Task 20 owns the retirement, so it is `icon('config')` like every other glyph now.
    const gear = m.settings ? `<button class="btn btn-icon" type="button" data-gear="${escapeHtml(m.id)}" title="Settings" aria-label="${escapeHtml(m.name)} settings">${iconHtml('config', 14)}</button>` : '';
    return `<div class="plugin-row" data-row="${escapeHtml(m.id)}">
      <span class="plugin-icon">${iconHtml(m.icon)}</span>
      <div class="plugin-main"><div class="plugin-name">${escapeHtml(m.name)}</div>
      <div class="plugin-desc muted">${escapeHtml(m.description)}</div></div>
      <div class="plugin-controls">${gear}${toggle}</div>
      <div class="plugin-settings" data-settings="${escapeHtml(m.id)}" hidden></div>
    </div>`;
  }

  function render(): void {
    if (!root) return;
    const list = reg.manifests().filter(m => m.name.toLowerCase().includes(filter) || m.id.includes(filter));
    // `.plugin-panel` is a container of its own and not the panel body: map-design 3.18 draws this
    // one panel on a 6px rhythm where every other panel is on `.panel-body`'s 10px.
    root.innerHTML = `<div class="plugin-panel">
      <input class="input input-lg" type="search" data-plugins-search placeholder="Search plugins" aria-label="Search plugins" value="${escapeHtml(filter)}" />
      <div class="plugin-list">${list.map(rowMarkup).join('')}</div>
    </div>`;
    for (const m of list) {
      if (open.has(m.id) && m.settings) {
        const host = Array.from(root.querySelectorAll<HTMLElement>('[data-settings]')).find(el => el.dataset.settings === m.id)!;
        host.hidden = false;
        host.appendChild(renderSettingsForm(m.settings, currentSettings(m.id), (key, value) => reg.setSetting(m.id, key, value)));
      }
    }
  }

  return {
    title: 'Plugins',
    mount(body) {
      root = body;
      abort = new AbortController();
      const { signal } = abort;
      body.addEventListener('input', e => {
        const s = (e.target as HTMLElement).closest<HTMLInputElement>('[data-plugins-search]');
        if (!s) return;
        filter = s.value.trim().toLowerCase();
        render();
        // render() replaced the body, so `s` is detached; focus the fresh input and keep the caret at the end.
        const fresh = root?.querySelector<HTMLInputElement>('[data-plugins-search]');
        if (fresh) { fresh.focus(); const end = fresh.value.length; fresh.setSelectionRange(end, end); }
      }, { signal });
      body.addEventListener('change', async e => {
        const t = (e.target as HTMLElement).closest<HTMLInputElement>('[data-toggle]');
        if (!t) return;
        const id = t.dataset.toggle!;
        if (t.checked) await reg.enable(id); else reg.disable(id);
        render();
      }, { signal });
      body.addEventListener('click', e => {
        const g = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-gear]');
        if (!g) return;
        const id = g.dataset.gear!;
        if (open.has(id)) open.delete(id); else open.add(id);
        render();
      }, { signal });
      render();
    },
    unmount() {
      abort?.abort();
      abort = null;
      root = null;
      open.clear();
    }
  };
}
