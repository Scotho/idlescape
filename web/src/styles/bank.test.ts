// web/src/styles/bank.test.ts -- pins the bank stylesheet to the class contract the bank module
// actually emits (grid.ts, tabsBar.ts, contextMenu.ts, view.ts, bottomBar.ts, gridInput.ts), not
// to an assumed one. Three things drifted from the original design and are pinned here rather
// than by their original names:
//   - tabsBar.ts never sets an "active" class; it only flips aria-selected on the tab already in
//     the DOM, so the selected-tab selector below is `[aria-selected="true"]`, not `.active`.
//   - there is no `.bank-ctl` class anywhere in the bank module; the footer's controls are
//     `.bank-toggle` and `.bank-search`.
//   - shell v2 Task 17 moved the window's own chrome onto the shared family (D22), so the header
//     row is `.window-head` alone and the close is `btn btn-icon window-close`; neither has a
//     `.bank-*` name any more, and the only bank names left on that row are the three spans
//     inside it (`.bank-title`, `.bank-capacity`, `.bank-live`). `bank/view.test.ts` pins the
//     row's class list so a fourth cannot reappear unstyled and invisible to this file. The
//     footer lost the withdraw form, the 10 / X quantities, the magnifier toggle and the two
//     disabled deposit buttons, none of which the mock draws; the panel's info alert is where
//     owner decision 1 lives now.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// NOT `new URL(\`./${name}\`, import.meta.url)` as the brief originally had it: under this
// project's Vite/Vitest pipeline that exact AST shape is mistaken for a static asset reference
// (the "new URL(url, import.meta.url)" asset-bundling pattern) even though the path is a runtime
// template literal, and the rewrite silently drops the relative part -- both bank.css and
// index.css resolved back to this test file's own source. Building the path with node:path
// instead sidesteps that transform entirely.
const here = dirname(fileURLToPath(import.meta.url));
const read = (name: string): string => readFileSync(join(here, name), 'utf8');

