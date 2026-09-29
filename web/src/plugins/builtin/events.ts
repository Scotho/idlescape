// web/src/plugins/builtin/events.ts -- the cross-character Events feed (G1).
//
// A pure read of the frame's event bus (`frame/events.ts`): three independent filter axes ANDed,
// tone-railed rows newest first, a footer that counts what is shown against what happened, and a
// Copy for Claude link. It holds no timer at all, because the bus pushes; `mount` renders the log
// it finds and subscribes, `unmount` unsubscribes, and everything between is one repainted host.
//
// The feed is session-scoped and not persisted (ruling C5), and so are the filters: the
// `PanelView` is built once per plugin enable and only `mount`/`unmount` run per open, so the
// closure below survives a re-open without adding a `cs.` key (ruling R27).
import { definePlugin, type PluginContext, type ShellPlugin } from '../types';
import {
  EVENT_TYPES, charOptions, defaultFilters, eventRow, eventsAsText, footerText, matchesFilters,
  skillOptions
} from './eventsViews';
import { EVENTS_EMPTY_COPY } from '../../ui/copy';
import { h } from '../../ui/el';
import { chip, emptyState, segmented, type SegmentedOption } from '../../ui/parts';
import type { PanelView } from '../../frame/panels';
import type { EventBus, ShellEvent, ShellEventType } from '../../frame/events';

export interface EventsPluginDeps {
  /** The frame-lifetime feed, built once in `main.ts` and shared with every producer. */
  bus: EventBus;
  /** The display names of the characters with a tab open, in tab order. */
  characters(): readonly string[];
}

/** A filter control is rebuilt only when its option list really changed. */
const sameOptions = (a: readonly SegmentedOption[], b: readonly SegmentedOption[]): boolean =>
  a.length === b.length && a.every((o, i) => o.value === b[i].value);

function panel(ctx: PluginContext, deps: EventsPluginDeps): PanelView {
  let filters = defaultFilters();
  let off: (() => void) | null = null;
  let chars: SegmentedOption[] = [];
  let skills: SegmentedOption[] = [];

  // Every element lives for the life of the view, so the feed keeps its scroll position across a
  // filter change and the listeners below are bound exactly once.
  const charHost = h('div');
  const chipsHost = h('div', { class: 'events-chips' });
  const skillSelect = h('select', { class: 'select select-sm', 'aria-label': 'Filter by skill' });
  const clearBtn = h('button', { class: 'btn btn-outline btn-sm', type: 'button', 'data-events-clear': '' }, 'Clear');
  const filterRow = h('div', { class: 'events-filters' }, skillSelect, clearBtn);
  const feed = h('div', { class: 'events-feed' });
  const count = h('span', { class: 'events-count' });
  const copyBtn = h('button', { class: 'btn btn-link', type: 'button', 'data-events-copy': '' }, 'Copy for Claude');
  const foot = h('div', { class: 'events-foot' }, count, copyBtn);

  const shownRows = (): ShellEvent[] => deps.bus.all().filter(e => matchesFilters(e, filters));

  function paintChars(): void {
    chars = charOptions(deps.characters(), deps.bus.all());
    charHost.replaceChildren(segmented(chars, filters.char, value => {
      filters.char = value;
      paintChars();
      paintFeed();
      paintFooter();
    }));
  }

  function paintChips(): void {
    chipsHost.replaceChildren(...EVENT_TYPES.map(t =>
      chip(t.label, filters.types.includes(t.value), () => toggleType(t.value))));
  }

  function toggleType(type: ShellEventType): void {
    filters.types = filters.types.includes(type) ? filters.types.filter(t => t !== type) : [...filters.types, type];
    paintChips();
    paintFeed();
    paintFooter();
  }

  /** The select keeps the value the player chose; only the options it offers are rebuilt. */
  function paintSkills(): void {
    skills = skillOptions(deps.bus.all());
    skillSelect.replaceChildren(...skills.map(o => h('option', { value: o.value }, o.label)));
    skillSelect.value = filters.skill;
  }

  function paintFeed(): void {
    const shown = shownRows();
    if (shown.length === 0) {
      // The button is grey and 23px, not primary and 27px: the two empty states differ on this
      // as on everything else (ruling R15). It is also the copy a session that has produced
      // nothing at all reads, which is the second half of "go make something happen".
      const clearFiltersBtn = h('button', { class: 'btn btn-quiet', type: 'button', onclick: clearFilters }, 'Clear filters');
      feed.replaceChildren(emptyState('⌕', 'No events match', EVENTS_EMPTY_COPY, clearFiltersBtn, { compact: true }));
      return;
    }
    // The log is oldest-first (the bus pushes); the feed is newest-first, as the mock's fourteen
    // rows are.
    feed.replaceChildren(...[...shown].reverse().map(eventRow));
  }

  function paintFooter(): void {
    count.textContent = footerText(shownRows().length, deps.bus.all().length);
  }

  /** The one reset the filter row's Clear and the empty state's Clear filters both call. */
  function clearFilters(): void {
    filters = defaultFilters();
    paintChars();
    paintChips();
    skillSelect.value = filters.skill;
    paintFeed();
    paintFooter();
  }

  /** A new character or a new skill has to reach its control, or it can never be filtered on. */
  function syncOptions(): void {
    if (!sameOptions(chars, charOptions(deps.characters(), deps.bus.all()))) paintChars();
    if (!sameOptions(skills, skillOptions(deps.bus.all()))) paintSkills();
  }

  function onEvent(e: ShellEvent): void {
    syncOptions();
    if (!matchesFilters(e, filters)) { paintFooter(); return; }
    // Newest rows go to the TOP, so the position a reader has to be in to be following the feed
    // is the top, not the bottom. Testing for "at bottom" here would yank a player who had
    // scrolled down through 500 rows back to row 0 on every event, and would leave the player
    // actually watching the live feed alone.
    const following = feed.scrollTop <= 4;
    if (feed.querySelector('.empty-state')) feed.replaceChildren();   // the empty state is gone now
    feed.prepend(eventRow(e));
    if (following) feed.scrollTop = 0;
    paintFooter();
  }

  clearBtn.addEventListener('click', clearFilters);
  skillSelect.addEventListener('change', () => {
    filters.skill = skillSelect.value;
    paintFeed();
    paintFooter();
  });
  copyBtn.addEventListener('click', () => {
    const text = eventsAsText([...shownRows()].reverse());
    void navigator.clipboard?.writeText(text)
      .then(() => ctx.notify('Copied; paste it into your Claude session.'))
      .catch(() => ctx.notify('Could not reach the clipboard.', 'error'));
  });

  return {
    title: 'Events',
    mount(body) {
      paintChars();
      paintChips();
      paintSkills();
      paintFeed();
      paintFooter();
      body.replaceChildren(charHost, chipsHost, filterRow, feed, foot);
      off = deps.bus.subscribe(onEvent);
    },
    unmount() { off?.(); off = null; }
  };
}

export function createEventsPlugin(deps: EventsPluginDeps): ShellPlugin {
  return definePlugin({
    manifest: {
      id: 'events', name: 'Events', icon: 'events', tier: 'shell', defaultEnabled: true,
      description: 'Everything that happened this session, across every character.'
    },
    panel: ctx => panel(ctx, deps)
  });
}
