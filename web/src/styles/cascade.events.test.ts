// web/src/styles/cascade.events.test.ts -- the Events feed, read back through the whole cascade.
//
// Two order claims live here and nowhere else, plus the seam that lets the feed scroll. The
// row's rail is pure CSS off `[data-event-type]`,
// with the failure TONE written after the six type rules so a failed run is red-railed and
// amber-texted (the mock's row 10); moving the tone block above the types would leave a failure
// wearing the ordinary blue run rail with every unit test still green, because the markup is
// identical either way. And the compact empty state is a modifier on the same element rather than
// a second component, which is only true if its overrides sit after the component's own rules.
import { beforeAll, describe, expect, it } from 'vitest';
import { emptyState } from '../ui/parts';
import { eventRow } from '../plugins/builtin/eventsViews';
import { declarationsOf, loadCascade } from './cascade.harness';
import type { ShellEvent } from '../frame/events';

beforeAll(() => { loadCascade(); });

const ev = (over: Partial<ShellEvent> = {}): ShellEvent => ({
  seq: 1, at: 0, characterId: 'c1', characterName: 'shoth4019zr',
  type: 'run', skill: null, text: 'Mine and drop failed', tone: 'default', amount: null, ...over
});

const styled = (el: HTMLElement): CSSStyleDeclaration => {
  document.body.appendChild(el);
  return getComputedStyle(el);
};

describe('the event row takes its rail from its own data attributes', () => {
  it('gives each type its own rail colour, and no row a border of its own', () => {
    expect(styled(eventRow(ev({ type: 'xp' }))).borderLeftColor).toBe('var(--ok)');
    expect(styled(eventRow(ev({ type: 'loot' }))).borderLeftColor).toBe('var(--warn)');
    expect(styled(eventRow(ev({ type: 'run' }))).borderLeftColor).toBe('var(--info)');
    expect(styled(eventRow(ev({ type: 'bank' }))).borderLeftColor).toBe('var(--info-bright)');
    // The width and the transparent default are the row's own; only the colour is per type,
    // which is what keeps six rails in the stylesheet and none in the rendering code.
    expect(declarationsOf('.events-row').getPropertyValue('border-left')).toBe('2px solid transparent');
  });

  it('a failed run is red-railed and amber-texted, because the tone rules follow the type rules', () => {
    const row = eventRow(ev({ type: 'run', tone: 'fail' }));
    expect(styled(row).borderLeftColor).toBe('var(--error)');
    expect(getComputedStyle(row.querySelector('.events-text')!).color).toBe('var(--warn)');
  });

  it('a level row is the one type with a ground and a text colour of its own', () => {
    const row = eventRow(ev({ type: 'level', skill: 'Woodcutting', text: 'Level up! Woodcutting 34 to 35' }));
    expect(styled(row).borderLeftColor).toBe('var(--accent)');
    expect(styled(row).background).toBe('rgba(255, 152, 31, 0.07)');
    expect(getComputedStyle(row.querySelector('.events-text')!).color).toBe('var(--accent-bright)');
  });
});

describe('the feed scrolls inside the panel rather than stretching it', () => {
  it('takes the column and is allowed to shrink below its content', () => {
    const feed = declarationsOf('.events-feed');
    expect(feed.getPropertyValue('flex')).toBe('1');
    expect(feed.getPropertyValue('min-height')).toBe('0');
    expect(feed.getPropertyValue('overflow-y')).toBe('auto');
  });

  it('rests on `.panel-body`\'s own overflow, not on a `min-height` frame.css does not ship', () => {
    // `layout/events.css`'s header says so in prose; this is what makes the sentence checkable.
    // A non-visible overflow is the other way a flex item is taken off its automatic minimum
    // size, so dropping this declaration from frame.css would let the panel grow instead.
    const bodyRule = declarationsOf('.panel-body');
    expect(bodyRule.getPropertyValue('overflow-y')).toBe('auto');
    expect(bodyRule.getPropertyValue('min-height')).toBe('');
  });
});

describe('the two empty states are one component and one modifier', () => {
  it('the loot pattern fills its host and bobs', () => {
    const el = emptyState('◌', 'Nothing looted yet', 'copy');
    expect(styled(el).flex).toBe('1 1 0%');
    expect(styled(el).padding).toBe('36px 12px');
    expect(getComputedStyle(el.querySelector('.empty-state-mark')!).width).toBe('40px');
    expect(getComputedStyle(el.querySelector('.empty-state-mark')!).animation).toContain('bob');
  });

  it('the Events pattern overrides seven metrics and stops the bob', () => {
    const el = emptyState('⌕', 'No events match', 'copy', null, { compact: true });
    expect(styled(el).flex).toBe('0 0 auto');
    expect(styled(el).padding).toBe('28px 12px');
    expect(styled(el).gap).toBe('7px');
    const mark = getComputedStyle(el.querySelector('.empty-state-mark')!);
    expect(mark.width).toBe('34px');
    expect(mark.animation).toBe('none');
    expect(getComputedStyle(el.querySelector('.empty-state-title')!).fontSize).toBe('var(--fs-md)');
    expect(getComputedStyle(el.querySelector('.empty-state-copy')!).maxWidth).toBe('180px');
  });
});
