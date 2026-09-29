// The run card: what it draws for each run state, what it patches in place on a tick, and the
// geometry layout/automation.css gives it. It reads a value and returns DOM, so it is tested
// without a panel, an api or a mount. Split out of tasks.test.ts when the per-script toggle took
// that file to the 400-line ceiling; the panel itself, and everything that needs an api behind
// it, stays there, and every other builder is tasksViews.rows.test.ts.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { renderRunCard, updateRunCard, type HealthNote } from './tasksViews';
import type { RunStatus } from '../../tasks/types';

// Read off disk rather than `import '...css?raw'`, for the reason styles.test.ts gives: vitest
// stubs CSS imports to '' by default.
const automationCss = readFileSync(resolve(process.cwd(), 'src/styles/layout/automation.css'), 'utf8');

const status = (state: RunStatus['state']): RunStatus => ({
  state, reason: null, runId: state === 'idle' ? null : 'r1', scriptId: 'chop-and-drop', scriptName: 'Chop and drop',
  task: 'chop-nearest', statusLine: 'Chopping Tree', attempts: 1, startedAt: 1_000, attached: false, resumeAtMs: null,
  target: null, health: null, xpPerHour: {}
});

/**
 * The declarations of one BASE rule, by exact selector, read out of the stylesheet's own source.
 * The cascade harness reads a loaded document instead, which is the right tool for a rule whose
 * value is decided by a file imported after this one; every rule asserted here is written once,
 * in this file, and reading the text is what lets the case name the selector it means.
 */
function baseRule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!found) throw new Error(`no base rule for ${selector} in layout/automation.css`);
  return found[1];
}

/** The counters a tick hands back. The card renders the row either way; the panel fills it. */
const ZERO = { logs: 0, sessionXp: 0 };

const NOTES: HealthNote[] = [
  { seq: 1, at: 10, kind: 'health', condition: 'dialog-stuck', detail: 'a dialog is open' },
  { seq: 2, at: 20, kind: 'recovery', condition: 'dialog-stuck', action: 'close-dialog', outcome: 'recovered' }
];

/** Seven checks, oldest first: the card is meant to keep the last five and drop `death`. */
const MANY: HealthNote[] = ([
  'death', 'logout', 'low-hp', 'inventory-full', 'no-progress', 'level-up', 'dialog-stuck'
] as const).map((condition, i) => ({ seq: i, at: i * 10, kind: 'health' as const, condition }));


