// web/src/frame/traceWindow.ts -- the trace, popped out of the Automation panel into a window
// over the stage bottom right (plan Task 16, gap G8.2).
//
// It is a stage-level surface, mounted into `#trace-host` beside `#bank-host`, and it is opened
// from three places: the run card's Trace button, the co-pilot bar's Open trace, and the run
// report's own button. It composes the Task 7 window family (`window window-docked`) and adds
// only its size and its kind rails, in `styles/layout/trace.css`.
//
// Two rulings shape it. R12: the window follows the ACTIVE character and closes on a tab switch,
// because `tasks/router.ts` drops a background session's events by design and anything else would
// need a per-session subscription the router does not expose. R13: it owns its own element
// reference and never reaches for `host.firstElementChild`, because a host is a place anything
// may append to.
import { appendTraceEvent, applyFilter, mergeTraceEvent, renderTraceView, visibleLines, UNTRUSTED_HEADER } from '../plugins/builtin/traceView';
import { h } from '../ui/el';
import { tracePoppedOut } from '../ui/copy';
import type { TasksApi } from '../tasks/api';
import type { TraceEvent } from '../tasks/types';

export interface TraceWindowDeps {
  /** The router, which follows whichever character tab is in front. */
  api(): TasksApi;
  /** The visible lines, headed and joined; the shell puts them on the clipboard. */
  copy(text: string): void;
  /**
   * Fired once whenever the window goes away by any route: the x, Escape, `close()` or
   * `dispose()`. A surface that presses a button to open the window un-presses it here.
   */
  onClose?(): void;
}

export interface TraceWindow {
  open(runId: string, scriptName: string | null): Promise<void>;
  close(): void;
  isOpen(): boolean;
  /** Live append while the window shows the run the event belongs to. */
  push(e: TraceEvent): void;
  dispose(): void;
}

export function createTraceWindow(host: HTMLElement, deps: TraceWindowDeps): TraceWindow {
  /** The window's own element, never `host.firstElementChild` (ruling R13). */
  let el: HTMLElement | null = null;
  let foot: HTMLElement | null = null;
  /**
   * Which run the kept events belong to. It outlives a close on purpose: `getRun` answers from
   * the recorder's flushed history, which lags a live run by up to `FLUSH_EVERY` events, so a
   * window closed and re-opened mid-run would silently drop the rows it had already been given.
   */
  let shown: string | null = null;
  let events: TraceEvent[] = [];
  let disposed = false;
  /**
   * Bumped by every `open()` and every `close()`, so an `open()` still waiting on `getRun` can
   * tell that it has been overtaken. Without it a `close()` landing inside that await was thrown
   * away, because `close()` returns early when there is no element yet and the open then mounted
   * regardless. That close is ruling R12's own mechanism (`main.ts` closes the window on a
   * character tab switch), so the previous character's trace would sit over the new character's
   * stage, where `push`'s run-id guard starves it of every live row: stale, silent, and only
   * closeable by hand. A second `open()` overtakes the first the same way, which keeps one run's
   * history out of the array the run that replaced it is drawn from.
   */
  let epoch = 0;

  const paintFoot = (): void => {
    if (foot && el) foot.textContent = tracePoppedOut(el.querySelectorAll('[data-trace-row]').length);
  };

  function close(): void {
    epoch++;
    if (!el) return;
    el.remove();
    el = null;
    foot = null;
    deps.onClose?.();
  }

  /**
   * The panic key always wins. This returns early when something nearer has already claimed
   * Escape and never calls `preventDefault` or `stopPropagation` itself (the convention
   * `bank/view.ts` sets), so one Escape over a live run closes this window AND pauses the run,
   * which is plan ruling R30 and is deliberate.
   */
  function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    close();
  }
  document.addEventListener('keydown', onKey);

  /** The chrome: the mock's single header row, the rows, and the count (map-design 3.5). */
  function build(scriptName: string | null): HTMLElement {
    const filter = h('input', {
      class: 'input input-quiet', type: 'text', 'data-trace-filter': '',
      placeholder: 'Filter', 'aria-label': 'Filter the trace'
    }) as HTMLInputElement;
    filter.addEventListener('input', () => { if (el) applyFilter(el, filter.value); });
    const copy = h('button', {
      class: 'btn btn-tiny', type: 'button', 'data-trace-copy': '',
      onclick: () => { if (el) deps.copy([UNTRUSTED_HEADER, ...visibleLines(el)].join('\n')); }
    }, 'Copy for Claude');
    foot = h('div', { class: 'window-foot' }, tracePoppedOut(events.length));
    return h('div', { class: 'window window-docked trace-window', role: 'dialog', 'aria-label': 'Trace' },
      h('div', { class: 'window-head' },
        h('span', { class: 'window-title' }, 'Trace'),
        scriptName === null ? null : h('span', { class: 'window-sub' }, scriptName),
        filter, copy,
        h('button', {
          class: 'btn btn-icon window-close', type: 'button', 'data-trace-close': '',
          'aria-label': 'Close trace', onclick: () => close()
        }, '×')),
      h('div', { class: 'window-body' }, renderTraceView(events)),
      foot);
  }

  async function open(runId: string, scriptName: string | null): Promise<void> {
    if (disposed) return;
    const gen = ++epoch;
    // A different run is a different trace; the same run re-opened keeps the live rows it was
    // handed while it was open, and merges whatever history has caught up with since.
    if (shown !== runId) { shown = runId; events = []; }
    const run = await deps.api().getRun(runId).catch(() => null);
    // Closed or overtaken while the round trip was in the air: leave no element and no merge.
    if (disposed || gen !== epoch) return;
    for (const e of run?.events ?? []) mergeTraceEvent(events, e);
    // The recorder flushes history in batches, so a window opened early is filled by live pushes
    // alone and the history that lands on a re-open carries seqs BELOW the ones already kept.
    // `mergeTraceEvent` appends those where they fall, and `renderTraceView` reads `events[0].at`
    // as the clock's zero, so an unsorted array draws the run out of order off the wrong t0.
    events.sort((a, b) => a.seq - b.seq);
    const next = build(scriptName);
    // A re-open over an open window is not a close: it replaces the element without telling the
    // surface that opened it that the window went away.
    el?.remove();
    el = next;
    host.append(el);
  }

  return {
    open,
    close,
    isOpen: () => el !== null,
    push(e) {
      // The window shows one run. `TraceEvent` carries no run id, so the run it belongs to is the
      // one the router is currently reporting for, which is what the panel's own append checks.
      if (disposed || el === null || shown === null || deps.api().status().runId !== shown) return;
      mergeTraceEvent(events, e);
      appendTraceEvent(el, e);
      paintFoot();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      document.removeEventListener('keydown', onKey);
      close();
    }
  };
}
