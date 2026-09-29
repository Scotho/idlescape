// web/src/styles/cascade.overlay.test.ts -- the overlay family, read back through the whole
// cascade: the canvas pills, the HUD pill, the xp drop, the window chrome both stage windows
// share, and the menu classes.
//
// Split out of cascade.builders.test.ts rather than grown into it, on the precedent Task 6 set
// when it split cascade.test.ts: the two files ask the same question through the same harness and
// differ only by subject, and this one has a subject of its own. Everything here is an ORDER claim
// or a declaration read out of the cascade, because jsdom weighs no specificity and lays nothing
// out; whether a pill LOOKS right over the canvas is a pixel claim and belongs in a Playwright
// spec (Task 21).
import { beforeAll, describe, expect, it } from 'vitest';
import { hudPill, menu, pill } from '../ui/parts';
import { computed, declarationsOf, loadCascade } from './cascade.harness';

beforeAll(() => { loadCascade(); });

// The overlay family is the one that floats, and every one of its literals is a design number the
// mock states outright (map-design 2.16, 2.17, 3.4 to 3.6). Its modifiers are the same shape as the
// data family's: bare single-class rules after the rule they beat, with two exceptions that are
// spelled as descendants and are noted where they are read.
describe('the overlay family reaches the DOM its builders emit', () => {
  it('a pill is the scrim, the mono face and the 3px radius, before any tone', () => {
    const cs = getComputedStyle(document.body.appendChild(pill('Woodcutting · 24,180 xp/h')));
    expect(cs.background).toBe('var(--overlay-scrim)');
    expect(cs.fontFamily).toBe('var(--font-num)');
    expect(cs.fontSize).toBe('var(--fs-tiny)');
    expect(cs.fontWeight).toBe('700');
    expect(cs.padding).toBe('2px 7px');
    expect(cs.gap).toBe('6px');
    expect(cs.borderRadius).toBe('var(--r-pill-sm)');
    expect(cs.borderWidth).toBe('1px');
    expect(cs.borderStyle).toBe('solid');
    // The blur is the fifth literal and the one declaration this file's header calls the family's
    // exclusive property, so it is pinned like the other four. jsdom's computed style drops
    // `backdrop-filter` entirely, so it is read out of the cascade instead of off the element.
    expect(declarationsOf('.ov-pill').getPropertyValue('backdrop-filter')).toBe('blur(2px)');
  });

  // Five tones and five borders, and the tone rules follow `.ov-pill`'s own grey border, which is
  // an order claim: hoisting them above it leaves every pill neutral with nothing else failing.
  it('every tone paints its own border and text colour', () => {
    const TONES = [
      ['accent', 'rgba(255, 152, 31, 0.35)', 'var(--accent)'],
      ['ok', 'rgba(67, 160, 71, 0.4)', 'var(--ok)'],
      ['warn', 'rgba(255, 179, 0, 0.4)', 'var(--warn)'],
      ['error', 'rgba(229, 57, 53, 0.4)', 'var(--error)'],
      ['neutral', 'rgba(128, 128, 128, 0.4)', 'var(--text)']
    ] as const;
    for (const [tone, border, color] of TONES) {
      const cs = getComputedStyle(document.body.appendChild(pill('x', tone)));
      expect(cs.borderColor, tone).toBe(border);
      expect(cs.color, tone).toBe(color);
    }
  });

  // map-design note S20: the two canvas corner pills are a step larger than the component, and the
  // accent one a step brighter. Both rules follow the tone block, which is the only reason the
  // second one wins at all; it is (0,2,0) against (0,1,0) as well, so it wins twice over.
  it('the corner geometry beats the component the pill is built from', () => {
    const cs = getComputedStyle(document.body.appendChild(pill('● claude driving', 'accent', { corner: true })));
    expect(cs.padding).toBe('3px 8px');
    expect(cs.fontSize).toBe('var(--fs-small)');
    expect(cs.borderColor).toBe('rgba(255, 152, 31, 0.4)');
  });

  // The bar, the label and the fill are written as `.hud-pill` descendants because the pre-v2
  // status HUD in the same file still owns those three names at (0,1,0) until Task 13 deletes it.
  // Read through a real pill, which is the only place they are ever worn.
  it('a hud pill is a pill with a 42x4 bar, one tone per meter', () => {
    const METERS = [
      ['hp', 'rgba(192, 57, 43, 0.45)', 'var(--hp)', 'var(--hp-bright)'],
      ['prayer', 'rgba(41, 128, 185, 0.45)', 'var(--prayer)', 'var(--prayer-bright)'],
      ['run', 'rgba(39, 174, 96, 0.45)', 'var(--run)', 'var(--run-bright)']
    ] as const;
    for (const [meterName, border, fill, label] of METERS) {
      const el = document.body.appendChild(hudPill(meterName, 78, '14/18'));
      expect(getComputedStyle(el).borderColor, meterName).toBe(border);
      expect(getComputedStyle(el).background, meterName).toBe('var(--overlay-scrim)');
      expect(getComputedStyle(el.querySelector('.hud-fill') as HTMLElement).background, meterName).toBe(fill);
      expect(getComputedStyle(el.querySelector('.hud-label') as HTMLElement).color, meterName).toBe(label);
    }
    const hp = document.body.appendChild(hudPill('hp', 78, '14/18'));
    const bar = getComputedStyle(hp.querySelector('.hud-bar') as HTMLElement);
    expect(bar.width).toBe('42px');
    expect(bar.height).toBe('4px');
    expect(bar.background).toBe('rgba(255, 255, 255, 0.14)');
    expect(bar.overflow).toBe('hidden');
    // The value is white whatever the meter is, and the label is the only toned part.
    expect(getComputedStyle(hp.querySelector('.hud-value') as HTMLElement).color).toBe('rgb(255, 255, 255)');
  });

  // Task 13 deleted the pre-v2 status HUD, so `.hud-bar`, `.hud-label` and `.hud-fill` are worn
  // in exactly one place: inside a `.hud-pill`. They stay written as descendants, and this is the
  // case that says so. Mutation target: unscoping any of the three gives every bare `.hud-bar` a
  // 42px width, which is the pre-v2 grid bug in reverse and nothing else in the suite can see.
  it('keeps the pill internals inside the pill, where their geometry is the only true one', () => {
    expect(computed('span', 'hud-bar').width).toBe('');
    expect(computed('span', 'hud-label').fontFamily).toBe('');
    expect(computed('span', 'hud-fill').height).toBe('');
  });

  // The three pills the frame draws are the only members of this family that place themselves.
  // The mock puts the xp line and the pairing pill in opposite top corners at 10px (map-design
  // 3.4); the status pill is not in the mock and trails the xp line by one pill height until its
  // four session strings move onto the co-pilot bar (plan ruling R5).
  it('pins the frame pills to the canvas corners the mock states', () => {
    const xp = computed('span', 'ov-pill ov-pill-corner ov-xp');
    expect(xp.position).toBe('absolute');
    expect([xp.top, xp.left]).toEqual(['10px', '10px']);
    const pairing = computed('span', 'ov-pill ov-pill-corner ov-pairing');
    expect([pairing.top, pairing.right]).toEqual(['10px', '10px']);
    const status = computed('span', 'ov-pill ov-pill-corner ov-status');
    expect([status.top, status.left]).toEqual(['36px', '10px']);
  });

  it('the window family default is the neutral ground, and warm is the only modifier that repaints it', () => {
    const plain = computed('div', 'window');
    expect(plain.position).toBe('absolute');
    expect(plain.zIndex).toBe('var(--z-stage-window)');
    expect(plain.background).toBe('var(--window)');
    expect(plain.borderRadius).toBe('var(--r-window)');
    expect(plain.borderColor).toBe('rgba(255, 255, 255, 0.08)');
    expect(plain.boxShadow).toBe('0 18px 50px rgba(0,0,0,.6)');
    expect(plain.overflow).toBe('hidden');

    const warm = computed('div', 'window window-warm');
    expect(warm.background).toBe('var(--bank-ground)');
    expect(warm.boxShadow).toBe('0 20px 60px rgba(0,0,0,.65)');
  });

  // The bank's header gradient and the centred window's wider header padding are the two rules in
  // this family written as child combinators, so each has to be read off a built window rather than
  // off a bare class list. Mutation target: moving either above `.window-head` restores the flat
  // chrome bar and the 8px 10px padding, which is the bank window losing its warm identity.
  it('the two head modifiers follow the head rule they beat', () => {
    const build = (cls: string): HTMLElement => {
      const win = document.body.appendChild(document.createElement('div'));
      win.className = cls;
      const head = win.appendChild(document.createElement('div'));
      head.className = 'window-head';
      return head;
    };
    expect(getComputedStyle(build('window')).background).toBe('var(--chrome-bar)');
    expect(getComputedStyle(build('window window-warm')).background)
      .toBe('linear-gradient(180deg, var(--bank-head), var(--bank-ground))');
    expect(getComputedStyle(build('window')).padding).toBe('8px 10px');
    expect(getComputedStyle(build('window window-centred')).padding).toBe('8px 12px');
  });

  it('placement is a modifier, and a surface picks exactly one', () => {
    const docked = computed('div', 'window window-docked');
    expect(docked.right).toBe('16px');
    expect(docked.bottom).toBe('16px');
    const centred = computed('div', 'window window-centred');
    expect(centred.left).toBe('50%');
    expect(centred.top).toBe('50%');
    expect(centred.transform).toBe('translate(-50%, -50%)');
  });

  // The close is the shared 24px control, and it is a class rather than a per-surface one-off in
  // three layout files. jsdom matches no `:hover`, so the hover half is read out of the cascade.
  it('the window close is the shared 24px control', () => {
    const close = computed('button', 'window-close');
    expect(close.width).toBe('var(--ctl-h-tiny)');
    expect(close.height).toBe('var(--ctl-h-tiny)');
    expect(close.color).toBe('var(--text-muted)');
    expect(declarationsOf('.window-close:hover').getPropertyValue('color')).toBe('var(--text-strong)');
  });

  // The stack the HUD pills hang in, the drop the canvas throws, and the window's own content
  // classes. Task 13 mounts markup into the first two; Tasks 16 and 17 take the third. The stack
  // places ITSELF rather than being placed by `.plugin-overlays`, which is a full-bleed layer for
  // that reason. Mutation target: deleting any single rule below leaves the suite green without
  // it, and moving the two offsets onto the host puts the HUD at twice the inset.
  it('places the hud stack, the xp drop and the window content classes', () => {
    const stack = computed('div', 'hud-stack');
    expect(stack.top).toBe('42px');
    expect(stack.right).toBe('10px');
    expect(stack.alignItems).toBe('flex-end');
    expect(stack.animation).toBe('popIn .2s ease');
    // ...and the layer it hangs in states no offset of its own, which is what makes the two above
    // resolve against the canvas. Read here rather than in a layout test because it is the other
    // half of this rule: whoever moves one has to move the other.
    // jsdom does not expand the `inset` shorthand, so this is read out of the cascade rather than
    // off an element: `inset: 0` present, and no offset of its own beside it.
    const host = declarationsOf('.plugin-overlays');
    expect(host.getPropertyValue('inset')).toBe('0');
    expect([host.getPropertyValue('top'), host.getPropertyValue('right')]).toEqual(['', '']);
    // ...and because it is full-bleed, this one declaration is the only thing between the player
    // and a transparent sheet that eats every click on the game canvas. It was a HUD-sized box
    // before Task 13 widened it, so losing it used to cost a corner and now costs the whole view.
    // Mutation target: deleting it leaves every other style test green and only Playwright red.
    expect(host.getPropertyValue('pointer-events')).toBe('none');
    // The pill's border width is the pill's; the three `.hud-pill-*` rules below it write a colour
    // and nothing else, so this is where a hud pill's border is declared to exist.
    expect(computed('span', 'hud-pill').borderWidth).toBe('1px');

    const drop = computed('span', 'xp-drop');
    expect(drop.left).toBe('50%');
    expect(drop.top).toBe('20%');
    expect(drop.transform).toBe('translateX(-50%)');
    expect(drop.pointerEvents).toBe('none');
    // 2.6s and `forwards`, which is what Task 13's animationend teardown is timed against.
    expect(drop.animation).toBe('floatUp 2.6s ease-out forwards');
    expect(computed('span', 'xp-drop-chip').background).toBe('var(--xp-chip)');
    // The 8-way black outline is the whole of why a white number is legible over the game.
    expect(computed('span', 'xp-drop-value').textShadow.split(',')).toHaveLength(8);

    expect(computed('span', 'window-title').color).toBe('var(--text-strong)');
    expect(computed('span', 'window-sub').color).toBe('var(--text-muted)');
    // The body scrolls and the head and foot do not, which is the whole of the window's layout.
    expect(computed('div', 'window-body').overflowY).toBe('auto');
    expect(computed('div', 'window-body').minHeight).toBe('0');
    const foot = computed('div', 'window-foot');
    expect(foot.color).toBe('var(--text-faint)');
    expect(foot.fontSize).toBe('var(--fs-micro)');
    expect(foot.padding).toBe('6px 10px');
  });

  // The menu family ships with no behaviour behind it (decision D88), so this case is the only
  // thing in the suite that reads its rules at all: without it, every one of them could be deleted
  // and the whole suite would stay green until sprint 3 opened its first menu.
  it('a menu is the floating language at menu size, and its items are flat rows', () => {
    const box = computed('div', 'menu');
    expect(box.position).toBe('absolute');
    expect(box.zIndex).toBe('var(--z-stage-window)');
    expect(box.background).toBe('var(--window)');
    expect(box.minWidth).toBe('132px');
    expect(box.borderRadius).toBe('var(--r-ctl)');

    const item = getComputedStyle(document.body.appendChild(menu([{ label: 'Mute', onSelect: () => {} }]))
      .querySelector('.menu-item') as HTMLElement);
    expect(item.height).toBe('var(--ctl-h-quiet)');
    expect(item.borderRadius).toBe('var(--r-ctl-sm)');
    expect(item.borderWidth).toBe('0px');
    expect(item.textAlign).toBe('left');
    expect(declarationsOf('.menu-item:disabled').getPropertyValue('color')).toBe('var(--text-disabled)');
    expect(declarationsOf('.menu-item:hover:not(:disabled)').getPropertyValue('background')).toBe('var(--control-hover)');
  });
});
