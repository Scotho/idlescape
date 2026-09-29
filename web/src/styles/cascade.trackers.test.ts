// web/src/styles/cascade.trackers.test.ts -- the two tracker panels and the pinned card, read
// back through the whole cascade.
//
// Three claims live here and nowhere else. The XP card's own padding beats the card family's,
// which is only true because layout/ is imported after every family and the two selectors are at
// equal specificity: swap the import order in index.css and the panel silently takes 11px flat
// with every unit test still green. The pinned card is chrome inside the panel and not a card on
// top of it, so it takes the bar ground rather than the card one. And `.empty`, the one-line list
// state, is still a different thing from `.empty-state`, the whole-panel one, after Task 19
// converted the first onto the v2 tokens.
import { beforeAll, describe, expect, it } from 'vitest';
import { computed, declarationsOf, loadCascade } from './cascade.harness';

beforeAll(() => { loadCascade(); });

describe('the XP tracker card', () => {
  it('takes the panel padding over the card family default, which order alone decides', () => {
    // .card is `padding: 11px` in card.css; .xp-card is `10px 11px` in layout/panels.css.
    expect(computed('div', 'card xp-card').padding).toBe('10px 11px');
    expect(computed('div', 'card').padding).toBe('11px');
  });

  it('places the meter and the footer at the mock offsets without redrawing either', () => {
    expect(declarationsOf('.xp-card .meter').getPropertyValue('margin-top')).toBe('8px');
    expect(declarationsOf('.xp-foot').getPropertyValue('margin-top')).toBe('4px');
    // The layout file places the meter; the family still draws it.
    expect(computed('div', 'meter').height).toBe('5px');
  });

  it('draws the level chip as a 26px square and the gain in the numeric face', () => {
    const chip = computed('span', 'xp-level');
    expect(chip.width).toBe('26px');
    expect(chip.height).toBe('26px');
    expect(chip.color).toBe('var(--accent-bright)');
    expect(computed('span', 'xp-gain').fontFamily).toBe('var(--font-num)');
    expect(computed('span', 'xp-gain').color).toBe('var(--ok-pop)');
  });

  // Both rows are drawn with a `flex:1` spacer span in the mock and with space-between here. If
  // the declaration goes, the two halves collapse together against the left edge and nothing in
  // xpTracker.test.ts moves, because the markup is identical either way.
  it('separates each two-part row with space-between, which is what replaces the mock spacer', () => {
    expect(computed('div', 'xp-head').justifyContent).toBe('space-between');
    expect(computed('div', 'xp-foot').justifyContent).toBe('space-between');
  });
});

describe('the loot tracker list', () => {
  it('hairlines between rows without touching the kv family itself', () => {
    expect(declarationsOf('.loot-list .kv + .kv').getPropertyValue('border-top')).toBe('1px solid var(--hairline-soft)');
    expect(computed('div', 'kv').getPropertyValue('border-top')).toBe('');
  });

  it('gives the count line the header treatment, not the body one', () => {
    expect(computed('span', 'loot-count').fontSize).toBe('var(--fs-small)');
    expect(computed('span', 'loot-count').color).toBe('var(--text-muted)');
  });
});

describe('the pinned XP card', () => {
  // The host ships hidden and stays hidden until a pin fills it, on base.css's `.hidden` alone.
  // layout/frame.css carried a `.pinned-tracker.hidden { display: none }` of its own until fix
  // round 1 deleted it: base.css's declaration is `!important`, so no normal declaration at any
  // specificity can lose to it and no normal declaration can add to it either.
  it('is chrome inside the panel: the bar ground, not the card one', () => {
    const host = computed('div', 'pinned-tracker');
    expect(host.background).toBe('var(--bar)');
    expect(host.padding).toBe('9px 12px');
    expect(host.flex).toBe('0 0 auto');
  });

  it('pushes the rate to the end of the value row, which replaces the mock spacer', () => {
    expect(computed('span', 'pin-sub').marginLeft).toBe('auto');
    expect(computed('div', 'pin-value').alignItems).toBe('baseline');
    // layout/frame.css is a converted file, so its offsets are token names; --sp-4 is the
    // mock's 6px. layout/panels.css is still frozen under ruling R2, which is why the XP card's
    // own 8px above is a literal in the same shell.
    expect(declarationsOf('.pinned-tracker .meter').getPropertyValue('margin-top')).toBe('var(--sp-4)');
  });

  it('lets the section label take the label row so the unpin button sits at the end', () => {
    expect(declarationsOf('.pin-head .section-label').getPropertyValue('flex')).toBe('1');
    // The label itself is still the family's: the layout file places it, it does not redraw it.
    expect(computed('span', 'section-label').textTransform).toBe('uppercase');
  });
});

describe('the two empty states stay two things after Task 19 converted the first', () => {
  it('the one-line list state is v2-toned and carries no circle, gap or bob', () => {
    const one = computed('div', 'empty');
    expect(one.color).toBe('var(--text-muted)');
    expect(one.fontSize).toBe('var(--fs-base)');
    expect(one.padding).toBe('var(--sp-5) 0');
    expect(one.animation).toBe('');
  });

  // The one value in the conversion that MOVED rather than being restated in tokens: 600 to 650.
  // alert.css names it; this pins it, so restoring the pre-v2 weight is a red test rather than a
  // silent second bold in a file whose other two titles are both the family's semibold.
  it('the list state title takes the v2 semibold, the same weight as the other two titles', () => {
    expect(computed('span', 'empty-title').fontWeight).toBe('650');
    expect(computed('div', 'empty-title').color).toBe('var(--text)');
    expect(computed('div', 'alert-title').fontWeight).toBe('650');
    expect(computed('div', 'empty-state-title').fontWeight).toBe('650');
  });

  it('the whole-panel state is still the bobbing 40px pattern', () => {
    expect(computed('span', 'empty-state-mark').animation).toContain('bob');
    expect(computed('div', 'empty-state').flex).toBe('1 1 0%');
  });

  it('the toast keeps its tone rail on the v2 palette', () => {
    expect(computed('div', 'toast').background).toBe('var(--panel)');
    expect(computed('div', 'toast toast-error').borderLeftColor).toBe('var(--error)');
    expect(computed('div', 'toast').borderRadius).toBe('var(--r-ctl)');
  });
});
