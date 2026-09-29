// web/src/styles/tokens.test.ts -- pins the v2 token layer to the vendored bundle. Every value
// here was copied from docs/design/idlescape-shell-v2/tokens/*.css; when the two disagree the
// bundle wins and this file is what says so out loud.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name: string): string => readFileSync(join(here, name), 'utf8');
const bundle = (name: string): string =>
  readFileSync(join(here, '../../../docs/design/idlescape-shell-v2/tokens', name), 'utf8');

/** `--x: value;` out of a stylesheet, first declaration wins. */
function tokenValue(css: string, name: string): string | null {
  const m = new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(css);
  return m ? m[1].trim() : null;
}

/** The same, following one level of `var(--other)` so an alias token asserts its real value. */
function resolvedToken(css: string, name: string): string | null {
  const raw = tokenValue(css, name);
  const alias = raw === null ? null : /^var\(--([a-z0-9-]+)\)$/.exec(raw);
  return alias ? tokenValue(css, alias[1]) : raw;
}

// Module scope, not inside the first describe: the freeze block below reads it too.
const css = read('tokens.css');

describe('tokens.css', () => {
  it('carries every colour token the bundle declares, at the bundle value', () => {
    const colors = bundle('colors.css');
    for (const name of ['ground', 'frame', 'sunken', 'bar', 'panel', 'card', 'control', 'control-hover',
      'hairline', 'hairline-soft', 'hairline-strong', 'edge',
      'text-strong', 'text', 'text-muted', 'text-faint', 'text-disabled',
      'accent', 'accent-bright', 'accent-deep', 'on-accent', 'accent-tint', 'accent-glow',
      'ok', 'ok-bright', 'ok-pop', 'warn', 'error', 'danger', 'danger-deep', 'danger-hover',
      'info', 'info-bright', 'hp', 'hp-bright', 'prayer', 'prayer-bright', 'run', 'run-bright',
      'focus-ring', 'overlay-scrim']) {
      expect(tokenValue(css, name), name).toBe(tokenValue(colors, name));
    }
  });

  it('carries the spacing scale at the bundle values, not the old 4px rhythm', () => {
    expect(tokenValue(css, 'sp-1')).toBe('2px');
    expect(tokenValue(css, 'sp-2')).toBe('3px');
    expect(tokenValue(css, 'sp-3')).toBe('4px');
    expect(tokenValue(css, 'sp-4')).toBe('6px');
    expect(tokenValue(css, 'sp-5')).toBe('8px');
    expect(tokenValue(css, 'sp-6')).toBe('10px');
    expect(tokenValue(css, 'sp-7')).toBe('12px');
    expect(tokenValue(css, 'sp-8')).toBe('14px');
  });

  it('carries the type scale at the bundle values', () => {
    expect(tokenValue(css, 'fs-label')).toBe('9.5px');
    expect(tokenValue(css, 'fs-micro')).toBe('10px');
    expect(tokenValue(css, 'fs-tiny')).toBe('10.5px');
    expect(tokenValue(css, 'fs-small')).toBe('11px');
    expect(tokenValue(css, 'fs-base')).toBe('12px');
    expect(tokenValue(css, 'fs-md')).toBe('12.5px');
    expect(tokenValue(css, 'fs-emph')).toBe('13.5px');
    expect(tokenValue(css, 'fs-title')).toBe('14.5px');
    expect(tokenValue(css, 'fs-brand')).toBe('16px');
    expect(tokenValue(css, 'lh')).toBe('1.45');
    expect(tokenValue(css, 'font-num')).toBe('ui-monospace, Menlo, Consolas, monospace');
    // The ten frozen stylesheets keep 23 live call sites on these two aliases, on the ground that
    // 10px and 11px did not change. Unpinned, `--fs-xs: 12px` resizes the frame footer, the
    // badges, the trace rows, the report rows and the plugin controls with the suite still green.
    expect(resolvedToken(css, 'fs-xs')).toBe('10px');
    expect(resolvedToken(css, 'fs-sm')).toBe('11px');
    // The bundle drops "Press Start 2P" from the pixel stack.
    expect(tokenValue(css, 'font-pixel')).toBe('"Pixelify Sans", ui-monospace, monospace');
  });

  it('carries the four control heights and the frame geometry', () => {
    expect(tokenValue(css, 'ctl-h-xs')).toBe('22px');
    expect(tokenValue(css, 'ctl-h-sm')).toBe('25px');
    expect(tokenValue(css, 'ctl-h')).toBe('27px');
    expect(tokenValue(css, 'ctl-h-lg')).toBe('29px');
    expect(tokenValue(css, 'panel-w')).toBe('280px');
    expect(tokenValue(css, 'strip-w')).toBe('40px');
    expect(tokenValue(css, 'title-h')).toBe('28px');
    expect(tokenValue(css, 'foot-h')).toBe('21px');
    expect(tokenValue(css, 'tabs-h')).toBe('32px');
    expect(tokenValue(css, 'bar-h')).toBe('42px');
    expect(tokenValue(css, 'panel-head-h')).toBe('34px');
    expect(tokenValue(css, 'strip-btn-h')).toBe('33px');
  });

  it('keeps the layer tokens and the dark colour scheme the bundle drops', () => {
    // The bundle hard-codes z-index:25 on the bank window and 30 on the trace window. The shell
    // has had a layer scale since SP1 and the two windows are the reason it exists.
    for (const name of ['z-overlay', 'z-panel', 'z-toast', 'z-dialog']) expect(tokenValue(css, name)).not.toBeNull();
    expect(css).toContain('color-scheme: dark');
  });

  it('replaces the two-ring focus halo with the single orange wash', () => {
    expect(tokenValue(css, 'focus-ring')).toBe('0 0 0 3px rgba(255,152,31,.18)');
  });

  it('tokenises the colours the mock hard-codes (ruling R18)', () => {
    const pairs: [string, string][] = [
      ['chrome-bar', '#1b1b1d'], ['chrome-tab-active', '#28282a'], ['chrome-hover', '#2a2a2c'],
      ['track', '#2c2c2e'], ['kbd-border', '#3e3e3c'], ['dot-idle', '#666666'],
      ['glyph-rest', '#9a9a98'], ['text-quiet', '#a0a09e'], ['error-text', '#f07370'],
      ['xp-chip', '#2e7d32'], ['count-stack', '#ffff00'], ['count-large', '#00ff80'],
      ['bank-ground', '#252220'], ['bank-head', '#2c2925'], ['bank-tab-active', '#33302c'],
      ['bank-well', '#171513'], ['bank-dash', '#4e4a44'],
      ['shot-a', '#141414'], ['shot-b', '#191919'], ['canvas-a', '#0a0a0a'], ['canvas-b', '#0d0d0d']
    ];
    for (const [name, value] of pairs) expect(tokenValue(css, name), name).toBe(value);
  });
});

