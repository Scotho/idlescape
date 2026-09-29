// The script row, the per-script switch, the parameters form and the history row: every builder
// the Automation panel composes around the run card. Split out of tasksViews.test.ts by Task 15,
// which grew the run card's own cases past what one file under the ceiling could hold; the run
// card, and the stylesheet it is measured against, stay there.
//
// `renderHistoryRow` is imported from `tasksHistory.ts`, not from `tasksViews.ts`: Task 15 moved
// it beside the history section, which is its only caller, when tasksViews.ts reached 394 lines.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { renderParamsForm, renderScriptRow } from './tasksViews';
import { renderHistoryRow } from './tasksHistory';
import { run } from './tasks.harness';
import type { TaskSummary } from '../../tasks/types';

const automationCss = (): string => readFileSync(resolve(process.cwd(), 'src/styles/layout/automation.css'), 'utf8');

/** The declarations of one base rule, by exact selector. The same reader tasksViews.test.ts uses. */
function baseRule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!found) throw new Error(`no base rule for ${selector} in layout/automation.css`);
  return found[1];
}

const task = (o: Partial<TaskSummary>): TaskSummary => ({
  id: 'chop-and-drop', name: 'Chop and drop', description: 'Chops', version: 1, tags: ['skilling'],
  source: 'library', params: {}, requirements: { ok: true, missing: [] }, order: 10, enabled: true, ...o
});

describe('script row', () => {
  test('library rows offer Run and Fork; user rows offer Run, Edit, Delete; unmet requirements disable Run with a title', () => {
    const lib = renderScriptRow(task({ description: '', tags: [], requirements: { ok: false, missing: ['Needs a bronze axe'] } }), { run: vi.fn(), edit: vi.fn(), fork: vi.fn(), remove: vi.fn() });
    const runBtn = lib.querySelector<HTMLButtonElement>('[data-task-run]')!;
    expect(runBtn.disabled).toBe(true); expect(runBtn.title).toContain('bronze axe');
    expect(lib.querySelector('[data-task-fork]')).not.toBeNull(); expect(lib.querySelector('[data-task-delete]')).toBeNull();
    const user = renderScriptRow(task({ id: 'u1', name: 'Mine', description: '', version: 2, tags: [], source: 'user', order: 1000 }), { run: vi.fn(), edit: vi.fn(), fork: vi.fn(), remove: vi.fn() });
    expect(user.querySelector('[data-task-edit]')).not.toBeNull(); expect(user.querySelector('[data-task-delete]')).not.toBeNull();
  });
  test('the list owns the gap between cards, and the card carries no margin of its own', () => {
    // `scriptsHost` is a flex column (builtin/tasks.ts), so a `margin-top` on a card ADDS to its
    // gap instead of setting it: the pair shipped 11px apart where the mock says 7. jsdom has no
    // layout, so the stylesheet's own text is the only place this claim can be made at all.
    const css = automationCss();
    expect(baseRule(css, '.task-list')).toContain('gap: 7px');
    expect(baseRule(css, '.task-row')).not.toContain('margin');
    expect(css).not.toMatch(/\.task-row \+ \.task-row/);
  });

  test('a library row with no forkable source gets no Fork button, rather than one that errors', () => {
    const lib = task({ id: 'tutorial-island', source: 'library' });
    expect(renderScriptRow(lib, { fork: vi.fn() }, { forkable: false }).querySelector('[data-task-fork]')).toBeNull();
    // And nothing else on the row moves: Run is still there, Edit and Delete still are not.
    const row = renderScriptRow(lib, { fork: vi.fn() }, { forkable: false });
    expect(row.querySelector('[data-task-run]')).not.toBeNull();
    expect(row.querySelector('[data-task-edit]')).toBeNull();
    expect(row.querySelector('[data-task-delete]')).toBeNull();
    // A forkable library row is unchanged, so the flag gates rather than removes.
    expect(renderScriptRow(lib, { fork: vi.fn() }, { forkable: true }).querySelector('[data-task-fork]')).not.toBeNull();
  });
  test('is a lifting card whose source badge is the small geometry', () => {
    const row = renderScriptRow(task({}), {});
    expect(row.className).toBe('card card-lift task-row');
    const badge = row.querySelector('.badge')!;
    expect(badge.className).toBe('badge badge-info badge-sm');
    expect(badge.textContent).toBe('Library');
    // A fork and a script of the player's own name themselves, on the accent tone the mock gives
    // the second card.
    expect(renderScriptRow(task({ source: 'fork' }), {}).querySelector('.badge')?.textContent).toBe('Fork');
    expect(renderScriptRow(task({ source: 'user' }), {}).querySelector('.badge')?.className).toBe('badge badge-accent badge-sm');
  });

  test('the card buttons are the sm geometry, and Run carries the in-card glow', () => {
    const row = renderScriptRow(task({}), {});
    // Ruling R16: the mock's card buttons are 25px (`sm`), not the xs README describes. Without
    // `btn-in-card` the primary takes the co-pilot bar's heavier .28/.45 glow.
    expect(row.querySelector('[data-task-run]')?.className).toBe('btn btn-primary btn-sm btn-in-card');
    expect(row.querySelector('[data-task-fork]')?.className).toBe('btn btn-sm');
    expect(renderScriptRow(task({ source: 'user' }), {}).querySelector('[data-task-delete]')?.className).toBe('btn btn-danger btn-sm');
  });

  test('the requirement line is amber prose with no warning glyph (ruling R19)', () => {
    const row = renderScriptRow(task({ requirements: { ok: false, missing: ['Needs a bronze pickaxe in your inventory'] } }), {});
    const req = row.querySelector('.task-req')!;
    expect(req.textContent).toBe('Needs a bronze pickaxe in your inventory');
    // The brand guide allows no decorative glyph, and map-design note S23 flags this one. A row
    // that meets its requirements draws no line at all.
    expect(req.textContent).not.toContain('⚠');
    expect(renderScriptRow(task({}), {}).querySelector('.task-req')).toBeNull();
  });

  test('the row is keyed by id and its buttons call the handlers', () => {
    const handlers = { run: vi.fn(), edit: vi.fn(), fork: vi.fn(), remove: vi.fn() };
    const row = renderScriptRow(task({ id: 'u1', source: 'user' }), handlers);
    expect(row.dataset.taskRow).toBe('u1');
    row.querySelector<HTMLButtonElement>('[data-task-run="u1"]')!.click();
    row.querySelector<HTMLButtonElement>('[data-task-edit="u1"]')!.click();
    row.querySelector<HTMLButtonElement>('[data-task-delete="u1"]')!.click();
    expect(handlers.run).toHaveBeenCalled(); expect(handlers.edit).toHaveBeenCalled(); expect(handlers.remove).toHaveBeenCalled();
  });
});

