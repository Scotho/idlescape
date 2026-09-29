// web/src/styles/styles.test.ts -- the rule with teeth (companion spec section 5, part 4).
//
// Seven rules. Between them they say: a component family owns its classes and nothing else, a
// per-surface stylesheet may place a component but may not restyle one -- neither at the head of a
// selector nor as a descendant deeper in it -- the cascade is declared once in index.css, no
// stylesheet outgrows a reading, the `.p-` dialect is gone from the stylesheets and from the source
// that emitted it, and a family styles the disabled state its own markup ships. The point is that
// there is nowhere to put a per-panel one-off style, which is the thing a component library dies
// of.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FAMILIES, LAYOUT_DIR } from './families';
import { createStatusHudPlugin } from '../plugins/builtin/statusHud';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(join(here, rel), 'utf8');
const cssFiles = (dir: string): string[] =>
  readdirSync(join(here, dir)).filter(f => f.endsWith('.css')).map(f => (dir === '.' ? f : `${dir}/${f}`));

/** Split a selector list on its top-level commas. `:is(.a, .b)` keeps its own comma. */
function branchesOf(selector: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i += 1) {
    const c = selector[i];
    if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    else if (c === ',' && depth === 0) {
      out.push(selector.slice(start, i));
      start = i + 1;
    }
  }
  out.push(selector.slice(start));
  return out.map(b => b.trim()).filter(b => b.length > 0);
}

/**
 * Strip comments, then yield one entry per branch of every selector list, with that branch's
 * `.class` tokens in order. Per branch and not per block: `.card, .btn-x { ... }` is two rules
 * wearing one pair of braces, and the second one is the violation.
 */
function rulesOf(css: string): { selector: string; classes: string[]; declarations: string[] }[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: { selector: string; classes: string[]; declarations: string[] }[] = [];
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const list = m[1].trim();
    if (!list || list.startsWith('@') || list.startsWith(':root') || list.startsWith('%')) continue;
    const declarations = [...m[2].matchAll(/([a-z-]+)\s*:/g)].map(p => p[1]);
    for (const selector of branchesOf(list)) {
      out.push({ selector, classes: [...selector.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(c => c[1]), declarations });
    }
  }
  return out;
}
/** Every directory under src/ that produces markup. `partials/` is HTML, the rest are modules. */
const SOURCE_ROOTS = ['ui', 'panels', 'plugins', 'frame', 'bank', 'characters', 'home', 'stats', 'partials'];

const owns = (prefixes: readonly string[], cls: string): boolean =>
  prefixes.some(p => cls === p || cls.startsWith(`${p}-`));

/**
 * Every class list the shell's own source hands to markup, as `[file, value]`. Both spellings are
 * read: the `class="..."` of a template or a partial, and the `class:` / `className =` of an `h()`
 * builder. Test files are skipped; they assert about markup rather than producing it.
 */
function classLists(): [string, string][] {
  const out: [string, string][] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(here, '..', dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { walk(rel); continue; }
      if (!/\.(ts|html)$/.test(entry.name) || entry.name.endsWith('.test.ts')) continue;
      const src = readFileSync(join(here, '..', rel), 'utf8');
      for (const m of src.matchAll(/class(?:Name)?\s*[:=]\s*[`'"]([^`'"]*)/g)) out.push([rel, m[1]]);
      for (const m of src.matchAll(/class="([^"]*)"/g)) out.push([rel, m[1]]);
    }
  };
  for (const root of SOURCE_ROOTS) walk(root);
  return out;
}

const styleguide = (): string => readFileSync(join(here, '../../styleguide.html'), 'utf8');

/**
 * Every opening tag on the styleguide that carries a class attribute, as `[tag, value]`. The tag
 * comes back whole because the switch rule below asks what the class is worn BY, not only what it
 * is worn with: `<label class="switch">` and `<input class="switch">` differ nowhere else.
 */
function styleguideTags(): [string, string][] {
  const out: [string, string][] = [];
  for (const m of styleguide().matchAll(/<[a-z][a-z0-9]*\b[^>]*>/g)) {
    const cls = /\bclass="([^"]*)"/.exec(m[0]);
    if (cls) out.push([m[0], cls[1]]);
  }
  return out;
}