describe('run card', () => {
  test('running shows task, pause and stop; paused shows the reason and resume', () => {
    const el = renderRunCard({ ...status('running'), runId: 'r', scriptId: 's', scriptName: 'Chop', startedAt: Date.now() - 65_000 }, { pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), restart: vi.fn() });
    expect(el.querySelector('[data-run-state]')?.textContent).toBe('Running');
    expect(el.querySelector('[data-run-task]')?.textContent).toContain('chop-nearest');
    expect(el.querySelector('[data-run-pause]')).not.toBeNull();
    expect(el.querySelector('[data-run-resume]')).toBeNull();
    const paused = renderRunCard({ ...status('paused'), reason: 'human-input', runId: 'r', scriptId: 's', scriptName: 'Chop', statusLine: '', startedAt: 0, resumeAtMs: Date.now() + 3000 }, { pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), restart: vi.fn() });
    expect(paused.querySelector('[data-run-state]')?.textContent).toMatch(/Paused — you took control/);
    expect(paused.querySelector('[data-run-resume]')).not.toBeNull();
  });
  test('stuck and hard-stop use the warning and error tones', () => {
    const stuck = renderRunCard({ state: 'paused', reason: 'stuck', task: 'cut-tree' } as never, {} as never);
    expect(stuck.querySelector('[data-run-state]')?.className).toContain('badge-warn');
    expect(stuck.querySelector('[data-run-state]')?.textContent).toBe('Stuck on cut-tree');
    // The runner pauses with `hard-stop` and then fails the run, so the badge has to name what
    // stopped it in the settled state too, not only in the paused one (frame/runPresentation.ts's
    // `outcomeLabel`). Without that arm this row reads a bare "Failed".
    const dead = renderRunCard({ state: 'failed', reason: 'hard-stop', task: null } as never, {} as never);
    expect(dead.querySelector('[data-run-state]')?.className).toContain('badge-error');
    expect(dead.querySelector('[data-run-state]')?.textContent).toBe('Stopped: hp too low');
  });
  test('the human-input countdown follows the clock and the elapsed time is mm:ss', () => {
    const now = 1_000_000;
    const el = renderRunCard({ ...status('paused'), reason: 'human-input', resumeAtMs: now + 4_000, startedAt: now - 65_000 }, {}, { now });
    expect(el.querySelector('[data-run-state]')?.textContent).toBe('Paused — you took control · resumes in 4s');
    expect(el.querySelector('.run-elapsed')?.textContent).toBe('01:05');
  });
  test('the detail names what the run is working on and every skill rate it is earning', () => {
    const el = renderRunCard({
      ...status('running'),
      target: { via: 'scene', kind: 'tree', name: 'Oak', distance: 12.4 },
      xpPerHour: { Woodcutting: 12_000, Firemaking: 800 }
    }, {});
    const target = el.querySelector<HTMLElement>('[data-run-target]')!;
    expect(target.textContent).toBe('Working on Oak, 12 tiles away (in view)');
    expect(target.hidden).toBe(false);
    const xp = el.querySelector<HTMLElement>('[data-run-xp]')!;
    expect(xp.textContent).toContain('12,000 Woodcutting xp/h');
    expect(xp.textContent).toContain('800 Firemaking xp/h');
  });

  test('a run with no target and nothing earned yet hides both lines and the check list', () => {
    const el = renderRunCard(status('running'), {});
    expect(el.querySelector<HTMLElement>('[data-run-target]')!.hidden).toBe(true);
    expect(el.querySelector<HTMLElement>('[data-run-xp]')!.hidden).toBe(true);
    expect(el.querySelector<HTMLElement>('[data-run-health]')!.hidden).toBe(true);
  });

  test('the card lists the health checks it is handed, newest last', () => {
    const el = renderRunCard(status('running'), {}, { notes: NOTES.slice(0, 2) });
    const items = el.querySelectorAll('[data-run-health-item]');
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toBe('Noticed dialog-stuck (a dialog is open)');
    expect(items[1]!.textContent).toBe('dialog-stuck: close-dialog recovered');
  });

  // Rebuilding the card would take keyboard focus off Pause with it, which is the whole reason
  // `updateRunCard` exists; the detail has to be patched the same way the clock already is.
  test('updateRunCard patches the detail into the nodes it already rendered', () => {
    const el = renderRunCard(status('running'), {}, { now: 1_000 });
    const target = el.querySelector<HTMLElement>('[data-run-target]')!;
    const list = el.querySelector<HTMLElement>('[data-run-health]')!;
    expect(target.hidden).toBe(true);
    updateRunCard(el, { ...status('running'), target: { via: 'atlas', kind: 'rock', name: 'Copper rock', distance: 3 }, xpPerHour: { Mining: 9_500 } }, ZERO, { now: 1_000, notes: NOTES.slice(0, 1) });
    expect(el.querySelector('[data-run-target]')).toBe(target);
    expect(el.querySelector('[data-run-health]')).toBe(list);
    expect(target.hidden).toBe(false);
    expect(target.textContent).toBe('Working on Copper rock, 3 tiles away (from the atlas)');
    expect(el.querySelector('[data-run-xp]')?.textContent).toBe('9,500 Mining xp/h');
    expect(list.querySelectorAll('[data-run-health-item]')).toHaveLength(1);
    // And back the other way: a status that has lost its target must not leave the line it drew
    // standing empty. The tick calls this once a second for the whole of a run.
    updateRunCard(el, status('running'), ZERO, { now: 1_000 });
    expect(target.hidden).toBe(true);
    expect(el.querySelector<HTMLElement>('[data-run-xp]')!.hidden).toBe(true);
    expect(list.hidden).toBe(true);
  });

  // The card renders what it is handed and does not cap it: the panel owns the buffer and its
  // length, and the number lives beside that buffer in tasks.ts, where tasks.test.ts pins it.
  test('the card renders every check it is handed, in the order it is given them', () => {
    const el = renderRunCard(status('running'), {}, { notes: MANY });
    const items = Array.from(el.querySelectorAll('[data-run-health-item]'));
    expect(items).toHaveLength(MANY.length);
    expect(items.map(i => i.textContent)).toEqual(MANY.map(n => `Noticed ${n.condition}`));
  });

  // The panel patches the card once a second for the whole of a run. A tick that changed nothing
  // must write nothing: replacing the rows or the text node drops any selection over them, which
  // is the churn `updateRunCard` exists to avoid.
  test('a tick that changes nothing rewrites neither the check rows nor the detail lines', () => {
    const live = { ...status('running'), target: { via: 'scene' as const, kind: 'tree' as const, name: 'Oak', distance: 4 }, xpPerHour: { Woodcutting: 12_000 } };
    const el = renderRunCard(live, {}, { now: 1_000, notes: NOTES });
    const rows = Array.from(el.querySelectorAll('[data-run-health-item]'));
    const targetText = el.querySelector('[data-run-target]')!.firstChild;
    const xpText = el.querySelector('[data-run-xp]')!.firstChild;
    expect(rows).toHaveLength(2);
    updateRunCard(el, live, ZERO, { now: 2_000, notes: [...NOTES] });
    // `toBe` per node, not `toEqual` on the list: `toEqual` compares DOM nodes structurally and
    // would pass over a rebuild that produced identical markup, which is the thing under test.
    const again = Array.from(el.querySelectorAll('[data-run-health-item]'));
    expect(again[0]).toBe(rows[0]);
    expect(again[1]).toBe(rows[1]);
    expect(el.querySelector('[data-run-target]')!.firstChild).toBe(targetText);
    expect(el.querySelector('[data-run-xp]')!.firstChild).toBe(xpText);
    // A real change still lands: the guard is a signature, not a one-shot.
    updateRunCard(el, live, ZERO, { now: 3_000, notes: NOTES.slice(0, 1) });
    const after = el.querySelectorAll('[data-run-health-item]');
    expect(after).toHaveLength(1);
    expect(after[0]).not.toBe(rows[0]);
  });

  // The bullet in front of each check is a CSS `content`, so nothing in the DOM can pin it. It
  // shipped once as a stray C1 control byte followed by the digit 2 and the whole suite was
  // green over it, so assert the escape and that the stylesheet holds no non-ASCII byte at all.
  test('the health rows are bulleted with a middle dot and the stylesheet is plain ASCII', () => {
    expect(automationCss).toContain(".run-health-item::before { content: '\\00B7';");
    expect(Array.from(automationCss).filter(ch => ch.charCodeAt(0) > 127)).toEqual([]);
  });

  test('a finished run offers only Run again', () => {
    const el = renderRunCard(status('done'), {});
    expect(el.querySelector('[data-run-state]')?.textContent).toBe('Done');
    expect(el.querySelector('[data-run-restart]')).not.toBeNull();
    expect(el.querySelector('[data-run-pause]')).toBeNull();
    expect(el.querySelector('[data-run-stop]')).toBeNull();
  });
  // Every hook this card has ever carried is addressed by the suite, by tasks.pw.test.ts or by
  // both. The v2 card is a restyle: a rewrite that renamed one of them would pass every case
  // above and fail here.
  test('keeps every hook the suite and the e2e specs address', () => {
    const el = renderRunCard(status('running'), {}, { now: 2_000 });
    for (const hook of ['data-run-card', 'data-run-state', 'data-run-elapsed', 'data-run-pause', 'data-run-stop', 'data-run-task', 'data-run-line', 'data-run-target', 'data-run-xp', 'data-run-health']) {
      expect(el.querySelector(`[${hook}]`) ?? (el.matches(`[${hook}]`) ? el : null), hook).not.toBeNull();
    }
    expect(el.querySelector('[data-run-logs]'), 'data-run-logs').not.toBeNull();
    expect(el.querySelector('[data-run-session-xp]'), 'data-run-session-xp').not.toBeNull();
  });

  test('draws the state badge at the large geometry, and the title and elapsed at the mock sizes', () => {
    const el = renderRunCard(status('running'), {}, { now: 2_000 });
    expect(el.querySelector('[data-run-state]')?.className).toBe('badge badge-lg badge-accent');
    expect(el.querySelector('.run-title')?.textContent).toBe('Chop and drop');
    // map-design S14 and ruling R16: README says 14px, the mock says 16px, and the mock wins. The
    // old assertion here was `className).toContain('run-elapsed')`, a class containing itself,
    // which passes for any element that has the class and pins neither the size nor the font.
    expect(baseRule(automationCss, '.run-elapsed')).toContain('font-size: 16px');
    expect(baseRule(automationCss, '.run-elapsed')).toContain('font-family: var(--font-num)');
    expect(baseRule(automationCss, '.run-title')).toContain('font-size: var(--fs-title)');
  });

  test('is a hero card whose rail follows the presented state', () => {
    const rail = (s: RunStatus): string => renderRunCard(s, {}, { now: 2_000 }).className;
    expect(rail(status('running'))).toBe('card card-hero card-rail-accent run-card');
    expect(rail({ ...status('paused'), reason: 'player' })).toBe('card card-hero card-rail-warn run-card');
    expect(rail({ ...status('paused'), reason: 'stuck' })).toBe('card card-hero card-rail-error run-card');
    // A settled run keeps the card and loses the rail: nothing is driving it any more.
    expect(rail(status('done'))).toBe('card card-hero run-card');
  });

  test('the step row takes the 5px gaps the mock draws, and the action row adds no margin', () => {
    // Both sit in a parent that already sets a flex gap, so neither number is a rounding matter:
    // `--sp-2` (3px) drew the mark-to-label and label-to-connector gaps a third tight in four
    // places, and a `margin-top` on `.run-actions` ADDED to the card's own 6px column gap. 5px is
    // off the spacing scale, which is why it is a literal here and not a token.
    expect(baseRule(automationCss, '.run-steps')).toContain('gap: 5px');
    expect(baseRule(automationCss, '.run-step')).toContain('gap: 5px');
    expect(baseRule(automationCss, '.run-actions')).not.toContain('margin');
  });

  test('draws the quest steps as done, current and upcoming', () => {
    // `upcoming` is only reachable for a replayed finished run; see the Interfaces block. The
    // renderer takes whatever the caller derived and does not invent a step.
    const el = renderRunCard(status('running'), {}, { now: 2_000, steps: [{ label: 'Walk', state: 'done' }, { label: 'Chop tree', state: 'current' }, { label: 'Drop', state: 'upcoming' }] });
    expect([...el.querySelectorAll('.run-step')].map(s => s.getAttribute('data-step'))).toEqual(['done', 'current', 'upcoming']);
    expect(el.querySelector('.run-step[data-step="done"] .run-step-mark')?.textContent).toBe('✓');
    expect(el.querySelectorAll('.run-step-link')).toHaveLength(2);
    // A run whose trace has not named a task yet takes the row off screen rather than drawing an
    // empty one; the node stays so `updateRunCard` has something to patch when the first task
    // arrives, which is the same shape the detail lines and the health list already use.
    const bare = renderRunCard(status('running'), {}, { now: 2_000 }).querySelector<HTMLElement>('.run-steps')!;
    expect(bare.hidden).toBe(true);
    expect(bare.children).toHaveLength(0);
  });

  test('shows Pause while running and Resume while paused or stuck, and Trace and Stop always', () => {
    const labels = (s: RunStatus): (string | null)[] => [...renderRunCard(s, {}, { now: 2_000 }).querySelectorAll('.run-actions .btn')].map(b => b.textContent);
    expect(labels(status('running'))).toEqual(['Pause', 'Trace', 'Stop']);
    expect(labels({ ...status('paused'), reason: 'player' })).toEqual(['Resume', 'Trace', 'Stop']);
    expect(labels({ ...status('paused'), reason: 'stuck' })).toEqual(['Resume', 'Trace', 'Stop']);
    // The trace of a finished run is the one thing still worth opening, so Trace outlives the run.
    expect(labels(status('failed'))).toEqual(['Run again', 'Trace']);
  });

  test('Trace calls back, and does not go through Stop', () => {
    const handlers = { trace: vi.fn(), stop: vi.fn() };
    const el = renderRunCard(status('running'), handlers, { now: 2_000 });
    el.querySelector<HTMLButtonElement>('[data-run-trace]')!.click();
    expect(handlers.trace).toHaveBeenCalledTimes(1);
    expect(handlers.stop).not.toHaveBeenCalled();
  });

  test('patches counters in place rather than rebuilding, so focus survives a tick', () => {
    const el = renderRunCard(status('running'), {}, { now: 2_000 });
    const node = el.querySelector('[data-run-logs]')!;
    expect(node.textContent).toBe('0');
    updateRunCard(el, status('running'), { logs: 42, sessionXp: 4205 }, { now: 2_000 });
    expect(el.querySelector('[data-run-logs]')).toBe(node);
    expect(node.textContent).toBe('42');
    // `data-run-session-xp`, not `data-run-xp`: SP4b Task 10 already owns the latter for the
    // xp-per-hour detail line, and reusing it makes updateRunCard patch the rate line with a
    // total. See this task's Interfaces block.
    expect(el.querySelector('[data-run-session-xp]')?.textContent).toBe('4,205');
    expect(el.querySelector('[data-run-xp]')?.textContent).toBe('');
  });

  test("leaves SP4b's detail lines and health list where it found them", () => {
    const el = renderRunCard({ ...status('running'), target: { via: 'scene', kind: 'tree', name: 'Oak', distance: 12 }, xpPerHour: { Woodcutting: 12_000 } }, {}, { now: 2_000, notes: NOTES.slice(0, 2) });
    // Mutation target: a rewrite that folds these three into the new counter row fails here, which
    // is the whole reason the case exists.
    expect(el.querySelector('[data-run-target]')?.textContent).toContain('Oak');
    expect(el.querySelector('[data-run-xp]')?.textContent).toContain('12,000 Woodcutting xp/h');
    expect(el.querySelectorAll('[data-run-health-item]')).toHaveLength(2);
    // And in the mock's order: the steps sit above the status line, the counters below the checks.
    const classes = [...el.children].map(c => c.className);
    expect(classes.indexOf('run-counters')).toBe(classes.length - 2);
    expect(classes[classes.length - 1]).toBe('run-actions');
  });
});
