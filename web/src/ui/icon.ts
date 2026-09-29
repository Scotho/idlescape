// web/src/ui/icon.ts -- the one drawn icon set. 16x16, currentColor, 1.5px stroke, geometric.
//
// The glyph names are DISPLAY names, not plugin ids: `automation` is plugin id `tasks` and
// `claude` is plugin id `connect`. Do not conflate this union with PanelId.
// Paths copied verbatim from docs/design/idlescape-shell-v2/components/core/Icon.jsx; the test
// diffs them against that file, so edit the bundle, never this list.

export type IconName =
  | 'automation' | 'claude' | 'xp' | 'loot' | 'events'
  | 'notes' | 'screenshot' | 'bank' | 'account' | 'plugins' | 'config';

export const ICON_NAMES: readonly IconName[] = [
  'automation', 'claude', 'xp', 'loot', 'events',
  'notes', 'screenshot', 'bank', 'account', 'plugins', 'config'
];

const GLYPHS: Record<IconName, string> = {
  automation: '<path d="M5 3.5 12 8 5 12.5 Z" fill="currentColor" stroke="none"/>',
  claude: '<path d="M8 1.5 9.7 6.3 14.5 8 9.7 9.7 8 14.5 6.3 9.7 1.5 8 6.3 6.3Z" fill="currentColor" stroke="none"/>',
  xp: '<polyline points="2,12.5 6,7.5 9,10 14,3.5"/>',
  loot: '<g><circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="1.8"/></g>',
  events: '<path d="M1.5 8.5h3l2-4.5 3 8 2-3.5h3"/>',
  notes: '<path d="M3.5 4.5h9M3.5 8h9M3.5 11.5h6"/>',
  screenshot: '<g><rect x="2" y="4.5" width="12" height="8.5" rx="1.5"/><circle cx="8" cy="8.7" r="2.2"/></g>',
  bank: '<g><path d="M2.5 6.5 8 3l5.5 3.5"/><path d="M4.5 8v3.5M8 8v3.5M11.5 8v3.5M2.5 13.5h11"/></g>',
  account: '<g><circle cx="5.5" cy="5.5" r="2.5"/><path d="M2 13.5c.7-2.8 2-4 3.5-4s2.8 1.2 3.5 4"/><circle cx="11" cy="6.5" r="2"/><path d="M11.5 9.6c1.3.3 2 1.5 2.4 3.9"/></g>',
  plugins: '<g><rect x="2.5" y="2.5" width="4.5" height="4.5"/><rect x="9" y="2.5" width="4.5" height="4.5"/><rect x="2.5" y="9" width="4.5" height="4.5"/><rect x="9" y="9" width="4.5" height="4.5" fill="currentColor" stroke="none"/></g>',
  config: '<g><path d="M2.5 5h1.6M7.8 5h5.7M2.5 11h5.7M12.1 11h1.4"/><circle cx="6" cy="5" r="1.7"/><circle cx="10.2" cy="11" r="1.7"/></g>'
};

const isIconName = (name: string): name is IconName => name in GLYPHS;

/**
 * One glyph as an `<svg>`. An unknown name falls back to `plugins` rather than rendering nothing,
 * so a third-party manifest can never produce a blank strip button (companion spec G7).
 *
 * `innerHTML` here is a static string from this module and never player input; the same pattern
 * is already used at frame/overlays.ts:2.
 */
export function icon(name: string, size = 16): SVGSVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('class', 'icon');
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  el.setAttribute('viewBox', '0 0 16 16');
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '1.5');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = GLYPHS[isIconName(name) ? name : 'plugins'];
  return el;
}

/** The same glyph as a markup string, for the panels that still build rows by `innerHTML`. */
export function iconHtml(name: string, size = 16): string {
  return icon(name, size).outerHTML;
}
