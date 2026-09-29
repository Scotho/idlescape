// The trace rows, on their own. The chrome around them (the header, the filter input, the Copy
// for Claude button, the footer count) belongs to `frame/traceWindow.ts` since Task 16 and is
// tested there; what is left here is what a row says, how the substring filter reads it, which
// lines a copy would take, and the live append.
import { describe, expect, test } from 'vitest';
import { appendTraceEvent, applyFilter, mergeTraceEvent, renderTraceView, visibleLines } from './traceView';
import type { TraceEvent } from '../../tasks/types';

const events: TraceEvent[] = [
  { seq: 1, at: 1_000, kind: 'run_started', runId: 'r1', scriptId: 'chop-and-drop', version: 1, params: {}, startedBy: 'player' },
  { seq: 2, at: 2_000, kind: 'task_enter', task: 'chop-nearest' },
  { seq: 3, at: 3_500, kind: 'log', level: 'info', text: 'Chopping Tree' },
  { seq: 4, at: 9_000, kind: 'stuck', task: 'chop-nearest', snapshot: { hp: 3, region: 12336 } }
];

const rows = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('[data-trace-row]'));
const visible = (el: HTMLElement) => rows(el).filter(r => !r.hidden);

describe('trace view', () => {
  test('renders one row per event, each tagged with its kind', () => {
    const el = renderTraceView(events);
    expect(rows(el)).toHaveLength(4);
    expect(rows(el).map(r => r.dataset.kind)).toEqual(['run_started', 'task_enter', 'log', 'stuck']);
    expect(rows(el)[2]!.textContent).toContain('Chopping Tree');
  });

  // Task 16, drift 3: the mock's rows lead with the raw kind token, and the prose after it does
  // not say the token again. The clock is the mock's mm:ss.d, not the old `+3.9s`.
  test('a line is the mm:ss.d offset, the kind token, then the prose, and data-line holds it all', () => {
    const el = renderTraceView(events);
    expect(rows(el)[1]!.dataset.line).toBe('00:01.0 task_enter chop-nearest');
    expect(rows(el)[3]!.dataset.line).toBe('00:08.0 stuck on chop-nearest');
    // The copy button joins `data-line`, so a row that says one thing and stores another would
    // hand Claude a trace nobody can see on screen.
    for (const row of rows(el)) expect(row.dataset.line).toBe(row.textContent);
  });

  test('the clock keeps its shape past a minute and past an hour of run', () => {
    const el = renderTraceView([
      { seq: 1, at: 0, kind: 'status', text: 'go' },
      { seq: 2, at: 131_200, kind: 'status', text: 'still going' },
      { seq: 3, at: 847_600, kind: 'status', text: 'done' },
      { seq: 4, at: 3_723_400, kind: 'status', text: 'over an hour' }
    ]);
    expect(rows(el).map(r => r.dataset.line)).toEqual([
      '00:00.0 status go', '02:11.2 status still going', '14:07.6 status done', '62:03.4 status over an hour'
    ]);
  });

  test('a target row says which layer answered and rounds the distance', () => {
    const el = renderTraceView([{
      seq: 1, at: 1_000, kind: 'target', via: 'atlas', kind_: 'tree', name: 'Oak', x: 3260, z: 3200, distance: 41.6
    }]);
    expect(rows(el)[0]!.dataset.kind).toBe('target');
    expect(rows(el)[0]!.textContent).toContain('target found Oak via atlas at 3260, 3200 (42 tiles)');
  });

  // The only place a filed screenshot is visible at all. The id is on the line on purpose: the
  // bytes live in the Worker's attachment store and the id is the whole of how they are named.
  test('an attachment row says what was filed and under which id', () => {
    const el = renderTraceView([
      { seq: 1, at: 1_000, kind: 'attachment', attachmentId: 'k3n8ba91qz', label: 'stuck at the bank' }
    ]);
    expect(rows(el)[0]!.dataset.kind).toBe('attachment');
    expect(rows(el)[0]!.dataset.line).toBe('00:00.0 attachment stuck at the bank (k3n8ba91qz)');
  });

  test('a health row names the condition, and a recovery row says how it ended', () => {
    // The only user-visible surface of a trace variant is this line.
    const el = renderTraceView([
      { seq: 1, at: 1_000, kind: 'health', condition: 'logout', detail: 'disconnect' },
      { seq: 2, at: 1_100, kind: 'health', condition: 'no-progress' },
      { seq: 3, at: 2_000, kind: 'recovery', condition: 'no-progress', action: 'attempt 1', outcome: 'failed' }
    ]);
    expect(rows(el).map(r => r.dataset.kind)).toEqual(['health', 'health', 'recovery']);
    expect(rows(el)[0]!.textContent).toContain('health logout (disconnect)');
    expect(rows(el)[1]!.textContent).toContain('health no-progress');
    expect(rows(el)[2]!.textContent).toContain('recovery no-progress: attempt 1 -> failed');
  });

  // The `<select>` of kinds is gone: the 2px kind rails say the kind, and a select could never
  // find "Chopping" in a trace at all. The replacement reads the whole rendered line.
  test('the filter is a case-insensitive substring against the whole line, not the kind', () => {
    const el = renderTraceView(events);
    applyFilter(el, 'chopping');
    expect(visible(el).map(r => r.dataset.kind)).toEqual(['log']);
    // A kind still matches, because the kind token IS the second word of every line.
    applyFilter(el, 'stuck');
    expect(visible(el).map(r => r.dataset.kind)).toEqual(['stuck']);
    applyFilter(el, '   ');
    expect(visible(el)).toHaveLength(4);
  });

  test('the visible lines are what a copy hands over, in order and without the hidden ones', () => {
    const el = renderTraceView(events);
    expect(visibleLines(el)).toHaveLength(4);
    applyFilter(el, 'Chopping');
    expect(visibleLines(el)).toEqual(['00:02.5 log [info] Chopping Tree']);
  });

  test('a stuck row expands its snapshot into a pre, and collapses again', () => {
    const el = renderTraceView(events);
    const stuck = rows(el)[3]!;
    expect(el.querySelector('.trace-pre')).toBeNull();
    stuck.click();
    expect(el.querySelector('.trace-pre')?.textContent).toContain('"hp": 3');
    stuck.click();
    expect(el.querySelector('.trace-pre')).toBeNull();
  });

  test('a live event appends a row dated by its own at, not by the run start', () => {
    const el = renderTraceView(events);
    appendTraceEvent(el, { seq: 5, at: 10_000, kind: 'xp', skill: 'Woodcutting', delta: 25 });
    expect(rows(el)).toHaveLength(5);
    // Every appended row used to be dated `t0`, so a live trace read 00:00.0 for the whole run.
    expect(rows(el)[4]!.dataset.line).toBe('00:09.0 xp Woodcutting +25');
    // With no filter input above it (the window owns that), an append shows.
    expect(visible(el)).toHaveLength(5);
  });

  test('an expandable row is a real button that toggles aria-expanded', () => {
    const el = renderTraceView(events);
    expect(rows(el)[2]!.querySelector('button')).toBeNull();
    const toggle = rows(el)[3]!.querySelector<HTMLButtonElement>('button.trace-line')!;
    expect(toggle).not.toBeNull();
    expect(toggle.type).toBe('button');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.trace-pre')?.textContent).toContain('"hp": 3');
    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.trace-pre')).toBeNull();
  });

  test('a snapshot appended live is a button as well', () => {
    const el = renderTraceView(events);
    appendTraceEvent(el, { seq: 5, at: 10_000, kind: 'snapshot', snapshot: { hp: 9 } });
    const toggle = rows(el)[4]!.querySelector<HTMLButtonElement>('button.trace-line')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(rows(el)[4]!.dataset.line).toBe('00:09.0 snapshot');
    toggle.click();
    expect(rows(el)[4]!.querySelector('.trace-pre')?.textContent).toContain('"hp": 9');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
});

// `trace.ts` re-emits a coalesced xp or item row under the seq it already had. The rows are
// keyed on that seq, so the live view has to correct the line rather than print a second one.
test('a re-emitted event rewrites its own row instead of adding another', () => {
  const el = renderTraceView([{ seq: 1, at: 0, kind: 'xp', skill: 'Woodcutting', delta: 25 }]);
  appendTraceEvent(el, { seq: 1, at: 1000, kind: 'xp', skill: 'Woodcutting', delta: 50 });
  const shown = rows(el);
  expect(shown).toHaveLength(1);
  expect(shown[0].textContent).toContain('xp Woodcutting +50');
  // The rail is driven off `data-kind`, and the offset off the row's original `at`, so a rewrite
  // has to leave both intact: the merge extended a stretch of time that began where it began.
  expect(shown[0].dataset.kind).toBe('xp');
  expect(shown[0].textContent).toContain('00:00.0');
});

// The array half of the same merge, which is what lets the window rebuild after a close.
test('mergeTraceEvent replaces by seq and appends anything new', () => {
  const kept: TraceEvent[] = [{ seq: 1, at: 0, kind: 'xp', skill: 'Woodcutting', delta: 25 }];
  mergeTraceEvent(kept, { seq: 1, at: 1000, kind: 'xp', skill: 'Woodcutting', delta: 50 });
  mergeTraceEvent(kept, { seq: 2, at: 1000, kind: 'status', text: 'on' });
  expect(kept).toHaveLength(2);
  expect(kept[0]).toMatchObject({ seq: 1, delta: 50 });
});
