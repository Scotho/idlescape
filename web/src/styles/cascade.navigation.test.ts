// web/src/styles/cascade.navigation.test.ts -- the navigation family and the frame chrome it
// lives in, read back through the whole cascade: the icon strip, the character tabs, and the
// regions of layout/frame.css that the mock gives metrics for.
//
// Split out on the precedent Task 7 set with cascade.overlay.test.ts: same harness, same
// question, its own subject. Everything here is an ORDER claim or a declaration read out of the
// cascade, because jsdom weighs no specificity and lays nothing out. Whether the side panel is
// actually full height is a pixel claim and belongs in a Playwright spec (Task 21).
import { beforeAll, describe, expect, it } from 'vitest';
import { computed, declarationsInMedia, declarationsOf, loadCascade } from './cascade.harness';

beforeAll(() => { loadCascade(); });

describe('the strip is a rail, and the rail shares its property with the focus ring', () => {
  it('a strip button rests on the mock metrics with its rail hidden', () => {
    const cs = computed('button', 'strip-btn');
    expect(cs.height).toBe('var(--strip-btn-h)');
    expect(cs.width).toBe('100%');
    expect(cs.color).toBe('var(--glyph-rest)');
    expect(cs.background).toBe('rgba(0, 0, 0, 0)');
    expect(cs.boxShadow).toBe('inset 2px 0 0 transparent');
  });

  // An order claim: `.strip-btn.active` follows `.strip-btn`, and hoisting it above leaves every
  // open panel's button resting grey with the rail invisible and nothing else failing.
  it('the active button paints the rail, the card ground and the accent glyph', () => {
    const cs = computed('button', 'strip-btn active');
    expect(cs.boxShadow).toBe('inset 2px 0 0 var(--accent)');
    expect(cs.background).toBe('var(--card)');
    expect(cs.color).toBe('var(--accent)');
  });

  // The rail and the one focus ring are the same property, so a ring that does not restate the
  // rail deletes it, and a rail that is not restated deletes the ring. Both rules exist for that,
  // and jsdom matches no `:focus-visible`, so they are read out of the cascade. Off a rule the
  // camelCase accessors are unpopulated, so a declaration is read by its CSS name.
  it('both focus rings restate the rail they are composed over', () => {
    expect(declarationsOf('.strip-btn:focus-visible').getPropertyValue('box-shadow'))
      .toBe('inset 2px 0 0 transparent, var(--focus-ring)');
    expect(declarationsOf('.strip-btn.active:focus-visible').getPropertyValue('box-shadow'))
      .toBe('inset 2px 0 0 var(--accent), var(--focus-ring)');
  });

  it('the strip reserves the width the canvas reserves, and its tooltip sits in the panel lane', () => {
    const cs = computed('nav', 'icon-strip');
    expect(cs.width).toBe('var(--strip-w)');
    expect(cs.background).toBe('var(--bar)');
    expect(cs.flexDirection).toBe('column');
    const tip = declarationsOf('.strip-btn[data-tip]::after');
    expect(tip.getPropertyValue('content')).toBe('attr(data-tip)');
    expect(tip.getPropertyValue('z-index')).toBe('var(--z-panel)');
    expect(tip.getPropertyValue('opacity')).toBe('0');
  });

  // The other half of Task 9's `.strip-gear` to `.strip-tail` rename. `buildStrip`'s two spacer
  // cases prove the class LANDS on the head of the bottom group; this is the only thing that
  // proves the class DOES anything. `margin-top: 0` in its place leaves every other file green
  // while Plugins and Configuration float back up against Bank and Account.
  it('the head of the bottom group carries the spacer that pushes it down', () => {
    expect(computed('button', 'strip-btn strip-tail').marginTop).toBe('auto');
    // Across the row it is a left margin instead, or the bottom group sits in the middle of the bar.
    expect(declarationsInMedia('(max-width: 700px)', '.strip-tail').getPropertyValue('margin'))
      .toBe('0 0 0 auto');
  });

  // A separator is an EMPTY span, so down the column it is sized by `height` and across the row by
  // `width`. A rule that sets only the first paints a zero-width nothing under 700px, which is
  // what shipped until the fix round: the breakpoint turns the strip and the two group hairlines
  // have to turn with it. jsdom evaluates no media query, so the row rule is read out of its block.
  it('both group hairlines turn with the strip at the 700px breakpoint', () => {
    const cs = computed('span', 'strip-sep');
    expect(cs.height).toBe('1px');
    expect(cs.margin).toBe('4px 8px');
    expect(cs.background).toBe('var(--track)');
    const row = declarationsInMedia('(max-width: 700px)', '.strip-sep');
    expect(row.getPropertyValue('width')).toBe('1px');
    expect(row.getPropertyValue('height')).toBe('auto');
    expect(row.getPropertyValue('margin')).toBe('8px 4px');
  });

  // `.strip-dot` composes `.dot` from badge.css, which is 8px; the corner dot is 6. strip.css is
  // imported after badge.css, which is the only reason the smaller size wins.
  it('the run dot is the 6px corner mark, not the 8px status dot', () => {
    const cs = computed('span', 'strip-dot dot dot-accent');
    expect(cs.width).toBe('6px');
    expect(cs.height).toBe('6px');
    expect(cs.position).toBe('absolute');
    expect(cs.background).toBe('var(--accent)');
  });
});

