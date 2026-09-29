// web/src/ui/parts.ts -- the shell v2 component library's stateful half, as h() builders.
//
// One builder per component that carries variants or state; a component that is only a class
// (Tag, SectionLabel) still gets one so no surface hand-writes the class name. Every class here
// is defined in exactly one family stylesheet; see web/src/styles/families.ts.
import { h, type Child } from './el';

export type DotTone = 'idle' | 'ok' | 'accent' | 'warn' | 'error';

/** Uppercase 9.5px group heading. `docs/design/idlescape-shell-v2/components/core/SectionLabel.jsx`. */
export function sectionLabel(text: string): HTMLElement {
  return h('span', { class: 'section-label' }, text);
}

/** A quiet noun. Not a status: use `badge()` from el.ts for state. `core/Tag.jsx`. */
export function tag(text: string): HTMLElement {
  return h('span', { class: 'tag' }, text);
}

/**
 * The status dot. `size` is the mock's per-site override (9 in the co-pilot bar, 8 in the Claude
 * session rows, 7 on a character tab, 6 in the strip corner); the class carries the 8px default,
 * so an unsized dot has no inline style at all.
 */
export function dot(
  tone: DotTone = 'idle',
  opts: { pulse?: boolean; glow?: boolean; size?: number; explicit?: boolean } = {}
): HTMLElement {
  const classes = ['dot'];
  // `idle` is the default and takes the family's own --text-faint grey. `explicit` opts into the
  // mock's lighter #666, which only the co-pilot bar's unpaired dot uses (map-design 3.3).
  if (tone !== 'idle' || opts.explicit) classes.push(`dot-${tone}`);
  if (opts.pulse) classes.push('dot-pulse');
  if (opts.glow) classes.push('dot-glow');
  const el = h('span', { class: classes.join(' '), 'aria-hidden': 'true' });
  if (opts.size !== undefined) { el.style.width = `${opts.size}px`; el.style.height = `${opts.size}px`; }
  return el;
}

export interface SegmentedOption { value: string; label: string }

/**
 * The segmented control. `components/forms/Segmented.jsx`, signature from README's component
 * table. It reports and does not repaint: the owner re-renders with the new value, exactly as
 * every panel in this shell already does, so there is never a moment when the control's idea of
 * the selection and the panel's disagree. Clicking the active option is a no-op.
 */
export function segmented(
  options: readonly SegmentedOption[],
  value: string,
  onChange: (value: string) => void
): HTMLElement {
  return h('div', { class: 'seg', role: 'group' },
    ...options.map(o => h('button', {
      type: 'button',
      class: o.value === value ? 'seg-btn active' : 'seg-btn',
      'aria-pressed': o.value === value ? 'true' : 'false',
      'data-seg': o.value,
      onclick: () => { if (o.value !== value) onChange(o.value); }
    }, o.label))
  );
}

/** A multi-select filter chip. Unlike `segmented`, every click fires: it is its own toggle. */
export function chip(label: string, active: boolean, onToggle: () => void): HTMLButtonElement {
  return h('button', {
    type: 'button',
    class: active ? 'chip active' : 'chip',
    'aria-pressed': active ? 'true' : 'false',
    onclick: onToggle
  }, label);
}

export type Rail = 'accent' | 'ok' | 'warn' | 'error';
export type MeterTone = 'accent' | 'flat' | 'hp' | 'prayer' | 'run';

/**
 * `components/data/Card.jsx`. `hero` is the gradient plus drop shadow the run card uses. The
 * caller class goes last so a surface can beat both modifiers at equal specificity; that is the
 * only ordering in the list that carries meaning.
 */
export function card(opts: { rail?: Rail; hero?: boolean; class?: string } = {}, ...children: Child[]): HTMLElement {
  const classes = ['card'];
  if (opts.hero) classes.push('card-hero');
  if (opts.rail) classes.push(`card-rail-${opts.rail}`);
  if (opts.class) classes.push(opts.class);
  return h('div', { class: classes.join(' ') }, ...children);
}