describe('the unconverted surfaces are frozen while the tokens change under them (ruling R2)', () => {
  // Task 2 split the ten stylesheets this block used to enumerate into component families and
  // layout files, so the hard-coded filename list went with them: it named eight files that no
  // longer exist and would have thrown ENOENT rather than failing an assertion. The rule itself
  // outlives the split, so it is read off disk instead. Every stylesheet is frozen until its own
  // task converts it, and a task converts a file by adding it to CONVERTED below, in the same
  // commit that puts the v2 tokens in it. A new stylesheet is frozen the moment it lands.
  const CHANGED = /var\(--(sp-[1-6]|fs-base|fs-md|fs-lg|fs-xl|fs-2xl|lh|lh-tight|ctl-h|ctl-h-sm|ctl-h-lg|title-h|foot-h|ease|dur-fast|dur-base|dur-slow|radius|radius-lg)\)/;
  // Task 4 converted the whole of button.css and badge.css to the v2 family. alert.css stayed
  // frozen at that point: that task replaced only its `.alert*` block. See the Task 12 and Task 19
  // notes below for how the rest of that file was finished.
  // Task 5 converted the whole of form.css. `tab.css` took the segmented control and the filter
  // chip in the same task and stays FROZEN on purpose: its `.char-tab*` half is still the pre-v2
  // one Task 8 owns, and the two blocks it gained read only tokens whose value did not change.
  // Task 6 converted card.css and meter.css together. card.css has to be listed: `.card-lift`
  // reads `var(--ease)`, which Task 1 revalued. meter.css reads no changed token and would have
  // passed the freeze either way, and is listed anyway, because a file this list omits is a file
  // a later reader takes for unconverted. What is still pre-v2 inside card.css is `.table*` and
  // `.section*`, and neither is a bundle component: no task converts them, they carry literals.
  // Task 8 converted the navigation family and the frame chrome together: strip.css, the
  // `.char-tab*` half of tab.css, and layout/frame.css. TWO of the three force the listing, not
  // one: layout/frame.css reads --title-h, --foot-h, --fs-md and --sp-5, and strip.css's
  // `.strip-btn[data-tip]::after` reads --ease, all five names Task 1 revalued. Only tab.css is
  // listed by the convention this block states rather than by a token it reads, so dropping it
  // from CONVERTED leaves the suite green where dropping either of the other two turns it red.
  // Task 9 filled icon.css, which had been an empty placeholder since Task 2. It reads no token
  // at all, changed or otherwise: a glyph is `currentColor` and 16px from the markup. Listed for
  // the same reason meter.css is, so a later reader does not take it for unconverted.
  // Task 12 moved alert.css across, which Task 4's note above deferred. The two empty-state
  // patterns (ruling R15) are v2 rules written from the mock and one of them is 12.5px, which is
  // `--fs-md`, a name Task 1 revalued; freezing that to a literal would have written the one
  // number the design system exists to hold in a token. What was still pre-v2 in that file at
  // that point was `.empty` and the `.toast*` block, and neither read a revalued token at all -
  // they carried literals and the `--rl-*` triplets - so the freeze was guarding nothing there.
  // Task 19 finished alert.css, taking `.empty` and the `.toast*` block onto the v2 tokens: no
  // `--rl-*` triplet is left in that file, and nothing in it is owed to a later task. The one
  // value that moved rather than being restated is `.empty-title`'s weight, 600 to the family's
  // 650; cascade.trackers.test.ts asserts it, and alert.css's own comment names it.
  // Task 14 created layout/copilot.css, which is written from the mock and is v2 throughout: the
  // running summary reads --fs-base, a name Task 1 revalued, and freezing it to a literal would
  // put the shell's body size in a per-surface file. Nothing in it is pre-v2, because the surface
  // it replaces (the run banner's rules in layout/automation.css) was deleted in the same commit.
  // Task 15 converted layout/automation.css whole. Every surface in it is one that task owns (the
  // run card, the script rows, the snippet box, the run report and the Marketplace cards), so a
  // partial conversion on the alert.css precedent would have left half a file frozen with nobody
  // named to finish it. It reads --fs-base in the counter row and the spacing scale throughout,
  // both names Task 1 revalued, so freezing it would have written the panel body size and every
  // gap in the panel as a literal.
  // Task 16 converted layout/trace.css whole when the trace left the panel for a window over the
  // stage. Every rule in it is written from the mock (map-design 3.5), and it reads --sp-3,
  // --fs-tiny and --fs-micro, two of which Task 1 revalued: freezing them would have written the
  // pop-out's row size and its padding as literals in a file that has no pre-v2 half left.
  const CONVERTED = ['tokens.css', 'base.css', 'motion.css', 'index.css', 'button.css', 'badge.css',
    'form.css', 'card.css', 'meter.css', 'strip.css', 'tab.css', 'icon.css', 'alert.css',
    'layout/frame.css', 'layout/copilot.css', 'layout/automation.css', 'layout/trace.css',
    'layout/bank.css'];
  const cssIn = (dir: string): string[] =>
    readdirSync(join(here, dir)).filter(f => f.endsWith('.css')).map(f => (dir === '.' ? f : `${dir}/${f}`));
  const FROZEN = [...cssIn('.'), ...cssIn('layout')].filter(f => !CONVERTED.includes(f));

  it.each(FROZEN)('%s uses no token whose value changed', file => {
    const found = CHANGED.exec(read(file));
    expect(found?.[0] ?? null, `${file} reads a token Task 1 revalued`).toBeNull();
  });

  // The styleguide is not a stylesheet, but its own demo chrome reads --radius, --radius-lg,
  // --fs-lg, --fs-xl and --fs-md, and Task 1 deleted three of those. Same freeze, same reason.
  it('the styleguide page uses no token whose value changed', () => {
    const found = CHANGED.exec(readFileSync(join(here, '../../styleguide.html'), 'utf8'));
    expect(found?.[0] ?? null).toBeNull();
  });

  it('keeps the two frame widths on their tokens, because the canvas reserves them (ruling R3)', () => {
    // Task 2 sent the two declarations to different files: the panel is frame geometry, the
    // strip is a component family with a width the canvas has to agree with. Both files quote
    // this ruling in their own header, so the comments come out before the search: read whole,
    // each declaration would match its own prose and neither width would be pinned to anything.
    const declarations = (file: string): string => read(file).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(declarations('layout/frame.css')).toContain('width: var(--panel-w)');
    expect(declarations('strip.css')).toContain('width: var(--strip-w)');
  });

  // Decisions D26 and D48: the merged z-scale is six named lanes and nothing else. A later entry
  // that wants a new floating surface takes a lane; a ladder of per-window numbers is the thing
  // this case exists to stop. Mutation target: adding `--z-studio: 35` fails the second
  // assertion, and reordering two lanes fails the first.
  it('declares the six stacking lanes in ascending order and no others', () => {
    const lanes = ['z-overlay', 'z-panel', 'z-window', 'z-stage-window', 'z-toast', 'z-dialog'];
    const values = lanes.map(n => Number(tokenValue(css, n)));
    expect(values).toEqual([5, 10, 20, 30, 40, 50]);
    expect([...css.matchAll(/--z-[a-z-]+\s*:/g)].map(m => m[0])).toHaveLength(lanes.length);
  });
});

