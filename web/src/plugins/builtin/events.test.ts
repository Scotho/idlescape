// web/src/plugins/builtin/events.test.ts -- the Events panel over a real event bus.
//
// The collaborator is `createEventBus` itself, not a fake: it is twelve lines of frame code with
// no network and no timer, so a stand-in could only be looser. The panel holds no timer of its
// own either; every case here is driven by an emit or a click.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEventsPlugin } from './events';
import { EVENTS_EMPTY_COPY } from '../../ui/copy';
import { UNTRUSTED_HEADER } from './traceView';
import { createEventBus, type EventBus } from '../../frame/events';
import type { PluginContext } from '../types';

const notify = vi.fn();

function ctx(): PluginContext {
  return {
    client: () => null,
    settings: { get: (() => undefined) as PluginContext['settings']['get'], set: vi.fn(), subscribe: () => () => {} },
    storage: { get: () => null, set: () => {} },
    notify, openPanel: vi.fn(), user: () => null
  };
}

const XP = { characterId: 'c1', characterName: 'shoth4019zr', type: 'xp' as const, skill: 'Woodcutting', tone: 'default' as const, amount: 250 };
const LOOT = { characterId: 'c2', characterName: 'alt_miner', type: 'loot' as const, skill: null, tone: 'default' as const, amount: 3 };
const LEVEL = { characterId: 'c1', characterName: 'shoth4019zr', type: 'level' as const, skill: 'Woodcutting', tone: 'default' as const, amount: null };
const BANK = { characterId: null, characterName: null, type: 'bank' as const, skill: null, tone: 'default' as const, amount: null };

let bus: EventBus;
let clock = 0;

beforeEach(() => {
  notify.mockClear();
  clock = new Date(2026, 8, 7, 14, 5).getTime();
  bus = createEventBus({ now: () => (clock += 60_000) });
});

/** Three events, one per character, two skills and three types. */
function seed(): void {
  bus.emit({ ...XP, text: '+250 Woodcutting xp' });
  bus.emit({ ...LOOT, text: 'Picked up 3 iron ore' });
  bus.emit({ ...LEVEL, text: 'Level up! Woodcutting 34 to 35' });
}

function open(characters: string[] = ['shoth4019zr', 'alt_miner']) {
  const plugin = createEventsPlugin({ bus, characters: () => characters });
  const view = plugin.panel!(ctx());
  const body = document.createElement('div');
  view.mount(body);
  return { plugin, view, body };
}
const mount = (characters?: string[]): HTMLElement => open(characters).body;

const feedText = (body: HTMLElement): (string | null)[] =>
  [...body.querySelectorAll('.events-row .events-text')].map(n => n.textContent);
const foot = (body: HTMLElement): string => body.querySelector('.events-foot')!.textContent ?? '';
const chip = (body: HTMLElement, label: string): HTMLButtonElement =>
  [...body.querySelectorAll<HTMLButtonElement>('.chip')].find(c => c.textContent === label)!;
const segLabels = (body: HTMLElement): (string | null)[] =>
  [...body.querySelectorAll('.seg-btn')].map(b => b.textContent);

