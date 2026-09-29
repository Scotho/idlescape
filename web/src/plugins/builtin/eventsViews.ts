// web/src/plugins/builtin/eventsViews.ts -- the Events feed's pure half: the filter predicate,
// the six chip keys, the option lists the two filter controls offer, and one row.
//
// Everything here is a function of the feed's own records (`frame/events.ts`), so the panel that
// composes them holds no rendering logic of its own beyond which hosts it repaints. The rails are
// pure CSS off `[data-event-type]`, exactly as the trace's are off `[data-kind]`: a row carries
// its type and its tone as data and `layout/events.css` decides what colour that is.
import { h } from '../../ui/el';
import { UNTRUSTED_HEADER } from './traceView';
import type { ShellEvent, ShellEventType } from '../../frame/events';
import type { SegmentedOption } from '../../ui/parts';

/** The character axis's "no filter" value, and the label the segmented shows for it. */
export const ALL_CHARS = 'All';
/** The skill axis's "no filter" value. It is `all` and not `All`: it is a select value, not a name. */
export const ALL_SKILLS = 'all';

export interface EventFilters { char: string; types: ShellEventType[]; skill: string }

/**
 * What the predicate reads. It is the readonly view of `EventFilters` and not `EventFilters`
 * itself, because the panel owns a mutable set (the chips replace `types` on every toggle) while
 * a caller with a frozen or `as const` filter set - every case in the test file beside this one -
 * is asking exactly the same question.
 */
export interface FilterQuery {
  readonly char: string;
  readonly types: readonly ShellEventType[];
  readonly skill: string;
}

/**
 * The one reset. The filter row's `Clear` and the empty state's `Clear filters` both call it, so
 * they can never drift, and it returns a fresh object every time: `types` is mutated in place by
 * the chips, and a shared literal would leak one panel's selection into the next one opened.
 */
export const defaultFilters = (): EventFilters => ({ char: ALL_CHARS, types: [], skill: ALL_SKILLS });

/** The mock's own predicate, at `.dc.html:567-570`. Empty `types` means all types, not none. */
export function matchesFilters(e: ShellEvent, f: FilterQuery): boolean {
  return (f.char === ALL_CHARS || e.characterName === f.char)
    && (f.types.length === 0 || f.types.includes(e.type))
    && (f.skill === ALL_SKILLS || e.skill === f.skill);
}

/** The six chips, verbatim from the mock: singular keys, plural labels for the two countable ones. */
export const EVENT_TYPES: readonly { value: ShellEventType; label: string }[] = [
  { value: 'xp', label: 'XP' }, { value: 'loot', label: 'Loot' }, { value: 'level', label: 'Levels' },
  { value: 'run', label: 'Runs' }, { value: 'claude', label: 'Claude' }, { value: 'bank', label: 'Bank' }
];

/** Local-zone HH:MM, both halves padded. The feed is a reading of the player's own afternoon. */
export const hhmm = (at: number): string => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function eventRow(e: ShellEvent): HTMLElement {
  return h('div', { class: 'events-row', 'data-event-type': e.type, 'data-event-tone': e.tone === 'fail' ? 'fail' : null },
    h('span', { class: 'events-time' }, hhmm(e.at)),
    h('span', { class: 'events-text' }, e.text),
    e.characterName ? h('span', { class: 'badge badge-quiet' }, e.characterName) : null
  );
}

/** Unique, in first-seen order. Both option lists are "what exists", and neither may repeat. */
function uniq(values: readonly (string | null)[]): string[] {
  const out: string[] = [];
  for (const v of values) if (v !== null && v.length > 0 && !out.includes(v)) out.push(v);
  return out;
}

/**
 * `All`, then every open character, then any character the feed still remembers whose tab has
 * since closed. The mock draws only the open ones, because in the mock every seeded event belongs
 * to one of the two open tabs; closing a tab in the real shell leaves its rows in the feed, and
 * dropping its option would leave a set filter with no control to unset it.
 */
export function charOptions(open: readonly string[], events: readonly ShellEvent[]): SegmentedOption[] {
  return [ALL_CHARS, ...uniq([...open, ...events.map(e => e.characterName)])]
    .map(value => ({ value, label: value }));
}

/** `All skills`, then every skill the feed has actually seen. Four of the six types carry none. */
export function skillOptions(events: readonly ShellEvent[]): SegmentedOption[] {
  return [{ value: ALL_SKILLS, label: 'All skills' }, ...uniq(events.map(e => e.skill)).map(value => ({ value, label: value }))];
}

/** The footer's sentence, verbatim from the mock: the shown count, the total, and the scope. */
export const footerText = (shown: number, total: number): string => `${shown} of ${total} events · this session`;

/**
 * The visible rows, for a Claude session. Every event's text is game text (an item name, a
 * script's own log line), so this carries the same header the trace copy does rather than a
 * second wording of it; `traceView.ts` is where that sentence lives.
 */
export function eventsAsText(rows: readonly ShellEvent[]): string {
  return [
    UNTRUSTED_HEADER,
    ...rows.map(e => `${hhmm(e.at)} ${e.characterName ? `${e.characterName} ` : ''}${e.text}`)
  ].join('\n');
}