describe('the per-script switch', () => {
  test('an enabled row shows a checked switch reading On and a live Run button', () => {
    const row = renderScriptRow(task({ id: 'u1', source: 'user' }), {});
    const box = row.querySelector<HTMLInputElement>('[data-task-enabled="u1"]')!;
    expect(box.checked).toBe(true);
    expect(row.querySelector('.task-row-toggle .field-label')?.textContent).toBe('On');
    const runBtn = row.querySelector<HTMLButtonElement>('[data-task-run]')!;
    expect(runBtn.disabled).toBe(false);
    expect(runBtn.title).toBe('Run Chop and drop');
  });

  test('a disabled row reads Off, unchecks the switch and refuses Run with a reason', () => {
    const row = renderScriptRow(task({ id: 'u1', source: 'user', enabled: false }), {});
    expect(row.querySelector<HTMLInputElement>('[data-task-enabled="u1"]')!.checked).toBe(false);
    expect(row.querySelector('.task-row-toggle .field-label')?.textContent).toBe('Off');
    const runBtn = row.querySelector<HTMLButtonElement>('[data-task-run]')!;
    expect(runBtn.disabled).toBe(true);
    expect(runBtn.title).toBe('This script is turned off');
  });

  test('turning the switch off, then on, reports what the box now holds', () => {
    const setEnabled = vi.fn();
    const on = renderScriptRow(task({ id: 'u1', source: 'user' }), { setEnabled });
    const box = on.querySelector<HTMLInputElement>('[data-task-enabled="u1"]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(setEnabled).toHaveBeenCalledWith(false);
    const off = renderScriptRow(task({ id: 'u1', source: 'user', enabled: false }), { setEnabled });
    const offBox = off.querySelector<HTMLInputElement>('[data-task-enabled="u1"]')!;
    offBox.checked = true;
    offBox.dispatchEvent(new Event('change'));
    expect(setEnabled).toHaveBeenLastCalledWith(true);
  });

  test('a turned-off row says so rather than naming its unmet requirements', () => {
    const row = renderScriptRow(task({ enabled: false, requirements: { ok: false, missing: ['Needs a bronze axe'] } }), {});
    expect(row.querySelector<HTMLButtonElement>('[data-task-run]')!.title).toBe('This script is turned off');
  });

  test('the switch is the design system\'s switch, and it says which script it belongs to', () => {
    const row = renderScriptRow(task({ id: 'u1', name: 'My miner', source: 'user' }), {});
    // form.css draws the mock's native checkbox as `.switch`, an accent colour on a 15px square,
    // so the class is on the BOX and the label is only the row. On the label instead, `.switch`
    // collapses a flex row to 15px square and hides the state caption beside it.
    const box = row.querySelector<HTMLInputElement>('input.switch[type="checkbox"]');
    expect(box).not.toBeNull();
    expect(box!.getAttribute('data-task-enabled')).toBe('u1');
    expect(box!.parentElement!.classList.contains('field-inline')).toBe(true);
    // The only text in the label is the state, so without this every row announces "On".
    expect(box!.getAttribute('aria-label')).toBe('Enable My miner');
  });

  test('a boolean parameter is a switch too, drawn by the same rule on the box', () => {
    const form = renderParamsForm({ keepLogs: { type: 'boolean', label: 'Keep logs', default: true } }, vi.fn());
    const box = form.querySelector<HTMLInputElement>('input.switch[type="checkbox"][name="keepLogs"]');
    expect(box).not.toBeNull();
    expect(box!.checked).toBe(true);
  });

  test('a row with no toggle field at all is treated as on', () => {
    const bare = task({ id: 'u1', source: 'user' });
    delete (bare as { enabled?: boolean }).enabled;
    const row = renderScriptRow(bare, {});
    expect(row.querySelector<HTMLInputElement>('[data-task-enabled="u1"]')!.checked).toBe(true);
    expect(row.querySelector<HTMLButtonElement>('[data-task-run]')!.disabled).toBe(false);
  });
});

describe('params form', () => {
  test('renders fields from the schema and submits typed values', () => {
    const onSubmit = vi.fn();
    const form = renderParamsForm({ untilLevel: { type: 'number', label: 'Stop at level', default: 15, min: 2, max: 99 }, keepLogs: { type: 'boolean', label: 'Keep logs', default: false } }, onSubmit);
    (form.querySelector('[name="untilLevel"]') as HTMLInputElement).value = '20';
    (form.querySelector('[name="keepLogs"]') as HTMLInputElement).checked = true;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onSubmit).toHaveBeenCalledWith({ untilLevel: 20, keepLogs: true });
  });
  test('select and text fields come back as strings and untouched defaults survive', () => {
    const onSubmit = vi.fn();
    const form = renderParamsForm({
      tree: { type: 'select', label: 'Tree', default: 'Oak', options: [{ value: 'Tree', label: 'Tree' }, { value: 'Oak', label: 'Oak' }] },
      spot: { type: 'text', label: 'Spot', default: 'Fishing spot', maxLength: 40 }
    }, onSubmit);
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onSubmit).toHaveBeenCalledWith({ tree: 'Oak', spot: 'Fishing spot' });
  });
});