describe('bank.css', () => {
  const css = read('layout/bank.css');

  it('is imported by the app stylesheet', () => {
    expect(read('index.css')).toContain("@import './layout/bank.css';");
  });

  it('styles every class the bank view emits', () => {
    for (const selector of [
      // The window and its header (view.ts)
      '.bank-host', '.bank-window', '.bank-title', '.bank-capacity', '.bank-live', '.bank-error',
      '.bank-body', '.bank-status',
      // The tab bar (tabsBar.ts) -- selection is aria-selected, not an "active" class
      '.bank-tabs', '.bank-tab', '.bank-tab[aria-selected="true"]', '.bank-tab-new', '.bank-tab-glyph', '.bank-tab-initials',
      // The item pane (grid.ts)
      '.bank-pane', '.bank-row', '.bank-slot', '.bank-slot-filler', '[data-bank-slot]', '.bank-icon', '.bank-fallback',
      '.bank-count', '.count-yellow', '.count-white', '.count-green',
      '.bank-divider', '.bank-empty', '.bank-slot.dim',
      // The drag and keyboard-held hooks gridInput.ts sets and previously left unstyled
      '.bank-pane.is-dragging', '.bank-pane.is-insert-mode', '.bank-slot.is-source', '.bank-slot.is-target', '.bank-slot.is-held',
      // The footer (bottomBar.ts) -- there is no .bank-ctl class in the real markup
      '.bank-bottom', '.bank-group', '.bank-toggle', '.bank-toggle[aria-pressed="true"]',
      '.bank-search', '.bank-note',
      // The Bank PANEL (plugins/builtin/bank.ts). Everything else it draws is a family part;
      // `.bank-meter` is the one class that is the bank's, and it carries map-design 3.13's tuck.
      '.bank-meter',
      // The context menu (contextMenu.ts)
      '.bank-menu', '.bank-menu-row', '.bank-menu-label', '.bank-menu-hint'
    ]) {
      expect(css, `${selector} has no rule`).toContain(selector);
    }
  });

  // Found by the browser, not by jsdom: .bank-host is pointer-events: none so a CLOSED bank
  // leaves the game canvas clickable, and the menu is a child of it. Without this declaration
  // the menu paints correctly and is completely unclickable.
  it('lets the pointer reach the context menu inside the pointer-transparent host', () => {
    // Comments are stripped first: the rule carries a long one, and a closing brace inside it
    // would silently narrow the slice to something that could never match.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const start = bare.indexOf('.bank-menu {');
    expect(start, 'no .bank-menu rule').toBeGreaterThan(-1);
    const rule = bare.slice(start, bare.indexOf('}', start));
    expect(rule).toMatch(/pointer-events:\s*auto/);
  });

  it('lays the pane out in exactly eight columns', () => {
    expect(css).toMatch(/grid-template-columns:\s*repeat\(8,/);
  });

  // D22: the bank is the window family's one modifier, and Task 7 wrote it. A rule here that
  // repainted the ground, the header gradient, the shadow, the radius or the placement would be
  // the per-surface one-off that split takes away, and the Script Studio composes the unmodified
  // default beside this.
  it('leaves the window family alone and declares only what is the bank\'s', () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const start = bare.indexOf('.bank-window {');
    expect(start, 'no .bank-window rule').toBeGreaterThan(-1);
    const rule = bare.slice(start, bare.indexOf('}', start));
    for (const property of ['background', 'box-shadow', 'border-radius', 'transform', 'left', 'top', 'animation', 'z-index']) {
      expect(rule, `.bank-window writes ${property}, which .window or .window-warm already owns`).not.toMatch(new RegExp(`(^|;|\\{)\\s*${property}\\s*:`));
    }
  });

  it('gives real, addressable cells a different chrome selector than the shared filler sizing', () => {
    // A filler cell keeps the bare `.bank-slot` class for its 48 x 36 pitch but is never the
    // target of the real-cell border, background and hover rules, which must key off the
    // attribute only the real cells carry.
    expect(css).toContain('[data-bank-slot] {');
  });

  it('takes its colours from the design tokens, not from raw hex', () => {
    // Ruling R18 turned the mock's untokenised bank hexes into the --bank-* and --count-* tokens,
    // so the only literal left is the white count tone, which no token names.
    const hexes = new Set(css.match(/#[0-9a-fA-F]{3,8}/g) ?? []);
    const allowed = new Set(['#ffffff']);
    expect([...hexes].filter(hex => !allowed.has(hex.toLowerCase()))).toEqual([]);
  });

  // The pre-v2 host sat at `calc(var(--z-dialog) - 1)`, which is 49: above everything but a
  // <dialog>, and above the trace pop-out, which is the opposite of what the mock's 30-over-25
  // says. Both stage windows are now on one lane and ordered by DOM order (D26, D48).
  it('puts the host on the stage-window lane, with the menu above both windows', () => {
    expect(css).toContain('z-index: var(--z-stage-window)');
    expect(css).not.toContain('calc(var(--z-dialog) - 1)');
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const start = bare.indexOf('.bank-menu {');
    expect(bare.slice(start, bare.indexOf('}', start))).toContain('z-index: var(--z-dialog)');
  });

  it('gives the held (keyboard pick-up) state its own visible treatment, distinct from source/target', () => {
    expect(css).toMatch(/\.bank-slot\.is-held\s*\{[^}]*box-shadow/);
  });

  // Three literals map-design 3.6 and 3.13 name that a nearby token would quietly round off.
  // `--accent-glow` is the primary BUTTON's .28 resting glow and reads as the obvious substitute
  // for the selected tab's .5; the slot's hover transition is the kind of line a rewrite drops
  // and nothing notices, because jsdom computes no transitions; and the meter tuck is supplied
  // by no family rule, so without this the bar sits a full panel gap below the row it measures.
  it('ships the three design literals a nearby token or a dropped line would round off', () => {
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const tab = bare.slice(bare.indexOf('.bank-tab[aria-selected="true"] {'));
    expect(tab.slice(0, tab.indexOf('}'))).toContain('box-shadow: 0 0 10px -3px rgba(255, 152, 31, .5)');
    const slot = bare.slice(bare.indexOf('[data-bank-slot] {'));
    expect(slot.slice(0, slot.indexOf('}'))).toContain('transition: border-color .12s ease, background .12s ease');
    const panelMeter = bare.slice(bare.indexOf('.bank-meter {'));
    expect(panelMeter.slice(0, panelMeter.indexOf('}'))).toContain('margin-top: -6px');
  });

  // base.css:31-32 declares `:focus { outline: none }` and `:focus-visible { box-shadow:
  // var(--focus-ring) }` for every element and calls itself "the single site that takes the v2
  // ring". The bank's own five-selector copy of that block was the frozen pre-v2 site; it is
  // deleted, not converted, because a converted copy is a second site with no behaviour of its
  // own. Every one of those five keeps its own radius: index.css imports base.css at :10 and
  // this file at :28, so at equal specificity the later declaration wins.
  it('takes the focus ring from base.css rather than declaring a second copy of it', () => {
    // Comments come out first: the note above the deleted block names both of these in prose.
    const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(bare).not.toContain('--focus-ring');
    expect(bare).not.toContain(':focus-visible');
  });
});
