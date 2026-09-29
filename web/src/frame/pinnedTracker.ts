// web/src/frame/pinnedTracker.ts -- the pinned XP card, above the panel header (map-design 3.8).
//
// The mock's pin logic is two lines: `canPin = panel === 'xp' && pinned !== 'xp'` and
// `showPinCard = pinned === 'xp' && panel !== 'xp'`. Only the XP panel is pinnable, and the card
// exists so the player can keep watching one skill while a different panel is open, which is
// exactly when the XP panel's own body is gone. It therefore lives in the frame rather than in the
// plugin: the host (`#pinned-tracker`) is a child of `#side-panel` and outlives every panel mount.
//
// It owns a 5 s tick of its own, armed by `setPinned(true)` and released by `setPinned(false)` and
// by `dispose()`. That is not a second timer beside the XP panel's: the card is on screen only
// while the XP panel is closed, so the panel's interval is not running when this one is, and
// exactly one of the two is ever alive. `render()` stays public so the frame can repaint on demand.
import { h } from '../ui/el';
import { meter, sectionLabel } from '../ui/parts';
import type { XpRow } from '../stats/xp';
import type { PanelId } from '../types';

export interface PinnedTrackerDeps {
  /** The active character's XP rows, highest gain first, exactly as the panel reads them. */
  rows(): XpRow[];
  /** The card's own `×`. The frame owns the pin state, so unpinning is reported, not decided. */
  onUnpin(): void;
}

export interface PinnedTracker {
  /** Repaint, if pinned. Cheap enough to call on every tick: one card, no subscriptions. */
  render(): void;
  setPinned(pinned: boolean): void;
  dispose(): void;
}

/**
 * The card's rate, at the width the card has. The XP panel writes `24,180/h`; the pinned card has
 * a label, a name, a gain and a rate on two short lines, and the mock writes `24.2k/h` there.
 * One decimal, no trailing `.0`, and anything under a thousand stays whole.
 */
export function compactRate(perHour: number): string {
  const short = (n: number, suffix: string): string =>
    `${Number(n.toFixed(1)).toLocaleString()}${suffix}`;
  const millions = (): string => short(perHour / 1_000_000, 'm');
  if (perHour >= 1_000_000) return millions();
  if (perHour >= 1000) {
    // Picking the branch on the RAW value and rounding afterwards prints `1,000k` for 999,999,
    // which is not a thing this shell's language ever writes. A value that rounds up out of its
    // own unit takes the next one instead.
    const k = Number((perHour / 1000).toFixed(1));
    return k >= 1000 ? millions() : short(k, 'k');
  }
  return perHour.toLocaleString();
}

/**
 * The mock's two pin conditions, from map-design 3.8: the header Pin button shows while the XP
 * panel is open and is not already pinned, and the card shows while it is pinned and some OTHER
 * panel is open. They live here rather than inline in `main.ts` because main.ts `byId()`s at
 * module scope and audit C18 rules it unimportable under jsdom, so a condition written there is a
 * condition no test can reach. Only the XP panel is pinnable.
 *
 * The mock writes `showPinCard = pinned === 'xp' && panel !== 'xp'` and never draws a CLOSED
 * panel, so `open === null` is ours to answer, and entry 4's review is what asked the question.
 * The answer is the DOM's: the host is a child of `#side-panel` (map-design 3.8 puts the card
 * above the panel header, and `partials/frame.html` builds it there), and that aside is `hidden`
 * whenever no panel is open. Without the `open !== null` clause the card renders into a hidden
 * ancestor and its 5 s tick runs for a surface nobody can see. A card that survives a closed panel
 * is a different design, and it is a move of the host out of the aside, not a change here.
 */
export function pinGuards(open: PanelId | null, pinned: 'xp' | null): { canPin: boolean; showCard: boolean } {
  return { canPin: open === 'xp' && pinned !== 'xp', showCard: pinned === 'xp' && open !== null && open !== 'xp' };
}

/** The XP panel's own cadence, so the pinned numbers move at the rate the panel would move them. */
const REFRESH_MS = 5000;

export function createPinnedTracker(host: HTMLElement, deps: PinnedTrackerDeps): PinnedTracker {
  let pinned = false;
  let disposed = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  function stopTimer(): void {
    if (timer !== null) { clearInterval(timer); timer = null; }
  }

  /** Hidden AND emptied. `.hidden` is `display: none !important`, so the card would only be
   *  invisible; clearing it is what stops a stale skill reappearing on the next pin. */
  function clear(): void {
    host.replaceChildren();
    host.classList.add('hidden');
  }

  function render(): void {
    // `dispose()` sets `pinned` to false, so this one guard covers both; a `disposed` test here
    // as well would be dead code, and `setPinned` is where the disposed check has to live.
    if (!pinned) return;
    const row = deps.rows()[0];
    // A pin with nothing tracked yet paints nothing rather than an empty card: the pin survives a
    // Reset and a character switch, and a bordered strip of chrome saying nothing is worse chrome
    // than none. The next tick brings it back the moment there is a row.
    if (!row) { clear(); return; }
    host.classList.remove('hidden');
    host.replaceChildren(
      h('div', { class: 'pin-head' },
        sectionLabel('Pinned · XP'),
        h('button', {
          class: 'btn btn-icon btn-icon-xs', type: 'button', 'aria-label': 'Unpin',
          'data-unpin': '', onclick: () => deps.onUnpin()
        }, '×')),
      h('div', { class: 'pin-value' },
        h('b', { class: 'pin-name' }, row.name),
        h('span', { class: 'pin-gain' }, `+${row.gained.toLocaleString()}`),
        h('span', { class: 'pin-sub' }, `${compactRate(row.perHour)}/h · lvl ${row.level}`)),
      meter(row.pct, { shimmer: true })
    );
  }

  return {
    render,
    setPinned(next: boolean): void {
      if (disposed) return;
      pinned = next;
      stopTimer();
      if (!pinned) { clear(); return; }
      render();
      timer = setInterval(render, REFRESH_MS);
    },
    dispose(): void {
      disposed = true;
      pinned = false;
      stopTimer();
      clear();
    }
  };
}