describe('the events plugin', () => {
  it('is the events panel the strip already registers, with its own glyph', () => {
    const plugin = createEventsPlugin({ bus, characters: () => [] });
    expect(plugin.manifest.id).toBe('events');
    expect(plugin.manifest.icon).toBe('events');
    expect(plugin.manifest.name).toBe('Events');
    expect(plugin.manifest.defaultEnabled).toBe(true);
  });

  it('renders only the rows that pass the filters, and the footer counts both', () => {
    seed();
    const body = mount();
    // Newest first, which is the mock's order and the reverse of the bus's own log.
    expect(feedText(body)).toEqual(['Level up! Woodcutting 34 to 35', 'Picked up 3 iron ore', '+250 Woodcutting xp']);
    expect(foot(body)).toContain('3 of 3 events · this session');
  });

  it('offers All plus every open character, and the six type chips in the mock order', () => {
    const body = mount();
    expect(segLabels(body)).toEqual(['All', 'shoth4019zr', 'alt_miner']);
    expect([...body.querySelectorAll('.chip')].map(c => c.textContent))
      .toEqual(['XP', 'Loot', 'Levels', 'Runs', 'Claude', 'Bank']);
  });

  it('a chip click narrows the feed and updates the footer without a re-mount', () => {
    seed();
    const body = mount();
    const feed = body.querySelector('.events-feed');
    chip(body, 'Loot').click();
    expect(feedText(body)).toEqual(['Picked up 3 iron ore']);
    expect(foot(body)).toContain('1 of 3 events · this session');
    // Mutation target: repainting by remounting the panel replaces this node and loses scroll.
    expect(body.querySelector('.events-feed')).toBe(feed);
    expect(chip(body, 'Loot').getAttribute('aria-pressed')).toBe('true');
  });

  it('the character segmented is its own axis, ANDed with the chips', () => {
    seed();
    const body = mount();
    [...body.querySelectorAll<HTMLButtonElement>('.seg-btn')].find(b => b.textContent === 'shoth4019zr')!.click();
    expect(feedText(body)).toEqual(['Level up! Woodcutting 34 to 35', '+250 Woodcutting xp']);
    chip(body, 'XP').click();
    expect(feedText(body)).toEqual(['+250 Woodcutting xp']);
    expect(foot(body)).toContain('1 of 3 events · this session');
  });

  it('shows the compact empty state when the chips exclude everything, and its button resets all three axes', () => {
    seed();
    const body = mount();
    chip(body, 'Runs').click();                       // no run events in the seed
    const empty = body.querySelector('.events-feed .empty-state.compact')!;
    expect(empty.querySelector('.empty-state-title')?.textContent).toBe('No events match');
    expect(empty.querySelector('.empty-state-copy')?.textContent).toBe(EVENTS_EMPTY_COPY);
    expect(foot(body)).toContain('0 of 3 events · this session');
    empty.querySelector<HTMLButtonElement>('button.btn-quiet')!.click();
    expect(feedText(body).length).toBe(3);
    expect([...body.querySelectorAll('.chip')].every(c => c.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(body.querySelector<HTMLSelectElement>('.select')!.value).toBe('all');
    expect(body.querySelector('.seg-btn.active')?.textContent).toBe('All');
  });

  it('Clear resets all three axes to All / [] / all', () => {
    seed();
    const body = mount();
    chip(body, 'Loot').click();
    const skill = body.querySelector<HTMLSelectElement>('.select')!;
    skill.value = 'Woodcutting';
    skill.dispatchEvent(new Event('change'));
    expect(feedText(body)).toEqual([]);
    body.querySelector<HTMLButtonElement>('[data-events-clear]')!.click();
    expect(feedText(body).length).toBe(3);
    expect(body.querySelector<HTMLSelectElement>('.select')!.value).toBe('all');
    expect([...body.querySelectorAll('.chip')].every(c => c.getAttribute('aria-pressed') === 'false')).toBe(true);
  });

  it('offers All skills plus the skills the log actually carries', () => {
    seed();
    const body = mount();
    const skill = body.querySelector<HTMLSelectElement>('.select')!;
    expect([...skill.options].map(o => o.value)).toEqual(['all', 'Woodcutting']);
    // Mutation target: rebuilding the options without preserving the value silently clears the
    // filter the player set the moment the next event lands.
    skill.value = 'Woodcutting';
    skill.dispatchEvent(new Event('change'));
    bus.emit({ ...LOOT, skill: 'Mining', text: '+120 Mining xp' });
    expect(body.querySelector<HTMLSelectElement>('.select')!.value).toBe('Woodcutting');
    expect([...body.querySelectorAll<HTMLSelectElement>('.select')[0].options].map(o => o.value))
      .toEqual(['all', 'Woodcutting', 'Mining']);
  });

  it('appends a live event that passes the filters, and counts one that does not', () => {
    seed();
    const body = mount();
    chip(body, 'Loot').click();
    bus.emit({ ...LOOT, text: 'Picked up 1 coal' });
    expect(feedText(body)[0]).toBe('Picked up 1 coal');       // prepended, not appended
    expect(foot(body)).toContain('2 of 4 events · this session');
    bus.emit({ ...XP, text: '+25 Woodcutting xp' });
    expect(feedText(body).length).toBe(2);                     // filtered out of the feed...
    expect(foot(body)).toContain('2 of 5 events · this session');   // ...and still counted
  });

  it('replaces the empty state with the first row that passes, rather than sitting under it', () => {
    const body = mount();
    expect(body.querySelector('.events-feed .empty-state')).not.toBeNull();
    bus.emit({ ...XP, text: '+250 Woodcutting xp' });
    expect(body.querySelector('.events-feed .empty-state')).toBeNull();
    expect(feedText(body)).toEqual(['+250 Woodcutting xp']);
  });

  it('a live event for a character with no tab open still earns its segmented option', () => {
    const body = mount([]);
    expect(segLabels(body)).toEqual(['All']);
    bus.emit({ ...LOOT, text: 'Picked up 3 iron ore' });
    expect(segLabels(body)).toEqual(['All', 'alt_miner']);
  });

  it('Copy for Claude puts the visible rows on the clipboard behind the untrusted header', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    seed();
    // Two matching rows, not one: with a single row the clipboard's order is unobservable and
    // dropping the handler's `.reverse()` would go unnoticed.
    bus.emit({ ...BANK, text: 'Bank updated' });
    bus.emit({ ...BANK, text: 'Bank updated again' });
    const body = mount();
    chip(body, 'Bank').click();
    body.querySelector<HTMLButtonElement>('[data-events-copy]')!.click();
    const text = writeText.mock.calls[0][0] as string;
    expect(text.split('\n')[0]).toBe(UNTRUSTED_HEADER);
    // Only the filtered rows, newest first as the feed draws them, and an account-scoped row
    // carries no character column.
    expect(text.split('\n').slice(1)).toEqual(['14:10 Bank updated again', '14:09 Bank updated']);
    expect(feedText(body)).toEqual(['Bank updated again', 'Bank updated']);
    await Promise.resolve();
    expect(notify).toHaveBeenCalledWith('Copied; paste it into your Claude session.');
    vi.unstubAllGlobals();
  });

  it('unmount unsubscribes: nothing renders and nothing throws after it', () => {
    const { view, body } = open();
    view.unmount!();
    bus.emit({ ...XP, text: 'after' });
    expect(body.textContent).not.toContain('after');
    expect(() => bus.emit({ ...XP, text: 'again' })).not.toThrow();
  });

  it('a re-opened panel keeps the filters it was closed with, and re-reads the log', () => {
    // Ruling R27: the filters live in the `panel()` closure, which survives an unmount, so no
    // `cs.` key is added for UI state the mock itself keeps in memory.
    seed();
    const { plugin, view, body } = open();
    chip(body, 'Loot').click();
    view.unmount!();
    bus.emit({ ...LOOT, text: 'Picked up 1 coal' });
    const again = document.createElement('div');
    plugin.panel!(ctx()).mount(again);            // a second view: a fresh closure, fresh filters
    expect(feedText(again).length).toBe(4);
    const reopened = document.createElement('div');
    view.mount(reopened);                          // the same view: the Loot chip is still on
    expect(feedText(reopened)).toEqual(['Picked up 1 coal', 'Picked up 3 iron ore']);
  });
});