describe('a character tab is four slots wide and one of them is lifted', () => {
  it('an inactive tab is the 148px slot in the quiet ramp', () => {
    const cs = computed('button', 'char-tab');
    expect(cs.minWidth).toBe('148px');
    expect(cs.height).toBe('100%');
    expect(cs.gap).toBe('7px');
    expect(cs.color).toBe('var(--text-quiet)');
    expect(cs.fontSize).toBe('var(--fs-small)');
    expect(cs.borderRadius).toBe('6px 6px 0 0');
  });

  // The same order claim the strip makes: `.char-tab.active` follows `.char-tab`, and the square
  // top corners are the tell that it does.
  it('the active tab squares its corners, takes the accent edge and lifts', () => {
    const cs = computed('button', 'char-tab active');
    expect(cs.borderRadius).toBe('0');
    expect(cs.borderBottomColor).toBe('var(--accent)');
    expect(cs.background).toBe('linear-gradient(180deg, var(--chrome-tab-active), var(--card))');
    expect(cs.boxShadow).toBe('0 6px 14px -8px rgba(255,152,31,.4)');
  });

  it('the active tab restates its lift so the focus ring survives it', () => {
    expect(declarationsOf('.char-tab.active:focus-visible').getPropertyValue('box-shadow'))
      .toBe('0 6px 14px -8px rgba(255,152,31,.4), var(--focus-ring)');
  });

  // map-design 2.19: the clock renders mono, the words "offline" and "coming soon" do not. The
  // face rides on `.num`, which characterTabs.ts adds only when the slot carries a clock.
  it('only a status marked as a clock takes the mono face', () => {
    expect(computed('span', 'char-tab-status').fontFamily).toBe('');
    expect(computed('span', 'char-tab-status num').fontFamily).toBe('var(--font-num)');
  });

  it('the two narrow slots are narrower than a character, and disabled reads disabled', () => {
    expect(computed('button', 'char-tab char-tab-empty').minWidth).toBe('124px');
    expect(computed('button', 'char-tab char-tab-locked').minWidth).toBe('124px');
    expect(computed('button', 'char-tab char-tab-more').minWidth).toBe('110px');
    expect(declarationsOf('.char-tab:disabled').color).toBe('var(--text-disabled)');
  });
});