/**
 * `components/data/Meter.jsx`. Purely decorative: every meter in this shell sits beside the same
 * number written out in text, so the track carries aria-hidden rather than a redundant
 * progressbar role that a screen reader would read twice. `accent` names no class because the
 * bare `.meter-fill` already is it.
 *
 * `flat` is the fifth tone the plan's Step 3 CSS block writes and its Step 2 signature left
 * out: the mock's bank capacity bar (map-design 2.15) is the accent at one stop instead of
 * the component's three, and without the name here no caller could reach `.meter-flat`
 * through the library at all.
 */
export function meter(pct: number, opts: { tone?: MeterTone; shimmer?: boolean } = {}): HTMLElement {
  const classes = ['meter-fill'];
  if (opts.tone && opts.tone !== 'accent') classes.push(`meter-${opts.tone}`);
  if (opts.shimmer) classes.push('shimmer');
  const fill = h('span', { class: classes.join(' ') });
  fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  return h('div', { class: 'meter', 'aria-hidden': 'true' }, fill);
}

export type PillTone = 'accent' | 'ok' | 'warn' | 'error' | 'neutral';

/**
 * The only language spoken over the game canvas (`components/overlay/OverlayPill.prompt.md`).
 * Every tone names itself, the default included: a bare `.ov-pill` is already the neutral grey.
 * `corner` is the larger geometry the mock uses for the two canvas corner pills (3px 8px at 11px)
 * against the component's own 2px 7px at 10.5px; both ship, per map-design note S20.
 */
export function pill(text: string, tone: PillTone = 'accent', opts: { corner?: boolean } = {}): HTMLElement {
  const classes = ['ov-pill', `ov-pill-${tone}`];
  if (opts.corner) classes.push('ov-pill-corner');
  return h('span', { class: classes.join(' ') }, text);
}

const HUD_LABEL = { hp: 'HP', prayer: 'PRAY', run: 'RUN' } as const;

/**
 * `components/overlay/HudPill.jsx`: an OverlayPill with a 42x4 bar between label and value. The
 * bar is decoration, so it is aria-hidden and the pill carries the whole reading as one label;
 * a screen reader that walked the parts would say "HP", then nothing, then "14/18".
 */
export function hudPill(meterName: 'hp' | 'prayer' | 'run', pct: number, value: string): HTMLElement {
  const label = HUD_LABEL[meterName];
  const fill = h('span', { class: `hud-fill hud-fill-${meterName}` });
  fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  return h('span', { class: `ov-pill hud-pill hud-pill-${meterName}`, 'aria-label': `${label} ${value}` },
    h('span', { class: 'hud-label' }, label),
    h('span', { class: 'hud-bar', 'aria-hidden': 'true' }, fill),
    h('span', { class: 'hud-value' }, value)
  );
}

export interface MenuItem { label: string; onSelect(): void; disabled?: boolean }

/**
 * The markup of a floating menu, and nothing else. It is `role="menu"` with `role="menuitem"`
 * children so the consumer that opens it inherits the right semantics, and it wires each item's
 * click. It deliberately does NOT position itself, bind a document click-away, trap or restore
 * focus, or handle keys: that half is sprint 3 entry 10's `frame/contextMenu.ts`, which composes
 * these classes (decision D88, and Task 7 Step 5 of the shell v2 plan says why).
 */
export function menu(items: readonly MenuItem[]): HTMLElement {
  return h('div', { class: 'menu', role: 'menu' }, ...items.map(item =>
    h('button', { class: 'menu-item', type: 'button', role: 'menuitem', disabled: item.disabled === true, onclick: () => item.onSelect() }, item.label)
  ));
}

/**
 * The two empty-state patterns (plan ruling R15). The default is the loot pattern README calls
 * "the pattern for all empty states"; `compact` is the Events one, which differs on all eight of
 * its metrics and, notably, does not bob. `mark` is a Unicode glyph used as data, per the brand
 * guide: the loot state's is `◌` and the Events state's is `⌕`.
 */
export function emptyState(
  mark: string, title: string, copy: string,
  action: HTMLElement | null = null,
  opts: { compact?: boolean } = {}
): HTMLElement {
  return h('div', { class: opts.compact ? 'empty-state compact' : 'empty-state' },
    h('span', { class: 'empty-state-mark', 'aria-hidden': 'true' }, mark),
    h('b', { class: 'empty-state-title' }, title),
    h('span', { class: 'empty-state-copy' }, copy),
    action
  );
}
