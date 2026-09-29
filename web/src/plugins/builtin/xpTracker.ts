// web/src/plugins/builtin/xpTracker.ts -- the v2 XP panel (map-design 3.10).
//
// One card per skill: a level chip, the name over its rate, the session gain, a shimmering meter
// across the current level, and a footer that says where the level starts and where it ends. The
// panel used to rebuild `body.innerHTML` on every 5 s tick out of a string template; it is the
// same timer and the same wholesale repaint, built from the component library instead, so a card
// here and a card in Automation are one component rather than two dialects.
import { definePlugin, type PluginContext, type ShellPlugin } from '../types';
import { onlineFor } from '../../frame/characterTabs';
import type { XpRow } from '../../stats/xp';
import { h } from '../../ui/el';
import { card, emptyState, meter } from '../../ui/parts';
import type { PanelView } from '../../frame/panels';

const REFRESH_MS = 5000;

/**
 * What the panel asks of a character's tracker, which `createXpTracker` satisfies structurally.
 * Named rather than spelled `ReturnType<typeof createXpTracker>` so a test can hand over the
 * mock's own literals: no arithmetic in the real tracker produces `24,180/h` and `52 actions` on
 * demand, and a fake typed as this is no looser than the collaborator it stands in for.
 */
export interface XpSource {
  rows(now: number): XpRow[];
  startedAt(): number | null;
  reset(): void;
}

/** `24,180/h · 52 actions to 35`, or just the rate when there is nothing left to count towards. */
function subLine(row: XpRow, showToNext: boolean): string {
  const rate = `${row.perHour.toLocaleString()}/h`;
  if (!showToNext) return rate;
  if (row.toNext === null) return `${rate} · maxed`;
  if (row.actionsToNext === null) return rate;
  return `${rate} · ${row.actionsToNext.toLocaleString()} actions to ${row.level + 1}`;
}

/** The footer's right half. The left half is always `lvl {level}`. */
function footTarget(row: XpRow, showToNext: boolean): string {
  if (!showToNext) return '';
  return row.toNext === null ? 'maxed' : `${row.toNext.toLocaleString()} xp to lvl ${row.level + 1}`;
}

/**
 * The mock puts a `flex:1` spacer between the two footer halves and between the two header ones.
 * Both are `justify-content: space-between` here instead, which is the same result with one node
 * fewer, and which is why `.xp-foot`'s text reads as the two halves with nothing between them.
 */
function skillCard(row: XpRow, showToNext: boolean): HTMLElement {
  return card({ class: 'xp-card' },
    h('div', { class: 'xp-row' },
      h('span', { class: 'xp-level' }, String(row.level)),
      h('span', { class: 'xp-main' },
        h('b', { class: 'xp-name' }, row.name),
        h('span', { class: 'xp-sub' }, subLine(row, showToNext))),
      h('span', { class: 'xp-gain' }, `+${row.gained.toLocaleString()}`)),
    meter(row.pct, { shimmer: true }),
    h('div', { class: 'xp-foot' },
      h('span', {}, `lvl ${row.level}`),
      h('span', {}, footTarget(row, showToNext)))
  );
}

/** `tracker` is a getter: the shell hands over whichever character is active (SP7). */
export function createXpTrackerPlugin(tracker: () => XpSource): ShellPlugin {
  function panel(ctx: PluginContext): PanelView {
    let timer: ReturnType<typeof setInterval> | null = null;
    const showToNext = (): boolean => ctx.settings.get<boolean>('showToNext') !== false;

    function render(body: HTMLElement): void {
      const now = Date.now();
      const source = tracker();
      const rows = source.rows(now);
      if (rows.length === 0) {
        // No CTA: the way to gain experience is to play, and the panel beside this one already
        // carries the one button that starts a script.
        body.replaceChildren(emptyState('◌', 'No experience yet',
          'Train a skill and it appears here with its rate and its time to the next level.'));
        return;
      }
      const since = source.startedAt();
      body.replaceChildren(
        h('div', { class: 'xp-head' },
          h('span', { class: 'xp-since' },
            `Session · ${onlineFor(since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000)))}`),
          h('button', { class: 'btn btn-outline btn-quiet', type: 'button', 'data-xp-reset': '' }, 'Reset')),
        ...rows.map(r => skillCard(r, showToNext()))
      );
    }

    // `frame/panels.ts` hands every panel the SAME `#panel-body` element and only empties it
    // between mounts, so a listener left behind on unmount survives to the next open: re-opening
    // the panel N times used to make one Reset click reset and repaint N times. The controller is
    // aborted in `unmount()` beside the timer, which is the only thing that removes it.
    let abort: AbortController | null = null;

    return {
      title: 'XP Tracker',
      mount(body) {
        render(body);
        abort = new AbortController();
        body.addEventListener('click', e => {
          if ((e.target as HTMLElement).closest('[data-xp-reset]')) { tracker().reset(); render(body); }
        }, { signal: abort.signal });
        timer = setInterval(() => render(body), REFRESH_MS);
      },
      unmount() {
        if (timer !== null) { clearInterval(timer); timer = null; }
        abort?.abort();
        abort = null;
      }
    };
  }

  return definePlugin({
    manifest: {
      id: 'xp', name: 'XP Tracker', icon: 'xp', tier: 'shell',
      description: 'Per-skill XP, xp/h and actions to the next level.',
      defaultEnabled: true,
      settings: { showToNext: { type: 'boolean', label: 'Show "to next level"', default: true } }
    },
    panel
  });
}
