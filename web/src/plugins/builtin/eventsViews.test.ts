// web/src/plugins/builtin/eventsViews.test.ts -- the Events feed's pure half.
//
// The filter predicate is quoted verbatim from the mock (`.dc.html:567-570`, map-design 3.12
// item 4) and these cases are what pin it: three independent axes, ANDed, with an empty type
// list meaning all types rather than none.
import { describe, expect, it } from 'vitest';
import {
  ALL_CHARS, ALL_SKILLS, EVENT_TYPES, charOptions, defaultFilters, eventRow, eventsAsText,
  footerText, matchesFilters, skillOptions
} from './eventsViews';
import { UNTRUSTED_HEADER } from './traceView';
import type { ShellEvent } from '../../frame/events';

// `amount` is `number | null` with no `?` on ShellEvent, and this literal is annotated
// `: ShellEvent`, so omitting it fails `npm run typecheck` before a case runs.
const ev = (over: Partial<ShellEvent> = {}): ShellEvent => ({
  seq: 1, at: 0, characterId: 'c1', characterName: 'shoth4019zr',
  type: 'xp', skill: 'Woodcutting', text: '+250 Woodcutting xp · 10 actions', tone: 'default', amount: 250, ...over
});
const ALL = { char: 'All', types: [], skill: 'all' } as const;

describe('matchesFilters', () => {
  it('passes everything with the default filters', () => {
    expect(matchesFilters(ev(), ALL)).toBe(true);
    expect(matchesFilters(ev({ type: 'bank', skill: null, characterName: null }), ALL)).toBe(true);
  });

  it('filters by character name, single select including All', () => {
    expect(matchesFilters(ev(), { ...ALL, char: 'shoth4019zr' })).toBe(true);
    expect(matchesFilters(ev(), { ...ALL, char: 'alt_miner' })).toBe(false);
  });

  it('treats an EMPTY type list as all types, not as none', () => {
    // Mutation target: `f.types.includes(e.type)` without the length guard hides every row.
    expect(matchesFilters(ev(), { ...ALL, types: [] })).toBe(true);
    expect(matchesFilters(ev(), { ...ALL, types: ['loot'] })).toBe(false);
    expect(matchesFilters(ev(), { ...ALL, types: ['loot', 'xp'] })).toBe(true);
  });

  it('filters by skill independently of type, and a null skill never matches a named skill', () => {
    expect(matchesFilters(ev(), { ...ALL, skill: 'Woodcutting' })).toBe(true);
    expect(matchesFilters(ev({ skill: null }), { ...ALL, skill: 'Woodcutting' })).toBe(false);
    expect(matchesFilters(ev({ skill: null }), { ...ALL, skill: 'all' })).toBe(true);
  });

  it('ANDs the three axes', () => {
    expect(matchesFilters(ev(), { char: 'shoth4019zr', types: ['xp'], skill: 'Woodcutting' })).toBe(true);
    expect(matchesFilters(ev(), { char: 'shoth4019zr', types: ['xp'], skill: 'Mining' })).toBe(false);
  });

  it('defaultFilters is the one reset both Clear buttons use', () => {
    expect(defaultFilters()).toEqual({ char: ALL_CHARS, types: [], skill: ALL_SKILLS });
    // Mutation target: returning a shared frozen object lets one panel's toggle leak into the next.
    const a = defaultFilters();
    a.types.push('loot');
    expect(defaultFilters().types).toEqual([]);
  });
});

describe('EVENT_TYPES', () => {
  it('is the mock\'s six value/label pairs, in order', () => {
    expect(EVENT_TYPES.map(t => [t.value, t.label])).toEqual([
      ['xp', 'XP'], ['loot', 'Loot'], ['level', 'Levels'], ['run', 'Runs'], ['claude', 'Claude'], ['bank', 'Bank']
    ]);
  });
});

