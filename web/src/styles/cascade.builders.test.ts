// web/src/styles/cascade.builders.test.ts -- the component library's builders, read back through
// the whole cascade.
//
// cascade.test.ts polices the pairs the Task 2 split put in a new order; this file polices the
// classes `web/src/ui/parts.ts` emits. Every case builds what a builder actually returns, so a
// builder that stops emitting a class and a stylesheet that stops defining one fail the same
// assertion, and every modifier here is a bare single-class rule that beats the component rule
// above it on ORDER alone, which is the only kind of claim jsdom can adjudicate (see the header
// of cascade.test.ts for why specificity claims belong in a Playwright spec instead).
import { beforeAll, describe, expect, it } from 'vitest';
import { icon } from '../ui/icon';
import { card, chip, meter, segmented } from '../ui/parts';
import { computed, declarationsOf, loadCascade } from './cascade.harness';

beforeAll(() => { loadCascade(); });

// The forms family's three builders emit classes that live in two different stylesheets: `.switch`
// in form.css, `.seg*` and `.chip*` in tab.css, because families.ts owns them there. That split is
// invisible at the call site and is exactly the kind of thing a later import reorder breaks
// silently, so these cases build what `segmented()` and `chip()` actually return and read the
// declarations back through the whole cascade. jsdom hands a `var()` back unresolved; the VALUES
// behind those names are tokens.test.ts's business, and the names arriving at all is this file's.
describe('the forms family reaches the DOM its builders emit', () => {
  it('the segmented rail and its buttons are styled, and the active one wins', () => {
    const el = segmented([{ value: 'my', label: 'My tasks' }, { value: 'market', label: 'Marketplace' }], 'my', () => {});
    document.body.appendChild(el);
    const rail = getComputedStyle(el);
    expect(rail.display).toBe('flex');
    expect(rail.padding).toBe('3px');
    expect(rail.borderRadius).toBe('var(--r-seg)');
    const [active, idle] = [...el.querySelectorAll('button')];
    expect(getComputedStyle(idle).color).toBe('var(--text-muted)');
    expect(getComputedStyle(idle).height).toBe('var(--ctl-h-xs)');
    // `.seg-btn.active` follows `.seg-btn` in tab.css, which is the whole of why the selected tab
    // is orange. Moving it above would leave every tab muted with the suite still green.
    expect(getComputedStyle(active).color).toBe('var(--accent)');
    expect(getComputedStyle(active).fontWeight).toBe('650');
  });

  it('a filter chip is styled, and the active one wins', () => {
    const off = chip('Loot', false, () => {});
    const on = chip('XP', true, () => {});
    document.body.append(off, on);
    expect(getComputedStyle(off).height).toBe('20px');
    expect(getComputedStyle(off).borderRadius).toBe('10px');
    expect(getComputedStyle(off).color).toBe('var(--text-quiet)');
    expect(getComputedStyle(on).color).toBe('var(--accent)');
  });

  // The four size modifiers, which are half of what this family promises and which nothing else in
  // the suite reads: all four rules could be deleted outright and every other case stays green.
  // The mock draws inputs at five heights (map-design 2.8/2.9); 27 is the component and each other
  // height in the shell is one of these classes. Each is a bare single-class rule at the SAME
  // specificity as `.input` or `.select`, so it wins only because it follows it in form.css, which
  // makes this an order claim of exactly the kind this file exists for.
  it('each size modifier overrides the component height it follows', () => {
    expect(computed('input', 'input').height).toBe('var(--ctl-h)');
    expect(computed('input', 'input input-lg').height).toBe('var(--ctl-h-lg)');

    const sm = computed('input', 'input input-sm');
    expect(sm.height).toBe('var(--ctl-h-sm)');
    expect(sm.fontSize).toBe('var(--fs-small)');
    expect(sm.paddingLeft).toBe('9px');

    const quiet = computed('input', 'input input-quiet');
    expect(quiet.height).toBe('var(--ctl-h-tiny)');
    expect(quiet.fontSize).toBe('var(--fs-small)');
    expect(quiet.paddingLeft).toBe('9px');

    expect(computed('select', 'select').height).toBe('var(--ctl-h)');
    expect(computed('select', 'select select-sm').height).toBe('var(--ctl-h-sm)');
  });

  // The box, not the label. `.switch` gives whatever wears it a 15px square, so a container that
  // wore it would collapse; styles.test.ts forbids the markup and this case is why it has to.
  it('the switch is a 15px accented square', () => {
    const cs = computed('input', 'switch');
    expect(cs.width).toBe('15px');
    expect(cs.height).toBe('15px');
    expect(cs.accentColor).toBe('var(--accent)');
  });
});

