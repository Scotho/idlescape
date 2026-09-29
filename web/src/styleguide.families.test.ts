// web/src/styleguide.families.test.ts -- library part 2's teeth: a component that is not on the
// styleguide does not exist, and adding a family without its styleguide entry is an incomplete
// change (companion spec section 5, plan ruling R26).
import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CARD_FAMILIES, FAMILIES, STYLEGUIDE_SECTIONS } from './styles/families';

const here = dirname(fileURLToPath(import.meta.url));
const guide = readFileSync(join(here, '../styleguide.html'), 'utf8');
const driver = readFileSync(join(here, 'styleguide.ts'), 'utf8');
const bundle = join(here, '../../docs/design/idlescape-shell-v2/components');
const css = (name: string): string => readFileSync(join(here, 'styles', name), 'utf8');

// Comments FIRST. Every family stylesheet this plan writes opens with a path comment naming the
// component file it implements ("components/core/Button.{jsx,d.ts,prompt.md}"), and a raw scan
// turns `.jsx`, `.ts`, `.md` and `.css` into phantom classes that are in no demo, so `missing`
// could never be empty and the rule could never go green. `rulesOf` in styles.test.ts already
// strips them; this one has to as well. `url(...)` goes the same way and for the same reason:
// form.css draws the select chevron and the search glyph as inline SVG data URIs, and the
// `http://www.w3.org/2000/svg` inside each one reads as `.w3` and `.org`.
const strip = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\([^)]*\)/g, '');
const classesIn = (text: string): Set<string> =>
  new Set([...strip(text).matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));

/**
 * A class literal handed to markup, in either spelling a builder uses plus the `setAttribute`
 * form. Same shape as `classLists()` in styles.test.ts, widened by the third alternative because
 * `icon()` writes its class through `el.setAttribute('class', 'icon')` on an SVG element.
 */
const CLASS_LITERAL = /(?:class(?:Name)?\s*[:=]\s*|setAttribute\('class',\s*)[`'"]([^`'"]*)/g;

/**
 * The one family the page cannot demonstrate in static markup, and why. `#icons` renders the
 * whole set through `icon()` itself, so the only `class="icon"` on the rendered page is the one
 * the builder writes; a hand-written `<svg class="icon">` demo beside it would be a copy of the
 * builder's output that the builder could then drift away from without failing anything. The
 * family is therefore demonstrated THROUGH its builder, the builder is named here rather than
 * inferred, and the case below pins that the page really does delegate to it. One entry today,
 * and a second one is a decision somebody has to write down rather than a default.
 */
const BUILDER_DEMOS: Record<string, string> = { 'icon.css': 'ui/icon.ts' };

describe('the styleguide covers the library', () => {
  it('has a section for every family stylesheet', () => {
    for (const name of Object.keys(FAMILIES)) {
      const id = STYLEGUIDE_SECTIONS[name];
      expect(id, `${name} has no styleguide section`).toBeDefined();
      expect(guide).toContain(`id="${id}"`);
    }
  });

  it('demonstrates every class each family defines', () => {
    // Collected from `class="..."` attributes only, and with the `.sg-code` strips removed
    // first. Scanning the page as text would let a class satisfy the rule by being NAMED in the
    // code strip at the bottom of its section rather than rendered: `.btn-block`, `.alert-title`
    // and `.badge-quiet` are all named there, so the mutation target this test claims -- adding
    // `.btn-huge` to button.css without a demo -- would only fail if the author also forgot to
    // add it to the strip. That is the whole of library part 2's teeth.
    const used = new Set(
      [...guide.replace(/<div class="sg-code">[\s\S]*?<\/div>/g, '').matchAll(/class="([^"]*)"/g)]
        .flatMap(m => m[1].split(/\s+/))
        .filter(c => c.length > 0 && !c.startsWith('sg-'))
    );
    const missing: string[] = [];
    for (const name of Object.keys(FAMILIES)) {
      const builder = BUILDER_DEMOS[name];
      const drawn = builder === undefined
        ? used
        : new Set([
          ...used,
          ...[...readFileSync(join(here, builder), 'utf8').matchAll(CLASS_LITERAL)]
            .flatMap(m => m[1].split(/\s+/))
            .filter(c => c.length > 0)
        ]);
      for (const cls of classesIn(css(name))) {
        // Pseudo-state variants are exercised by their base class.
        if (!drawn.has(cls)) missing.push(`${name}: .${cls}`);
      }
    }
    // Mutation target: adding `.btn-huge` to button.css without a demo must fail here.
    expect(missing).toEqual([]);
  });

  it('renders the builder-demonstrated families through their builder', () => {
    // The other half of BUILDER_DEMOS. Granting `icon.css` its classes off `ui/icon.ts` is only
    // honest while the page actually calls that builder: the section carries the hook, and the
    // driver reads it. Delete either side and the icon grid renders nothing while the case above
    // still passes, which is the hole this closes.
    expect(BUILDER_DEMOS['icon.css']).toBe('ui/icon.ts');
    expect(guide).toContain('data-sg-icons');
    expect(driver).toContain("'[data-sg-icons]'");
    expect(driver).toContain("from './ui/icon'");
  });

  it('exercises every component the five bundle demo cards do', () => {
    // The allowed set is the bundle's OWN component list: one `.d.ts` per component, across all
    // five families, which is nineteen names. It has to be the union and not the family's own
    // directory, because data.card.html renders <Badge>, <Button> and <SectionLabel>, which live
    // in core/. Everything else a card names is a local helper defined inside it -- every card
    // has a `function Demo()` and core.card.html has `const Row = ({children}) => ...` -- and
    // requiring `data-sg-component="Demo"` would put junk in the styleguide to satisfy a test.
    const components = new Set(CARD_FAMILIES.flatMap(f =>
      readdirSync(join(bundle, f))
        .filter(n => n.endsWith('.d.ts'))
        .map(n => basename(n, '.d.ts'))
    ));
    expect(components.size).toBe(19);
    for (const family of CARD_FAMILIES) {
      const card = readFileSync(join(bundle, family, `${family}.card.html`), 'utf8');
      // The cards are React; what they name is a component, not a class. The map from a component
      // name to our class is in the README's "Component library, statically" table.
      for (const component of [...card.matchAll(/<([A-Z]\w+)/g)].map(m => m[1])) {
        if (!components.has(component)) continue;
        expect(guide, `${family}.card.html exercises <${component}> and the styleguide does not`)
          .toContain(`data-sg-component="${component}"`);
      }
    }
  });

  it('keeps the styleguide under its own exempted ceiling', () => {
    // The Global Constraints exempt this one file from the 400-line rule and cap it at 1,200
    // instead; crossing that is the signal to split it into one partial per family.
    expect(guide.split('\n').length).toBeLessThan(1_200);
  });
});
