// web/src/ui/strip.ts -- the icon strip: what it is made of, and how it behaves as a tab list.

import { h } from './el';
import { icon, type IconName } from './icon';

/** The manifest fields the strip actually draws. `PluginManifest` from either package satisfies it. */
export interface StripEntry { id: string; name: string; icon: IconName }

// The mock groups the strip (map-design section 3.20): Automation and Claude, then the trackers
// and the tools, then the account surfaces, then the two system panels pinned to the bottom.
const SEP_AFTER = new Set(['connect', 'screenshot']);
const TAIL = new Set(['plugins', 'config']);

/**
 * The strip's children in order: one button per entry, a hairline after each group, and the
 * `flex` spacer that pushes the bottom group down.
 *
 * Both are decided by POSITION. The spacer rides on the FIRST button of the bottom group, because
 * hanging it off Configuration (which is what `.strip-gear` did before Task 9) leaves Plugins up
 * with Bank and Account. A separator is only drawn when a button follows it, which `some(n => n.id
 * !== m.id)` cannot express: that is true of any list longer than one.
 */
export function buildStrip(entries: readonly StripEntry[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  let tailSeen = false;
  entries.forEach((m, i) => {
    const tail = TAIL.has(m.id) && !tailSeen;
    if (tail) tailSeen = true;
    const btn = h('button', { type: 'button', class: tail ? 'strip-btn strip-tail' : 'strip-btn', title: m.name }, icon(m.icon));
    btn.dataset.panel = m.id;
    out.push(btn);
    if (SEP_AFTER.has(m.id) && i < entries.length - 1) out.push(h('span', { class: 'strip-sep', 'aria-hidden': 'true' }));
  });
  return out;
}

/**
 * Makes a strip of `[data-panel]` buttons behave like a tab list: roles, `aria-selected`
 * mirrored from `.active`, and arrow/Home/End keys moving focus. Call once on the strip
 * element; `syncSelected` after the active button changes.
 */
export function applyTabListA11y(strip: HTMLElement): { syncSelected(): void } {
  strip.setAttribute('role', 'tablist');
  strip.setAttribute('aria-orientation', 'vertical');

  const tabs = (): HTMLElement[] => Array.from(strip.querySelectorAll<HTMLElement>('[data-panel]'));

  function syncSelected(): void {
    for (const tab of tabs()) {
      tab.setAttribute('role', 'tab');
      const active = tab.classList.contains('active');
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
      if (tab.title && !tab.dataset.tip) { tab.dataset.tip = tab.title; tab.setAttribute('aria-label', tab.title); tab.removeAttribute('title'); }
    }
    // Something must be reachable by Tab even when no panel is open.
    const list = tabs();
    if (list.length && !list.some(t => t.tabIndex === 0)) list[0].tabIndex = 0;
  }

  strip.addEventListener('keydown', ev => {
    const list = tabs();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (i < 0 || list.length === 0) return;
    let next = -1;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') next = (i + 1) % list.length;
    else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') next = (i - 1 + list.length) % list.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = list.length - 1;
    if (next < 0) return;
    ev.preventDefault();
    list[next].focus();
  });

  syncSelected();
  return { syncSelected };
}