describe('the styleguide page states the token layer, not the one it replaced', () => {
  const page = readFileSync(join(here, '../../styleguide.html'), 'utf8');

  /**
   * Every colour the v2 layer declares: sections 1 and 8 of tokens.css, read off the section
   * headers rather than listed here, so a token added to either section is in this set the moment
   * it lands. Two kinds are dropped, and only these two: an alias whose whole value is
   * `var(--other)`, which has no colour of its own to show, and `--focus-ring`, which is a
   * box-shadow rather than a fill and cannot be painted into a swatch.
   */
  function colourTokens(): string[] {
    const section = (from: RegExp, to: RegExp): string => {
      const start = css.search(from);
      const end = css.search(to);
      expect(start, String(from)).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      return css.slice(start, end);
    };
    const body = section(/---- 1\. Colours/, /---- 2\. Typography/)
      + section(/---- 8\. Colours the mock/, /---- 9\. The legacy/);
    return [...body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)]
      .filter(m => !/^var\(--[a-z0-9-]+\)$/.test(m[2].trim()) && m[1] !== 'focus-ring')
      .map(m => m[1]);
  }

  /**
   * The `#colour` section's swatches, as the pair each one claims: the token it PAINTS and the
   * token it NAMES. Reading both is the difference between a palette and a caption: the section
   * this replaced named nineteen tokens correctly and painted a layer the shell had retired.
   */
  function swatches(): { painted: string; named: string }[] {
    const colour = /<section id="colour">([\s\S]*?)<\/section>/.exec(page);
    expect(colour, 'the styleguide has no #colour section').not.toBeNull();
    return [...(colour?.[1] ?? '')
      .matchAll(/<i style="background:var\(--([a-z0-9-]+)\)"><\/i><span><b>--([a-z0-9-]+)<\/b>/g)]
      .map(m => ({ painted: m[1], named: m[2] }));
  }

  // The shop window's front page, and entry 4's review found it publishing the layer the shell had
  // just retired: `#colour` swatched the nineteen `--rl-*` triplets and not one of the 60-odd v2
  // colours. A page that has to be remembered is a page that goes stale, so this is the rule that
  // remembers. Mutation targets: deleting any one swatch, or adding a colour to section 1 or 8
  // without one, fails the first assertion; a swatch that names one token and paints another
  // fails the second.
  it('swatches every colour the v2 layer declares, and paints the token each swatch names', () => {
    const drawn = swatches();
    const named = new Set(drawn.map(s => s.named));
    expect(colourTokens().filter(t => !named.has(t))).toEqual([]);
    expect(drawn.filter(s => s.painted !== s.named)).toEqual([]);
  });

  // The freeze case above only sees `var(--x)` call sites, so it cannot see the #space section,
  // which states the scale as prose and went on publishing the pre-v2 numbers under two names
  // Step 3 deleted. Mutation target: putting `--radius: 2px` back in that code block fails this.
  it('names no token tokens.css does not declare', () => {
    const named = [...new Set([...page.matchAll(/--[a-z0-9-]+/g)].map(m => m[0].slice(2)))];
    expect(named.filter(n => tokenValue(css, n) === null)).toEqual([]);
  });

  // Mutation target: restoring the old `--sp-1..6: 4 8 12 16 24 32` line, or any one of the ten
  // named values, fails here. The page's whole job is to show the system truthfully.
  it('publishes the spacing scale, the radii and the control heights at their live values', () => {
    const sp = [1, 2, 3, 4, 5, 6, 7, 8].map(n => (tokenValue(css, `sp-${n}`) ?? '').replace('px', ''));
    expect(page).toContain(`--sp-1..8: ${sp.join(' ')}`);
    for (const n of ['r-pill-sm', 'r-ctl', 'r-seg', 'r-card', 'r-window', 'r-badge',
      'ctl-h-xs', 'ctl-h-sm', 'ctl-h', 'ctl-h-lg']) {
      expect(page, n).toContain(`--${n}: ${tokenValue(css, n)}`);
    }
  });

  // The case above reads the `#space` code block, which is a listing and looks like one. The page
  // ALSO states the control heights as prose in its opening rule of thumb, and that sentence is
  // what entry 4's review caught still saying 28px (and "36px on touch", a size v2 does not have)
  // long after the fold took the control to 27. Prose is where a page goes stale first, because
  // nothing reads it. This reads it. Mutation target: putting 28 back in the lede fails here.
  it('states the control heights in its opening prose at their live values', () => {
    const m = /Controls are (\d+)px tall, with (\d+), (\d+) and (\d+)px/.exec(page);
    expect(m, 'the lede no longer states the control heights; restate them or delete this case')
      .not.toBeNull();
    const stated = (m ?? []).slice(1).map(Number);
    const live = ['ctl-h', 'ctl-h-xs', 'ctl-h-sm', 'ctl-h-lg']
      .map(n => Number((tokenValue(css, n) ?? '').replace('px', '')));
    expect(stated).toEqual(live);
  });

  // A specimen that inherits its size is a specimen that lies the moment base.css moves the
  // document default, which is exactly what the "ui 13" row did when the fold took body to 12px.
  // Mutation target: dropping `font-size:12px` from the "ui 12" row fails this.
  it('sizes every ui type specimen explicitly, at the size its label claims', () => {
    const rows = [...page.matchAll(/class="sg-type-row"><span>ui (\d+)[^<]*<\/span>(.*?)<\/div><\/div>/g)];
    expect(rows).toHaveLength(5);
    for (const [, size, body] of rows) {
      const m = /font-size:\s*(var\(--[a-z0-9-]+\)|[\d.]+px)/.exec(body);
      expect(m?.[1] ?? null, `ui ${size}`).not.toBeNull();
      const alias = /^var\(--([a-z0-9-]+)\)$/.exec(m?.[1] ?? '');
      expect(alias ? resolvedToken(css, alias[1]) : m?.[1], `ui ${size}`).toBe(`${size}px`);
    }
  });
});