describe('the frame chrome carries the mock metrics on tokens', () => {
  // The outcome, not the declaration: a column body plus `.stage { flex: 1 }` is what makes the
  // side panel and the icon strip full height. The pre-v2 `align-items: flex-start` row made the
  // stage content-height, which the Script Studio would later fail on silently (D22, D29).
  it('the frame body stacks, and the stage takes the height that is left', () => {
    expect(computed('div', 'frame-body').flexDirection).toBe('column');
    expect(declarationsOf('.stage').getPropertyValue('flex')).toBe('1');
    expect(computed('div', 'stage').alignItems).toBe('stretch');
    // The canvas stays pinned to the top of its column rather than stretching with the panel.
    expect(computed('div', 'canvas-wrap').alignItems).toBe('flex-start');
  });

  it('the title bar, the panel and the footer read their heights and widths off tokens', () => {
    expect(computed('header', 'frame-title').height).toBe('var(--title-h)');
    expect(computed('footer', 'frame-foot').height).toBe('var(--foot-h)');
    expect(computed('aside', 'side-panel').width).toBe('var(--panel-w)');
    expect(computed('div', 'panel-header').height).toBe('var(--panel-head-h)');
    expect(computed('nav', 'char-tabs').height).toBe('var(--tabs-h)');
  });

  // The mock draws an explicit spacer between the panel title and the Pin button. The title grows
  // instead, which is the same result with one node fewer; without it the Pin and the close
  // control sit against the title and the header stops matching the design.
  it('the panel title is the header spacer, so Pin and close stay at the right edge', () => {
    const title = declarationsOf('.panel-header b');
    expect(title.getPropertyValue('flex')).toBe('1');
    expect(title.getPropertyValue('font-size')).toBe('var(--fs-md)');
  });

  // Every panel's root child animates in from the layout file, which is what stops each panel
  // growing an entry animation of its own.
  it('the panel body animates its own children and nothing else does', () => {
    expect(declarationsOf('.panel-body > *').getPropertyValue('animation')).toBe('fadeUp .18s ease');
    expect(computed('div', 'panel-body').padding).toBe('11px');
    expect(computed('div', 'panel-body').gap).toBe('10px');
  });

  it('the pinned tracker is chrome inside the panel, not a card in the body', () => {
    const cs = computed('div', 'pinned-tracker');
    expect(cs.padding).toBe('9px 12px');
    expect(cs.background).toBe('var(--bar)');
    expect(cs.flex).toBe('0 0 auto');
  });
});

// Task 14's three siblings. They live in this file rather than one of their own because they are
// frame chrome: the mock draws them between the character tabs and the stage, and layout/frame.css
// (above) is what makes the body a column that can hold them.
describe('the co-pilot bar is one 42px row, and its state is carried on an attribute', () => {
  it('the bar takes the mock geometry off the token, and its parts hide by attribute', () => {
    const cs = computed('div', 'copilot-bar');
    expect(cs.height).toBe('var(--bar-h)');
    expect(cs.gap).toBe('10px');
    expect(cs.padding).toBe('0px 14px');
    expect(cs.flex).toBe('0 0 auto');   // `flex: none`, expanded by the cascade
    // The bar is a flex row, so the parts it hides per state need a rule that beats their own
    // display. Mutation target: delete it and the Esc hint shows in all five states.
    expect(declarationsOf('.copilot-bar [hidden]').getPropertyValue('display')).toBe('none');
  });

  // map-design 3.3, note S5: the clock is in the running, paused and stuck states, and it changes
  // colour rather than disappearing. The bar's own `data-state` is what drives both.
  it('the clock is accent while running and follows the state down', () => {
    expect(computed('span', 'copilot-elapsed').color).toBe('var(--accent-bright)');
    expect(declarationsOf('.copilot-bar[data-state="paused"] .copilot-elapsed').getPropertyValue('color')).toBe('var(--warn)');
    expect(declarationsOf('.copilot-bar[data-state="stuck"] .copilot-elapsed').getPropertyValue('color')).toBe('var(--text-muted)');
  });

  it('the rule is a decorative band that only animates while a run is live', () => {
    expect(computed('div', 'copilot-rule').height).toBe('2px');
    expect(declarationsOf('.copilot-rule[data-state="running"]').getPropertyValue('animation')).toBe('barflow 2.6s linear infinite');
    expect(declarationsOf('.copilot-rule[data-state="paused"]').getPropertyValue('background')).toBe('var(--warn)');
    expect(declarationsOf('.copilot-rule[data-state="stuck"]').getPropertyValue('background')).toBe('var(--error)');
  });

  it('the detail row puts what the run is doing left and what it is earning right', () => {
    expect(computed('div', 'copilot-detail').fontSize).toBe('var(--fs-small)');
    expect(computed('span', 'copilot-detail-what').textOverflow).toBe('ellipsis');
    const rate = computed('span', 'copilot-detail-rate');
    expect(rate.marginLeft).toBe('auto');
    expect(rate.color).toBe('var(--ok-pop)');
    // Amber, because a run recovering is not a run working. It composes `.dot`, so only the
    // colour and the ring are the pip's own.
    expect(computed('span', 'dot copilot-health').background).toBe('var(--warn)');
  });
});