// Spec 3.5: a past run's row keeps its shape and gains the reason it ended and its xp rate. The
// numbers are asserted as literals, not as the arithmetic recomputed beside the assertion.
describe('history row', () => {
  const meta = (el: HTMLElement): string => el.querySelector<HTMLElement>('[data-history-meta]')!.textContent ?? '';

  test('the button opens the report, and keeps the e2e hook it has always had', () => {
    const row = renderHistoryRow(run({}), vi.fn());
    const button = row.querySelector<HTMLButtonElement>('[data-trace-open="r1"]')!;
    expect(button.textContent).toBe('Open report');
  });

  test('clicking it calls back once', () => {
    const onOpen = vi.fn();
    renderHistoryRow(run({}), onOpen).querySelector<HTMLButtonElement>('[data-trace-open="r1"]')!.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  // 250 xp in 65 seconds is 13 846 an hour. A run that earned nothing has no rate to report,
  // and neither does a row seeded at run start, whose duration is still zero.
  test('the row reports what the run earned an hour', () => {
    expect(meta(renderHistoryRow(run({}), vi.fn()))).toContain('13,846 xp/h');
    expect(meta(renderHistoryRow(run({ xpGained: {} }), vi.fn()))).not.toContain('xp/h');
    expect(meta(renderHistoryRow(run({ durationMs: 0, endedAt: null }), vi.fn()))).not.toContain('xp/h');
  });

  test('how the run ended is the dot, and why is the meta line', () => {
    const failed = renderHistoryRow(run({ status: 'failed', failReason: 'died' }), vi.fn());
    expect(failed.querySelector('.dot')?.className).toBe('dot dot-error');
    // SP4b put the fail reason in a second badge; the mock's row has no badge at all and reads
    // the reason in its meta ('02:15 · 0 xp · no fishing spot in range'), so it moves there
    // rather than being dropped.
    expect(meta(failed)).toContain('died');
    expect(failed.querySelectorAll('.badge')).toHaveLength(0);
    expect(renderHistoryRow(run({}), vi.fn()).querySelector('.dot')?.className).toBe('dot dot-ok');
    // `stopped` is the idle grey: a run the player stopped did not go wrong.
    expect(renderHistoryRow(run({ status: 'stopped' }), vi.fn()).querySelector('.dot')?.className).toBe('dot');
  });

  test('the meta line is not mono, and the button is the outline xs (note S17, ruling R16)', () => {
    const row = renderHistoryRow(run({}), vi.fn());
    expect(row.className).toBe('history-row');
    expect(row.querySelector('[data-history-meta]')?.className).toBe('history-meta');
    expect(row.querySelector('[data-trace-open]')?.className).toBe('btn btn-outline btn-xs');
    // README calls this meta mono; the mock sets no font-family and no tabular figures on it.
    const css = automationCss();
    expect(baseRule(css, '.history-meta')).not.toContain('font-family');
    expect(baseRule(css, '.history-meta')).not.toContain('font-variant-numeric');
  });

  test('the row still names the script, its elapsed time and its xp', () => {
    const text = renderHistoryRow(run({}), vi.fn()).textContent ?? '';
    expect(text).toContain('Chop and drop');
    expect(meta(renderHistoryRow(run({}), vi.fn()))).toContain('250 xp');
  });
});