// Ruling R2's block 9 says the last surface to convert takes the triplet layer with it, and entry
// 4's review found that nobody had: ten of the nineteen had no consumer left in any stylesheet and
// were alive only because the styleguide's own swatches painted them, in a section that presented
// them as the palette. A comment cannot enforce a hand-off. This can: a triplet nothing calls is a
// failure, so the block empties itself as surfaces convert. The styleguide is deliberately NOT
// counted as a consumer -- it is the shop window, and letting it keep a token alive is exactly the
// hole this closes -- while its own demo chrome may of course keep calling a triplet a stylesheet
// still calls too.
describe('the legacy triplet layer holds only what a stylesheet still calls (ruling R2)', () => {
  it('declares no --rl-* triplet no stylesheet reads', () => {
    const consumers = [...readdirSync(here), ...readdirSync(join(here, 'layout')).map(f => `layout/${f}`)]
      .filter(f => f.endsWith('.css') && f !== 'tokens.css')
      .map(read);
    // Mutation target: putting `--rl-hp: 192, 57, 43;` back fails here, and so does converting the
    // last `rgb(var(--rl-raised))` call site without dropping the declaration beside it.
    const declared = [...css.matchAll(/--rl-([a-z-]+)\s*:/g)].map(m => m[1]);
    expect(declared.length, 'the triplet layer is gone; delete this case with it').toBeGreaterThan(0);
    const call = (name: string): string => `var(--rl-${name})`;
    expect(declared.filter(name => !consumers.some(text => text.includes(call(name))))).toEqual([]);
  });
});