/**
 * The Account panel's demo in `#panel`, from its own `<aside class="side-panel"` up to the next
 * one. The panels there are siblings, one aside each, and only this one titles itself Account,
 * so the split is exact and a second Account demo would fail rather than be silently ignored.
 */
function accountDemo(): string {
  const found = styleguide().split('<aside class="side-panel"').filter(a => a.includes('<b>Account</b>'));
  expect(found.length, 'the styleguide has no single Account panel demo').toBe(1);
  return found[0];
}

describe('the component library owns its own classes', () => {
  it.each(Object.keys(FAMILIES))('%s defines only its own family', name => {
    const prefixes = FAMILIES[name];
    for (const { selector, classes } of rulesOf(read(name))) {
      // The FIRST class in a branch is the thing being styled; later ones are context.
      const subject = classes[0];
      if (subject === undefined) continue;
      expect(owns(prefixes, subject), `${name}: "${selector}" styles .${subject}`).toBe(true);
    }
  });

  it('no layout file opens a selector with a library class', () => {
    const owned = Object.values(FAMILIES).flat();
    for (const file of cssFiles(LAYOUT_DIR)) {
      for (const { selector, classes } of rulesOf(read(file))) {
        const subject = classes[0];
        if (subject === undefined) continue;
        // A layout file may target a family class as a DESCENDANT (".events-feed .card"), which
        // puts a layout class first. It may not open a selector with one.
        expect(owns(owned, subject), `${file}: "${selector}" restyles the library class .${subject}`).toBe(false);
      }
    }
  });

  // The other half of the same rule, and entry 4's review is why it exists: the case above reads a
  // branch's FIRST class only, so "may position, may not restyle" was enforced one class short. A
  // layout file may target a family class as a descendant, and four rules were quietly repainting
  // one -- a colour, a size, an alignment, a font -- through exactly that door. What a descendant
  // may set is geometry; paint belongs to the family, or to a recorded exception below.
  const POSITIONING = /^(display|flex|flex-.*|grid|grid-.*|gap|row-gap|column-gap|order|align-.*|justify-.*|place-.*|margin|margin-.*|width|min-width|max-width|height|min-height|max-height|position|top|right|bottom|left|inset|overflow|overflow-.*|white-space|text-overflow|word-break|overflow-wrap|contain|isolation|pointer-events)$/;
  // Five, each one a literal the mock draws for that surface and nowhere else, so pushing it into
  // the family would change every other call site. A sixth is a design conversation, not an append.
  const RESTYLES_ON_PURPOSE: Record<string, string> = {
    '.task-row-toggle > .field-label': 'the per-script toggle caption is 10px muted, not a form label',
    '.session-row .kv-value': 'the session name is left-aligned in a grid whose other cells are not',
    '.session-row .kv-label': 'the session meta line is the faint 10px one, under the name',
    '.loot-list .kv + .kv': 'the loot rows are separated by a hairline the kv family does not draw',
    '.trace-window .window-body': 'the trace body is the monospace log, at the pop-out own size'
  };

  it('a layout file may position a library class as a descendant, but may not repaint one', () => {
    const owned = Object.values(FAMILIES).flat();
    const offenders: string[] = [];
    const seen = new Set<string>();
    for (const file of cssFiles(LAYOUT_DIR)) {
      for (const { selector, classes, declarations } of rulesOf(read(file))) {
        if (!classes.slice(1).some(c => owns(owned, c))) continue;
        if (selector in RESTYLES_ON_PURPOSE) { seen.add(selector); continue; }
        const paint = declarations.filter(p => !POSITIONING.test(p));
        if (paint.length === 0) continue;
        offenders.push(`${file}: "${selector}" sets ${paint.join(', ')} on a library class`);
      }
    }
    // Mutation target: `color: red` added to `.run-actions .btn` fails here, and so does deleting
    // any entry from RESTYLES_ON_PURPOSE.
    expect(offenders).toEqual([]);
    // And the other direction, so the exception list cannot outlive the rules it excuses: an entry
    // whose selector is no longer in any layout file is a licence nobody is using.
    expect(Object.keys(RESTYLES_ON_PURPOSE).filter(s => !seen.has(s))).toEqual([]);
  });

  it('every stylesheet on disk is imported exactly once', () => {
    const imported = [...read('index.css').matchAll(/@import '\.\/([^']+)';/g)].map(m => m[1]);
    expect(new Set(imported).size, 'a stylesheet is imported twice').toBe(imported.length);
    const onDisk = [...cssFiles('.'), ...cssFiles(LAYOUT_DIR)].filter(f => f !== 'index.css');
    expect([...imported].sort()).toEqual([...onDisk].sort());
  });

  // A layout file overrides the family class it places, and it does so at equal specificity:
  // `.session-row` beats `.kv`'s `display` and `.snippet-code` beats three of `.input`'s
  // declarations only because layout/ is imported last. Until Task 3 this case guarded the legacy
  // dialect's slot between the two groups; the dialect is gone, and the order it depended on is
  // what is left worth pinning. cascade.test.ts proves the two pairs themselves.
  it('imports every family before every layout file', () => {
    const imported = [...read('index.css').matchAll(/@import '\.\/([^']+)';/g)].map(m => m[1]);
    const lastFamily = imported.map(f => f in FAMILIES).lastIndexOf(true);
    const firstLayout = imported.findIndex(f => f.startsWith(`${LAYOUT_DIR}/`));
    expect(lastFamily, 'no family stylesheet is imported').toBeGreaterThan(-1);
    expect(firstLayout, 'a layout file is imported before the last family').toBeGreaterThan(lastFamily);
  });

  it('every stylesheet is under the 400 line ceiling', () => {
    for (const file of [...cssFiles('.'), ...cssFiles(LAYOUT_DIR)]) {
      expect(read(file).split('\n').length, file).toBeLessThan(400);
    }
  });

  // The three files outside the family table and layout/ are policed by nothing else: base.css,
  // motion.css and tokens.css are reachable from index.css and a family class dropped in one of
  // them would answer no rule above. They own the reset, the keyframes and the tokens, and a
  // component class in any of them is the one-off style this whole describe exists to prevent.
  it('no unowned stylesheet declares a library class', () => {
    const owned = Object.values(FAMILIES).flat();
    const unowned = cssFiles('.').filter(f => !(f in FAMILIES) && f !== 'index.css');
    expect(unowned.length, 'no stylesheet is left outside the family table').toBeGreaterThan(0);
    for (const file of unowned) {
      for (const { selector, classes } of rulesOf(read(file))) {
        for (const cls of classes) {
          expect(owns(owned, cls), `${file}: "${selector}" declares the library class .${cls}`).toBe(false);
        }
      }
    }
  });

  it('the .p- dialect is gone from the stylesheet layer', () => {
    for (const file of [...cssFiles('.'), ...cssFiles(LAYOUT_DIR)]) {
      expect(read(file), file).not.toMatch(/\.p-[a-z]/);
    }
  });

  // The other half of the same rule: a stylesheet layer with no `.p-` rule left still renders
  // wrong if a panel keeps emitting the name. This walks every markup-producing directory and
  // reads what the source hands to a `class` attribute, so a half-finished rename is a failure
  // rather than an unstyled panel nobody opens.
  it('no source file emits a .p- class', () => {
    // Anchored on the class attribute, never on a bare "p-": script ids like chop-and-drop match
    // that and there are 81 of them.
    const offenders = classLists().filter(([, value]) => /\bp-[a-z]/.test(value));
    expect(offenders.map(pair => pair.join(': '))).toEqual([]);
  });

  // `.switch` is the mock's native checkbox: an accent colour on a 15px square, worn by the BOX.
  // Every call site used to put it on the label instead, where the pre-v2 file drew a RuneLite
  // toggle out of the wrapper and its child. On the v2 rule that same markup gives a flex row
  // `width: 15px; height: 15px`, which collapses the Configuration row, the per-script toggle and
  // every plugin settings row to a square with its caption clipped out of sight. The class
  // therefore travels alone: a checkbox wears nothing else, and a container never wears it.
  it('the switch class is worn alone, which is only true of the box', () => {
    const offenders = classLists()
      .filter(([, value]) => value.split(/\s+/).includes('switch') && value.trim().split(/\s+/).length > 1);
    expect(offenders.map(pair => pair.join(': '))).toEqual([]);
  });

  // The meter's tone and shimmer classes are worn by the FILL. The pre-v2 meter was a wrapper
  // over a `.meter-track`, and its tone class rode on the wrapper; the v2 track IS `.meter` and
  // the tone rules select the fill, so the same markup renders a plain orange bar with no
  // failure anywhere. `meter()` gets this right by construction, and this case is for the two
  // places that do not go through it: the styleguide's demos and any hand-written template.
  it('a meter tone or shimmer is worn by the fill, never by the track', () => {
    const TONES = ['meter-hp', 'meter-prayer', 'meter-run', 'meter-flat', 'shimmer'];
    const offenders = [...classLists(), ...styleguideTags().map(([tag, value]): [string, string] => [tag, value])]
      .filter(([, value]) => {
        const classes = value.split(/\s+/).filter(c => c.length > 0);
        return classes.some(c => TONES.includes(c)) && !classes.includes('meter-fill');
      });
    expect(offenders.map(pair => pair.join(': '))).toEqual([]);
  });

  // The styleguide is the library's shop window and sits outside src/, so neither case above
  // reaches it. A demo or a class strip that still says `p-btn` teaches the dialect straight back
  // into the next panel somebody writes from it.
  it('the styleguide page names no .p- class', () => {
    expect(styleguide().match(/\bp-[a-z][\w-]*/g) ?? []).toEqual([]);
  });

  // Task 21 screenshots this page, so a demo that draws the right card in the wrong container
  // pins the wrong rhythm as the baseline. The Automation demos used to render each card into a
  // bare host of its own; the panel holds them in one `.task-list` and one `.market-list`, and
  // those two containers are where the mock's 7px and 10px card gaps actually live.
  it('the Automation demos sit in the containers the panel really holds those cards in', () => {
    const page = styleguide();
    expect(page).toContain('<div class="task-list" data-sg-scripts></div>');
    expect(page).toContain('<div class="market-list" data-sg-market></div>');
    // The old per-card hosts, which are what made the page drift from the panel.
    expect(page).not.toMatch(/data-sg-script="/);
    // Both halves of each pair, so a hook renamed on one side leaves an empty demo loudly.
    const script = readFileSync(join(here, '../styleguide.ts'), 'utf8');
    expect(script).toContain("'[data-sg-scripts]'");
    expect(script).toContain("'[data-sg-market]'");
  });

  // Task 21 takes the plugin-row baseline from this section, so a demo that draws a different
  // glyph, at a different size, than `pluginsPanel.ts` emits is a baseline that cannot catch a
  // regression in the panel. Three moving parts: the plugin's own manifest glyph, the gear at the
  // 14px the panel asks for, and the `muted` the panel puts on every description.
  it('the Plugins demo row draws what the panel really emits', () => {
    const page = styleguide();
    const row = page.split(/\r?\n/).find(line => line.includes('>Status HUD</div>'))!;
    expect(row).toContain(`class="plugin-icon" data-sg-icon="${createStatusHudPlugin().manifest.icon}"`);
    expect(row).toContain('data-sg-icon="config" data-sg-icon-size="14"');
    expect(row).toContain('title="Settings"');
    // The size hook has to be honoured, not merely written on the demo.
    expect(readFileSync(join(here, '../styleguide.ts'), 'utf8')).toContain('dataset.sgIconSize');
    const descriptions = page.match(/class="plugin-desc[^"]*"/g) ?? [];
    expect(descriptions.length).toBeGreaterThan(0);
    expect([...new Set(descriptions)]).toEqual(['class="plugin-desc muted"']);
  });

  // The third demo-fidelity case, and Task 21 is why it exists: `#data` is one of the eight
  // screenshot baselines, and the character row it draws used to be a bare
  // `.kv` + `.kv-value` + `.kv-label` triple with two buttons beside it. The panel builds that
  // row through `card()` with a `.char-row-main` column between the name and the actions, and
  // without it a 258px demo column squeezes the name to one letter per line: the baseline would
  // have pinned a render the Account panel never produces.
  it('the character row demo draws what the Account panel really emits', () => {
    const page = styleguide();
    const panel = readFileSync(join(here, '../panels/accountCharacters.ts'), 'utf8');
    for (const cls of ['char-row-main', 'char-row-name', 'char-status']) {
      expect(panel, `accountCharacters.ts no longer names .${cls}`).toContain(cls);
      expect(page, `the styleguide's character row has no .${cls}`).toContain(`class="${cls}`);
    }
    // The row is the `.card` that `card()` builds, rail and all, and never a bare `.kv`.
    expect(page).toContain('class="card card-rail-accent char-row active"');
    expect(page).not.toContain('class="kv char-row');
  });

  // The switch rule's styleguide half, split exactly like the `.p-` pair above: `classLists()`
  // walks SOURCE_ROOTS, which are directories under src/, so the shop window is invisible to it.
  // A demo that keeps `.switch` on a `<label>` renders the collapsed 15px square the src rule
  // exists to prevent, and Task 21 screenshots this page, so it would pin that as the baseline.
  it('the styleguide wears the switch class on the box and never on a container', () => {
    const offenders = styleguideTags().filter(([tag, value]) => {
      const classes = value.split(/\s+/).filter(c => c.length > 0);
      if (!classes.includes('switch')) return false;
      return classes.length > 1 || !/^<input\b[^>]*\btype="checkbox"/.test(tag);
    });
    expect(offenders.map(([tag]) => tag)).toEqual([]);
  });

  // The fourth demo-fidelity case, added in Task 21's fix round. `#panel` is NOT one of the eight
  // screenshot baselines, so no PNG guards it and none of the three cases above reached it: the
  // Account demo still drew the pre-merge body, with a `Character` kv row the panel never builds,
  // no character section although `render()` always mounts `createCharacterSection(...).el`, and a
  // bare `.btn` where the panel builds `btn btn-lg btn-block`. A demo that pins a render the panel
  // never produces teaches the wrong markup to whoever writes the next panel from this page, which
  // is the whole job of a shop window.
  it('the Account demo draws the body the Account panel really emits', () => {
    const demo = accountDemo();
    const panel = read('../panels/account.ts');
    // Every kv row the panel builds, in order, and no others. `Character` was never one of them.
    expect([...demo.matchAll(/class="kv-label">([^<]*)</g)].map(m => m[1])).toEqual(['Signed in as', 'Account']);
    expect(panel).toContain("kv('Signed in as'");
    expect(panel).toContain("kv('Account'");
    // `kv()` wraps its value in `.kv-value`, badge and all; the demo used to hang the badge
    // straight off the `.kv`, which is a different grid cell.
    expect(demo).toContain('<span class="kv-value"><span class="badge badge-warn">');
    // The character section is mounted on every render, so the demo has to show it, drawn the way
    // `accountCharacters.ts` draws it.
    expect(demo).toContain('class="section-label">Characters');
    expect(demo).toContain('class="card card-rail-accent char-row active"');
    expect(demo).toContain('class="char-create"');
    // The way out, at the size the panel builds it.
    expect(panel).toContain("class: 'btn btn-lg btn-block'");
    expect(demo).toContain('class="btn btn-lg btn-block"');
    expect(demo).not.toMatch(/class="btn"[^>]*>Sign out/);
  });
});

// The sixth rule, and the one a whole-file family rewrite loses first: a control whose markup ships
// `disabled` renders as ENABLED when no family stylesheet gives it a `:disabled` rule -- full
// colour, `cursor: pointer` from base.css's `button` reset, hover intact. home.html ships four such
// controls and home/controller.ts toggles all four together (CHOICE_BUTTONS), so a family that
// forgets the state leaves that column half-dimmed on every cold load until auth settles. Only the
// partials are read: they are the shell's one body of hand-written markup, and a builder that sets
// `.disabled` at runtime hands its class to one of the same families anyway.
describe('a family styles the disabled state its own markup ships', () => {
  it('every disabled control carries at least one class with a :disabled rule', () => {
    const rules = Object.keys(FAMILIES).map(read).join('\n');
    const missing: string[] = [];
    for (const file of readdirSync(join(here, '../partials')).filter(f => f.endsWith('.html'))) {
      const html = readFileSync(join(here, '../partials', file), 'utf8');
      for (const tag of html.match(/<(?:button|a|input|select|textarea)\b[^>]*\bdisabled[\s>][^>]*>/g) ?? []) {
        const classes = (/class="([^"]*)"/.exec(tag)?.[1] ?? '').split(/\s+/).filter(c => c.length > 0);
        if (classes.length === 0) continue;
        // Mutation target: deleting `.link:disabled` from button.css fails this on home.html's
        // `#btn-connect`, and deleting `.btn:disabled` fails it on the three choices beside it.
        if (!classes.some(c => rules.includes(`.${c}:disabled`))) missing.push(`${file}: ${tag}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