// The data family is three components whose modifiers are all bare single-class rules sitting
// after the rule they beat, which makes every one of them an order claim of the kind this file
// exists for. Each case builds what `card()` and `meter()` actually return, so a builder that
// stops emitting a class and a stylesheet that stops defining one fail the same assertion.
describe('the data family reaches the DOM its builders emit', () => {
  it('a hero card overrides the padding, ground and border it follows', () => {
    const plain = getComputedStyle(document.body.appendChild(card({})));
    expect(plain.padding).toBe('11px');
    expect(plain.background).toBe('var(--card)');
    expect(plain.borderRadius).toBe('var(--r-card)');
    // The mock's .06, not the component file's .05 (map-design S7). Spelled out because it is the
    // one colour in this family with no token behind it.
    expect(plain.borderColor).toBe('rgba(255, 255, 255, 0.06)');

    const hero = getComputedStyle(document.body.appendChild(card({ hero: true })));
    expect(hero.padding).toBe('12px');
    expect(hero.background).toBe('var(--card-grad)');
    expect(hero.borderColor).toBe('var(--hairline)');   // .07
    expect(hero.boxShadow).not.toBe('');
  });

  // Mutation target: deleting the four `border-left-color` rules, or moving the shared
  // width/style rule below them, leaves every rail invisible with nothing else failing.
  it('all four rails paint the left edge, over the hero border colour', () => {
    for (const [rail, token] of [['accent', '--accent'], ['ok', '--ok'], ['warn', '--warn'], ['error', '--error']] as const) {
      const cs = getComputedStyle(document.body.appendChild(card({ rail, hero: true })));
      expect(cs.borderLeftWidth, rail).toBe('3px');
      expect(cs.borderLeftStyle, rail).toBe('solid');
      expect(cs.borderLeftColor, rail).toBe(`var(${token})`);
    }
  });

  it('the lift modifier transitions, and only where it is asked for', () => {
    expect(getComputedStyle(document.body.appendChild(card({}))).transition).toBe('');
    expect(getComputedStyle(document.body.appendChild(card({ class: 'card-lift' }))).transition)
      .toBe('transform var(--dur) var(--ease), border-color var(--dur) var(--ease)');
  });

  // jsdom matches no `:hover`, so this reads the rule out of the cascade instead of off an
  // element. At (0,2,0) the hover beats every `.card-rail-*` rule above it, so the plan literal's
  // `border-color` shorthand would repaint the left edge the rail owns and `.card-lift`'s own
  // transition would animate the tone away for as long as the pointer sat there. Three longhands,
  // never the shorthand, and never the left one. Task 21's spec is where the pointer actually
  // goes; this is where the declaration is pinned.
  it('the lift hover repaints three edges and leaves the rail its own', () => {
    const hover = declarationsOf('.card-lift:hover');
    for (const edge of ['top', 'right', 'bottom']) {
      expect(hover.getPropertyValue(`border-${edge}-color`), edge).toBe('var(--hairline-strong)');
    }
    expect(hover.getPropertyValue('border-left-color')).toBe('');
    expect(hover.getPropertyValue('border-color')).toBe('');
  });

  // `.kv-roomy` is the Bank panel's 4px rhythm and it beats `.kv`'s 2px on order alone.
  it('a roomy key/value row overrides the rhythm the family sets', () => {
    expect(computed('div', 'kv').padding).toBe('2px 0px');
    expect(computed('div', 'kv kv-roomy').padding).toBe('4px 0px');
    expect(computed('span', 'kv-value').fontVariantNumeric).toBe('tabular-nums');
    // `.kv-value.num` follows `.kv-value`, and mono is the whole of what `num` now means: the
    // tabular figures moved onto every value when the family took the v2 rules.
    expect(computed('span', 'kv-value num').fontFamily).toBe('var(--font-num)');
  });

  // The tone classes are worn by the FILL, and each is a flat colour that has to beat the accent
  // gradient declared above it. Mutation target: moving the three tone rules above `.meter-fill`
  // leaves every HUD meter orange.
  it('a toned fill beats the accent gradient, and the shimmer rides on top of it', () => {
    const track = getComputedStyle(document.body.appendChild(meter(64)));
    expect(track.height).toBe('5px');
    expect(track.borderRadius).toBe('3px');
    expect(track.background).toBe('var(--track)');
    expect(track.overflow).toBe('hidden');

    const accent = getComputedStyle(meter(64).firstElementChild as HTMLElement);
    expect(accent.backgroundImage).toBe('linear-gradient(90deg,#f28c0e,#ffb95e,#f28c0e)');
    expect(accent.backgroundSize).toBe('200% 100%');

    // `flat` is in the loop and not beside it: it is the same shape of rule as the three HUD
    // tones, and it is the only one no HUD reads, so deleting its rule would otherwise cost
    // nothing. It resolves to the same token the gradient's stops are drawn from, at one stop.
    for (const [tone, token] of [['hp', '--hp'], ['prayer', '--prayer'], ['run', '--run'], ['flat', '--accent']] as const) {
      const el = document.body.appendChild(meter(50, { tone }));
      expect(getComputedStyle(el.firstElementChild as HTMLElement).background, tone).toBe(`var(${token})`);
    }
    const shimmer = document.body.appendChild(meter(64, { shimmer: true }));
    expect(getComputedStyle(shimmer.firstElementChild as HTMLElement).animation).toBe('shimmer 2.4s linear infinite');
  });
});

// The icon family, read back off what `icon()` actually returns rather than off a `<div>` wearing
// the class: an `<svg>` is not an HTMLElement, and `className` on one is an SVGAnimatedString, so
// `computed()` above cannot build this subject at all. Two claims, and both are the family's whole
// contract: the glyph takes its colour from whatever it sits in, and its ends and corners are
// round, which is what makes an 11-glyph set drawn at 1.5px read as one hand.
describe('the icon family reaches the svg the builder emits', () => {
  it('a glyph inherits its colour and never sets its own', () => {
    const el = icon('bank');
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    expect(cs.color).toBe('inherit');
    expect(cs.display).toBe('block');
    expect(cs.flex).toBe('0 0 auto');   // `flex: none` longhand, as jsdom expands it
  });

  // Every shape the eleven glyphs are built from is named, because a shape the rule misses draws
  // with mitred corners beside ten that do not. Mutation target: dropping `polyline` fails on xp.
  it('rounds the ends and the corners of every shape the set draws', () => {
    const joins = declarationsOf('.icon path, .icon polyline, .icon circle, .icon rect');
    expect(joins.getPropertyValue('stroke-linecap')).toBe('round');
    expect(joins.getPropertyValue('stroke-linejoin')).toBe('round');
  });
});