describe('motion.css', () => {
  const motion = read('motion.css');
  // Eight from the bundle, plus `toast-in`, which arrived with the toast when Task 2 split
  // overlays.css, and `spin`, which Task 4 moved off button.css on the same argument. Mutation
  // target: dropping either kills an animation nothing in the DOM can see: the toast entry on
  // every notify, and the sign-in button's in-flight ring.
  it('defines all ten keyframes', () => {
    for (const k of ['pulse', 'shimmer', 'barflow', 'floatUp', 'fadeUp', 'popIn', 'bob', 'stepPulse', 'toast-in', 'spin']) {
      expect(motion).toContain(`@keyframes ${k}`);
    }
  });
  it('disables animation under reduced motion, in exactly one place', () => {
    expect(motion).toContain('prefers-reduced-motion: reduce');
    expect(motion).toContain('animation-iteration-count: 1 !important');
    expect(read('base.css')).not.toContain('prefers-reduced-motion');
  });
  // The double-import this case used to name (tasks.css, imported at index.css lines 8 and 14)
  // is gone with the file; styles.test.ts's "every stylesheet on disk is imported exactly once"
  // is the general form of it now, over every stylesheet rather than that one.
  it('is imported by the app stylesheet, exactly once', () => {
    expect(read('index.css').match(/@import '\.\/motion\.css';/g)).toHaveLength(1);
  });
});

describe('main.ts', () => {
  it('never reads localStorage unguarded at module scope', () => {
    const main = readFileSync(join(here, '../main.ts'), 'utf8');
    // Mutation target: restoring `const sizeMode = localStorage.getItem('cs.size')` fails this.
    // A declaration carrying its own try/catch on the line is the guarded reader every `cs.` read
    // in the shell goes through, and is exactly what this rule wants to find instead.
    const unguarded = main
      .split('\n')
      .filter(line => /^(const|let)\s+\w+[^\n]*localStorage\.getItem/.test(line))
      .filter(line => !/\btry\b/.test(line));
    expect(unguarded).toEqual([]);
  });
});
