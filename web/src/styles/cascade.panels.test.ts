// web/src/styles/cascade.panels.test.ts -- the five panels README never describes (Task 20),
// read back through the whole cascade.
//
// Everything here is a claim the unit tests beside each panel cannot make. A panel test can say
// the markup wears `card card-hero connect-card`; only the cascade can say that the composition
// leaves the card family drawing the ground and the layout file drawing nothing but the stack.
// The same for the four others: the Plugins panel's 6px rhythm against the body's 10px, the
// screenshot tile's fixed height and checkerboard ground, the notes textarea escaping the input
// family's fixed control height, and the settings row capping a select the way it caps an input.
import { beforeAll, describe, expect, it } from 'vitest';
import { computed, declarationsOf, loadCascade } from './cascade.harness';

beforeAll(() => { loadCascade(); });

describe('the Claude panel', () => {
  // map-design 3.14's unpaired card is the hero card: gradient ground, hairline, 12px. If the
  // layout file drew any of that back, the two would fight and the panel would drift the moment
  // card.css changed.
  it('composes the hero card and redraws none of it', () => {
    const composed = computed('div', 'card card-hero connect-card');
    expect(composed.padding).toBe('12px');
    expect(composed.background).toBe('var(--card-grad)');
    expect(composed.display).toBe('flex');
    expect(composed.gap).toBe('8px');
    const own = declarationsOf('.connect-card');
    expect(own.getPropertyValue('background')).toBe('');
    expect(own.getPropertyValue('border')).toBe('');
    expect(own.getPropertyValue('border-radius')).toBe('');
  });

  // The pairing link is the one control in the shell that may not be capped: a 55% link is an
  // unreadable link. The row is its own class since Task 20, because the card's first child is
  // the heading now and the old rule selected on `:first-child`.
  it('lets the pairing link take the whole row and never shrinks the Copy button', () => {
    expect(computed('div', 'connect-url-row').gap).toBe('5px');
    expect(declarationsOf('.connect-url-row .input').getPropertyValue('max-width')).toBe('none');
    expect(declarationsOf('.connect-url-row .btn').getPropertyValue('flex')).toBe('none');
  });

  it('weights the phrase the player has to type, and keeps the waiting row the quietest', () => {
    expect(declarationsOf('.connect-hint b').getPropertyValue('color')).toBe('var(--text-strong)');
    const wait = computed('div', 'connect-wait');
    expect(wait.color).toBe('var(--text-faint)');
    expect(wait.fontSize).toBe('var(--fs-small)');
  });

  it('draws a session row meta line at the mock micro size, not the row size', () => {
    const meta = declarationsOf('.session-row .kv-label');
    expect(meta.getPropertyValue('font-size')).toBe('var(--fs-micro)');
    expect(meta.getPropertyValue('color')).toBe('var(--text-faint)');
  });
});

describe('the Notes panel', () => {
  // `.input` carries a fixed 27px height. A textarea wearing it is a one-line box that only
  // looked right because `.notes-body` set a min-height; the class is the actual fix.
  it('takes the textarea family, not the fixed control height of the input family', () => {
    const notes = computed('textarea', 'textarea notes-body');
    expect(notes.height).toBe('');
    expect(notes.padding).toBe('9px');
    expect(notes.flex).toBe('1 1 0%');
    expect(notes.minHeight).toBe('160px');
    // The reason the class matters, stated as the rule it escaped: the input family carries a
    // fixed control height and the textarea family carries none.
    expect(declarationsOf('.input').getPropertyValue('height')).toBe('var(--ctl-h)');
    expect(declarationsOf('.textarea').getPropertyValue('height')).toBe('');
  });
});

describe('the Screenshot panel', () => {
  it('grids the thumbnails two up at the mock gap, each tile a fixed 58px', () => {
    const strip = computed('div', 'shot-strip');
    expect(strip.gridTemplateColumns).toBe('1fr 1fr');
    expect(strip.gap).toBe('6px');
    const thumb = computed('img', 'shot-thumb');
    expect(thumb.height).toBe('58px');
    expect(thumb.cursor).toBe('pointer');
  });

  // The checkerboard is what a capture with transparency sits on; the two greys are tokens under
  // ruling R18, so a palette change reaches them.
  it('lays the checkerboard ground from the two shot tokens and lights the tile orange on hover', () => {
    expect(declarationsOf('.shot-thumb').getPropertyValue('background'))
      .toBe('repeating-linear-gradient(45deg, var(--shot-a) 0 8px, var(--shot-b) 8px 16px)');
    // jsdom matches no :hover, so the rule is read out of the cascade rather than off an element.
    expect(declarationsOf('.shot-thumb:hover').getPropertyValue('border-color')).toBe('rgba(255,152,31,.5)');
  });
});

describe('the Plugins panel', () => {
  // map-design 3.18 is the one panel drawn on a 6px rhythm. `.panel-body`'s gap belongs to the
  // frame, so the panel brings a container of its own rather than restyling the body it lands in.
  it('holds its rows at 6px where the panel body holds everything else at 10px', () => {
    expect(computed('div', 'plugin-panel').gap).toBe('6px');
    expect(computed('div', 'panel-body').gap).toBe('10px');
  });

  it('sets the row rhythm and the always-on marker at the mock values', () => {
    const row = computed('div', 'plugin-row');
    expect(row.padding).toBe('9px 2px');
    expect(row.columnGap).toBe('9px');
    const marker = declarationsOf('.plugin-controls .muted');
    expect(marker.getPropertyValue('font-size')).toBe('9px');
    expect(marker.getPropertyValue('color')).toBe('var(--text-disabled)');
  });

  // A plugin settings row caps its control at half the row. Task 20 gave a select field the
  // family's own `.select`, so the cap had to learn the second class or every select in a
  // settings form would have run the full width.
  it('caps a settings select at half the row, the same as an input', () => {
    const rule = declarationsOf('.setting-row .input, .setting-row .select');
    expect(rule.getPropertyValue('max-width')).toBe('50%');
  });
});