describe('eventRow', () => {
  it('renders time, text and character badge in that order', () => {
    const el = eventRow(ev({ at: Date.UTC(2026, 8, 7, 14, 5) }));
    expect([...el.children].map(c => c.className)).toEqual(['events-time', 'events-text', 'badge badge-quiet']);
    expect(el.querySelector('.badge-quiet')?.textContent).toBe('shoth4019zr');
  });

  it('carries the type as a data attribute so the rail is pure CSS', () => {
    expect(eventRow(ev({ type: 'level' })).dataset.eventType).toBe('level');
    expect(eventRow(ev({ type: 'run', tone: 'fail' })).dataset.eventTone).toBe('fail');
    expect(eventRow(ev()).dataset.eventTone).toBeUndefined();
  });

  it('drops the badge entirely for an account-scoped event', () => {
    expect(eventRow(ev({ type: 'bank', characterId: null, characterName: null })).querySelector('.badge-quiet')).toBeNull();
  });

  it('writes the time as HH:MM in the viewer local zone, tabular', () => {
    const el = eventRow(ev({ at: new Date(2026, 8, 7, 14, 5).getTime() }));
    expect(el.querySelector('.events-time')?.textContent).toBe('14:05');
  });

  it('pads both halves of the clock, so 09:05 is not 9:5', () => {
    const el = eventRow(ev({ at: new Date(2026, 8, 7, 9, 5).getTime() }));
    expect(el.querySelector('.events-time')?.textContent).toBe('09:05');
  });

  it('renders the text as a text node, never as markup', () => {
    const el = eventRow(ev({ text: '<img src=x onerror=alert(1)>' }));
    expect(el.querySelector('img')).toBeNull();
    expect(el.innerHTML).toContain('&lt;img');
  });
});

describe('the option lists', () => {
  it('offers All plus every open character, and never a duplicate', () => {
    expect(charOptions(['shoth4019zr', 'alt_miner'], []).map(o => o.value))
      .toEqual([ALL_CHARS, 'shoth4019zr', 'alt_miner']);
    expect(charOptions(['shoth4019zr'], [ev(), ev({ characterName: 'shoth4019zr' })]).map(o => o.value))
      .toEqual([ALL_CHARS, 'shoth4019zr']);
  });

  it('keeps a character whose tab has closed but whose events are still in the feed', () => {
    // Mutation target: reading only the open tabs leaves the segmented with no option for the
    // filter that is actually set, so the feed looks empty with nothing to click to fix it.
    expect(charOptions([], [ev({ characterName: 'alt_miner' })]).map(o => o.value))
      .toEqual([ALL_CHARS, 'alt_miner']);
  });

  it('offers All skills plus the skills present in the log, and nothing for a null skill', () => {
    const rows = [ev(), ev({ skill: 'Mining' }), ev({ skill: null }), ev({ skill: 'Mining' })];
    expect(skillOptions(rows).map(o => o.value)).toEqual([ALL_SKILLS, 'Woodcutting', 'Mining']);
    expect(skillOptions(rows)[0].label).toBe('All skills');
  });
});

describe('footerText', () => {
  it('is the mock\'s sentence, with both counts', () => {
    expect(footerText(1, 3)).toBe('1 of 3 events · this session');
  });
});

describe('eventsAsText', () => {
  it('leads with the untrusted-text header the trace already uses', () => {
    // Every event text is game text (an item name, a script log line), so it carries the same
    // warning the trace copy does rather than a second wording of it.
    const lines = eventsAsText([ev({ at: new Date(2026, 8, 7, 14, 5).getTime() })]).split('\n');
    expect(lines[0]).toBe(UNTRUSTED_HEADER);
    expect(lines[1]).toBe('14:05 shoth4019zr +250 Woodcutting xp · 10 actions');
  });

  it('writes an account-scoped row with no character column', () => {
    const rows = eventsAsText([ev({ at: new Date(2026, 8, 7, 12, 40).getTime(), characterId: null, characterName: null, type: 'bank', skill: null, text: 'Bank updated' })]);
    expect(rows.split('\n')[1]).toBe('12:40 Bank updated');
  });
});
