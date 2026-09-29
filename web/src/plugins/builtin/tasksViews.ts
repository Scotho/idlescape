// web/src/plugins/builtin/tasksViews.ts -- the pieces the Tasks panel is built from.
// Pure builders: they read a value and return DOM, never touching the api themselves, so the
// panel owns every side effect and these stay trivially testable.
import { outcomeLabel, presentRun, type CopilotState } from '../../frame/runPresentation';
import { badge, h } from '../../ui/el';
import { card, type Rail } from '../../ui/parts';
import { IDLE_STATUS } from '../../tasks/api';
import type { FoundVia, ParamSchema, ParamValues, RunStatus, TaskSummary, TraceEvent } from '../../tasks/types';

/**
 * A `health` or `recovery` trace row. The run card lists the last few, because a run that keeps
 * putting itself back on the rails looks identical to a healthy one from the status alone.
 * How many is not this module's business: the panel owns the buffer and its length, and the
 * number lives beside it in `tasks.ts`.
 */
export type HealthNote = Extract<TraceEvent, { kind: 'health' } | { kind: 'recovery' }>;

export interface RunHandlers { pause(): void; resume(): void; stop(): void; restart(): void; trace(): void }

/** One entry of the quest-step row. `upcoming` is only reachable for a replayed finished run. */
export interface RunStep { label: string; state: 'done' | 'current' | 'upcoming' }
/** The two session figures the counter row reports. The panel reads them off its trackers. */
export interface RunCounters { logs: number; sessionXp: number }

export interface RunCardDeps {
  now?: number;
  steps?: readonly RunStep[];
  /** SP4b Task 10's last-five health checks. `HealthNote` is exported from this file above. */
  notes?: readonly HealthNote[];
}
export interface RowHandlers { run(): void; edit(): void; fork(): void; remove(): void; setEnabled(enabled: boolean): void }
export type Tone = 'ok' | 'warn' | 'error' | 'info' | 'accent' | 'neutral';

const pad = (n: number): string => String(Math.floor(n)).padStart(2, '0');

/** `mm:ss`, the clock the run card and the history rows share. */
export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(s / 60)}:${pad(s % 60)}`;
}

/** A badge is title case; the bar's own copy is sentence case. Only the case is allowed to differ. */
const titled = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The one sentence that says what the run is doing, and a thin adapter over `presentRun` (plan
 * ruling R22). The card and the co-pilot bar used to keep divergent copies of these words, which
 * is how the bar could say "You took over" while the card said "Paused: you took control" about
 * the same second.
 *
 * The card asks about the RUN alone, so pairing and the session are pinned to the two values that
 * let the run answer for itself, and `settledAt: null` keeps a settled run out of the bar's
 * four-second linger: the card NAMES the outcome where the bar collapses all three into standby.
 */
const presented = (s: Partial<RunStatus>, now: number): ReturnType<typeof presentRun> =>
  presentRun({ status: { ...IDLE_STATUS, ...s }, pairing: 'paired-live', session: 'online', now, settledAt: null });

export function statusLabel(s: Partial<RunStatus>, now: number = Date.now()): { text: string; tone: Tone } {
  const full = { ...IDLE_STATUS, ...s };
  const p = presented(full, now);
  if (p.state === 'running') return { text: 'Running', tone: 'accent' };
  if (p.state === 'paused' || p.state === 'stuck') {
    const resumes = p.resumeIn === null ? '' : ` · resumes in ${p.resumeIn}s`;
    return { text: `${titled(p.headline)}${resumes}`, tone: p.tone === 'error' ? 'error' : 'warn' };
  }
  const outcome = outcomeLabel(full);
  return outcome === null ? { text: 'Idle', tone: 'neutral' } : { text: titled(outcome.text), tone: outcome.tone };
}

function actionButton(hook: string, label: string, fn: (() => void) | undefined, primary = false): HTMLButtonElement {
  return h('button', { class: primary ? 'btn btn-primary' : 'btn', type: 'button', [hook]: '', onclick: () => fn?.() }, label);
}

/** The run card's state badge is the large geometry (ruling R17), tone or no tone. */
const badgeClass = (tone: Tone): string => (tone === 'neutral' ? 'badge badge-lg' : `badge badge-lg badge-${tone}`);

/**
 * The card's left rail, from the presented state and nothing else (map-design 3.9's `barRule`).
 * A settled or idle run has none: the rail says something is driving this character.
 */
const RAIL: Partial<Record<CopilotState, Rail>> = { running: 'accent', paused: 'warn', stuck: 'error' };

/** The mark inside a step's disc. `upcoming` is an empty ring, which is what the mock draws. */
const STEP_MARK: Record<RunStep['state'], string> = { done: '✓', current: '●', upcoming: '' };

/** Which of `c.find`'s three layers answered, in words a player reading the card can use. */
const VIA_TEXT: Record<FoundVia, string> = { scene: 'in view', atlas: 'from the atlas', sweep: 'found by sweeping' };

/**
 * What the run is working on, and which layer of `c.find` answered. There is deliberately no
 * ETA: `RunStatus` carries no target level, and a finish time guessed from an xp rate with
 * nothing to aim at would be a made-up number.
 */
const targetText = (s: RunStatus): string =>
  s.target ? `Working on ${s.target.name}, ${Math.round(s.target.distance)} tiles away (${VIA_TEXT[s.target.via]})` : '';

const xpText = (s: RunStatus): string =>
  Object.entries(s.xpPerHour ?? {}).map(([skill, rate]) => `${rate.toLocaleString()} ${skill} xp/h`).join(' · ');

const noteText = (n: HealthNote): string =>
  n.kind === 'health'
    ? `Noticed ${n.condition}${n.detail ? ` (${n.detail})` : ''}`
    : `${n.condition}: ${n.action} ${n.outcome}`;

/**
 * Fill one line, and take it off screen when it has nothing to say. The write is guarded for the
 * reason the banner's `setText` is: the panel patches the card once a second for the whole of a
 * run, and a no-op assignment still replaces the text node and drops any selection over it.
 */
function setLine(el: HTMLElement | null, text: string): void {
  if (!el) return;
  if (el.textContent !== text) el.textContent = text;
  el.hidden = text === '';
}

function fillNotes(list: HTMLElement | null, notes: readonly HealthNote[]): void {
  if (!list) return;
  // Rendered as handed, uncapped: the panel owns the buffer and therefore owns its length. A
  // second cap here would be a second owner of one rule, and the one no test could reach.
  const lines = notes.map(noteText);
  // The rendered signature, so a tick that changed nothing rewrites nothing. `updateRunCard`
  // runs once a second for the whole of a run; rebuilding five `<li>` 3 600 times an hour is
  // exactly the churn this function is patched in place to avoid. No line can hold a newline,
  // so joining on one cannot make two different lists look the same.
  const key = lines.join('\n');
  if (list.dataset.notes === key) return;
  list.dataset.notes = key;
  list.replaceChildren(...lines.map(text => h('li', { class: 'run-health-item', 'data-run-health-item': '' }, text)));
  list.hidden = lines.length === 0;
}
const elapsedOf = (status: Partial<RunStatus>, now: number): string => fmtElapsed(status.startedAt ? now - status.startedAt : 0);

/**
 * The live run: what it is doing, for how long, and the controls that fit its state. `now` is a
 * parameter because the panel re-renders this every second to run the human-input countdown
 * down (`api.onStatus` only fires on an edge), and freezes it once the run is over.
 */
export function renderRunCard(status: RunStatus, handlers: Partial<RunHandlers>, deps: RunCardDeps = {}): HTMLElement {
  const now = deps.now ?? Date.now();
  const label = statusLabel(status, now);
  const state = badge(label.text, label.tone);
  // `badge()` writes the component geometry; the run card's badge is the large one (ruling R17),
  // and `updateRunCard` rewrites the same string when the tone changes.
  state.className = badgeClass(label.tone);
  state.setAttribute('data-run-state', '');
  const live = status.state === 'running' || status.state === 'starting';
  const paused = status.state === 'paused';
  const over = status.state === 'done' || status.state === 'failed' || status.state === 'stopped';
  const el = card({ hero: true, rail: RAIL[presented(status, now).state], class: 'run-card' },
    h('div', { class: 'run-card-head' },
      state,
      h('span', { class: 'run-elapsed num', 'data-run-elapsed': '' }, elapsedOf(status, now))),
    h('div', { class: 'run-title' }, status.scriptName ?? 'Script'),
    stepsRow(deps.steps ?? []),
    h('div', { class: 'kv' },
      h('span', { class: 'kv-label' }, 'Task'),
      h('span', { class: 'kv-value', 'data-run-task': '' }, status.task ?? '—')),
    h('div', { class: 'run-status-line', 'data-run-line': '', hidden: !status.statusLine }, status.statusLine ?? ''),
    // Three siblings rather than a wrapper: the card is a flex column with a gap, and an empty
    // wrapper would still take a gap of its own on every run that has nothing to report.
    h('div', { class: 'run-detail-line', 'data-run-target': '', hidden: targetText(status) === '' }, targetText(status)),
    h('div', { class: 'run-detail-line num', 'data-run-xp': '', hidden: xpText(status) === '' }, xpText(status)),
    notesList(deps.notes ?? []),
    countersRow(),
    h('div', { class: 'run-actions' },
      live ? actionButton('data-run-pause', 'Pause', handlers.pause) : null,
      paused ? actionButton('data-run-resume', 'Resume', handlers.resume, true) : null,
      over ? actionButton('data-run-restart', 'Run again', handlers.restart, true) : null,
      // The trace outlives the run: a finished run's is the one thing still worth opening.
      actionButton('data-run-trace', 'Trace', handlers.trace),
      live || paused ? actionButton('data-run-stop', 'Stop', handlers.stop) : null)
  );
  el.setAttribute('data-run-card', '');
  return el;
}

/** Built once and then filled, so `updateRunCard` can patch the same node it rendered. */
function notesList(notes: readonly HealthNote[]): HTMLElement {
  const list = h('ul', { class: 'run-health', 'data-run-health': '' });
  fillNotes(list, notes);
  return list;
}

/**
 * The quest steps, derived by the panel from the `task_enter` trace and never invented here: no
 * live run can report an `upcoming` step (plan ruling R29), and a run whose trace has named no
 * task yet has no row at all. Built once and patched, exactly like the health list.
 */
function stepsRow(steps: readonly RunStep[]): HTMLElement {
  const row = h('div', { class: 'run-steps', 'data-run-steps': '' });
  fillSteps(row, steps);
  return row;
}

function fillSteps(row: HTMLElement | null, steps: readonly RunStep[]): void {
  if (!row) return;
  // The rendered signature, for the reason `fillNotes` keeps one: the panel patches this once a
  // second and a step list that has not moved must not be rebuilt under the player's pointer.
  const key = steps.map(s => `${s.state}:${s.label}`).join('\n');
  if (row.dataset.steps === key) return;
  row.dataset.steps = key;
  const parts: HTMLElement[] = [];
  for (const step of steps) {
    if (parts.length) parts.push(h('span', { class: 'run-step-link', 'aria-hidden': 'true' }));
    parts.push(h('div', { class: 'run-step', 'data-step': step.state },
      h('span', { class: 'run-step-mark', 'aria-hidden': 'true' }, STEP_MARK[step.state]),
      h('span', { class: 'run-step-label' }, step.label)));
  }
  row.replaceChildren(...parts);
  row.hidden = steps.length === 0;
}

/**
 * What this session has picked up and earned while the run has been going. Neither figure is on
 * `RunStatus`: they are the active character's loot and xp trackers, which the panel already has,
 * and the panel fills them on the tick it already runs. `logs` keeps the plan's field name; the
 * label reads `items`, because the frame cannot know which item a given run is producing and the
 * mock's own `logs` is the item its example run happened to chop.
 */
function countersRow(): HTMLElement {
  return h('div', { class: 'run-counters' },
    h('span', {}, 'items ', h('b', { 'data-run-logs': '' }, '0')),
    h('span', {}, 'xp ', h('b', { 'data-run-session-xp': '' }, '0')));
}

function fillCounters(card: HTMLElement, counters: RunCounters): void {
  const logs = card.querySelector<HTMLElement>('[data-run-logs]');
  if (logs) setText(logs, counters.logs.toLocaleString());
  const xp = card.querySelector<HTMLElement>('[data-run-session-xp]');
  if (xp) setText(xp, counters.sessionXp.toLocaleString());
}

/** A no-op write still replaces the text node and drops any selection over it. */
function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/**
 * The same card, one second later. The panel ticks while a run is live, and rebuilding the card
 * would take keyboard focus off Pause or Stop with it, so only the text that moves is written
 * back. The controls are left alone; the panel rebuilds when the state changes which ones fit.
 */
export function updateRunCard(card: HTMLElement, status: RunStatus, counters: RunCounters, deps: RunCardDeps = {}): void {
  const now = deps.now ?? Date.now();
  const label = statusLabel(status, now);
  const state = card.querySelector<HTMLElement>('[data-run-state]');
  if (state) { state.textContent = label.text; state.className = badgeClass(label.tone); }
  const elapsed = card.querySelector<HTMLElement>('[data-run-elapsed]');
  if (elapsed) elapsed.textContent = elapsedOf(status, now);
  const task = card.querySelector<HTMLElement>('[data-run-task]');
  if (task) task.textContent = status.task ?? '—';
  const line = card.querySelector<HTMLElement>('[data-run-line]');
  if (line) { line.textContent = status.statusLine; line.hidden = !status.statusLine; }
  setLine(card.querySelector<HTMLElement>('[data-run-target]'), targetText(status));
  setLine(card.querySelector<HTMLElement>('[data-run-xp]'), xpText(status));
  fillNotes(card.querySelector<HTMLElement>('[data-run-health]'), deps.notes ?? []);
  fillSteps(card.querySelector<HTMLElement>('[data-run-steps]'), deps.steps ?? []);
  fillCounters(card, counters);
}

const SOURCE_TONE: Record<TaskSummary['source'], Tone> = { library: 'info', user: 'accent', fork: 'accent' };

/** Options a row cannot work out for itself, because they read the shipped script bundle. */
export interface RowOptions {
  /**
   * Whether a library row gets a Fork button. Not every bundled script has forkable source: a
   * multi-module one has no single seed, `librarySource` answers null for it, and a Fork button
   * over that only ever produces an error toast. The panel knows which; this builder does not.
   * Absent means forkable, which is what every single-module library script is.
   */
  forkable?: boolean;
}

/** One script in "My scripts": what it is, and the things you can do to it. */
export function renderScriptRow(task: TaskSummary, handlers: Partial<RowHandlers>, opts: RowOptions = {}): HTMLElement {
  const missing = task.requirements?.missing ?? [];
  const ok = task.requirements?.ok !== false;
  // Absent means on, so a row built from a stale summary runs rather than looking broken. The
  // player's own switch outranks unmet requirements in the title: it is the one they can undo
  // from this row.
  const off = task.enabled === false;
  const isLibrary = task.source === 'library';
  const meta = [`v${task.version}`, task.estimateMinutes ? `~${task.estimateMinutes} min` : null, ...(task.tags ?? [])].filter(Boolean).join(' · ');
  const sourceBadge = badge(isLibrary ? 'Library' : task.source === 'fork' ? 'Fork' : 'Yours', SOURCE_TONE[task.source]);
  sourceBadge.classList.add('badge-sm');
  const row = card({ class: 'card-lift task-row' },
    h('div', { class: 'task-row-head' },
      h('span', { class: 'task-row-name' }, task.name),
      sourceBadge),
    task.description ? h('div', { class: 'task-row-desc' }, task.description) : null,
    h('div', { class: 'task-meta' }, meta),
    task.lastRun ? h('div', { class: 'task-meta' }, `Last run: ${task.lastRun.status}${task.lastRun.summary ? ` · ${task.lastRun.summary}` : ''}`) : null,
    // The amber requirement line, and no glyph in front of it: the brand guide allows a Unicode
    // glyph as data and this one was decoration (ruling R19, map-design note S23).
    ok ? null : h('div', { class: 'task-req' }, missing.join('; ')),
    h('div', { class: 'task-row-actions' },
      // `switch` belongs on the box, not on the container: the v2 family draws the mock's native
      // checkbox, `accent-color` plus a 15px square, so the class is on the control itself and the
      // label wears the row shape. The box needs its own name too, because the only text in the
      // label is the state, so ten rows would otherwise announce ten controls all called "On".
      h('label', { class: 'field field-inline task-row-toggle' },
        h('input', {
          type: 'checkbox', class: 'switch', 'data-task-enabled': task.id, checked: !off,
          'aria-label': `Enable ${task.name}`,
          onchange: (ev: Event) => handlers.setEnabled?.((ev.target as HTMLInputElement).checked)
        }),
        h('span', { class: 'field-label' }, off ? 'Off' : 'On')),
      h('button', {
        // `btn-in-card` is the mock's lighter resting glow; without it a card button takes the
        // co-pilot bar's .28/.45, which is the one the panel-width call to action wears.
        class: 'btn btn-primary btn-sm btn-in-card', type: 'button', 'data-task-run': task.id, disabled: off || !ok,
        title: off ? 'This script is turned off' : ok ? `Run ${task.name}` : missing.join('; '),
        onclick: () => handlers.run?.()
      }, 'Run'),
      isLibrary
        ? (opts.forkable === false
          ? null
          : h('button', { class: 'btn btn-sm', type: 'button', 'data-task-fork': task.id, title: 'Copy this script into your account so you can change it', onclick: () => handlers.fork?.() }, 'Fork'))
        : h('button', { class: 'btn btn-sm', type: 'button', 'data-task-edit': task.id, onclick: () => handlers.edit?.() }, 'Edit'),
      isLibrary ? null : h('button', { class: 'btn btn-danger btn-sm', type: 'button', 'data-task-delete': task.id, onclick: () => handlers.remove?.() }, 'Delete'))
  );
  row.setAttribute('data-task-row', task.id);
  return row;
}

function paramField(key: string, field: ParamSchema[string]): HTMLElement {
  const control = field.type === 'boolean'
    ? h('input', { type: 'checkbox', class: 'switch', name: key, checked: field.default })
    : field.type === 'select'
      ? h('select', { class: 'input', name: key }, ...field.options.map(o => h('option', { value: o.value, selected: o.value === field.default }, o.label)))
      : field.type === 'number'
        ? h('input', { type: 'number', class: 'input', name: key, value: String(field.default), min: field.min, max: field.max, step: field.step })
        : h('input', { type: 'text', class: 'input', name: key, value: field.default, maxlength: field.maxLength });
  // Same shape as the row's switch: `switch` is on the box, which is where the v2 family draws
  // the mock's native checkbox, and the label is the row.
  return h('label', { class: 'field field-inline' }, h('span', { class: 'field-label' }, field.label), control);
}

function readValues(form: HTMLFormElement, schema: ParamSchema): ParamValues {
  const values: ParamValues = {};
  for (const [key, field] of Object.entries(schema)) {
    const el = form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${key}"]`);
    if (!el) { values[key] = field.default; continue; }
    if (field.type === 'boolean') values[key] = (el as HTMLInputElement).checked;
    else if (field.type === 'number') values[key] = Number(el.value);
    else values[key] = el.value;
  }
  return values;
}

/** The parameters a script declares, as a form that hands back typed values. */
export function renderParamsForm(schema: ParamSchema, onSubmit: (values: ParamValues) => void, opts: { submitLabel?: string; onCancel?: () => void } = {}): HTMLFormElement {
  const form = h('form', { class: 'params-form stack-tight', 'data-params-form': '' },
    ...Object.entries(schema).map(([key, field]) => paramField(key, field)),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-primary', type: 'submit' }, opts.submitLabel ?? 'Run'),
      opts.onCancel ? h('button', { class: 'btn', type: 'button', onclick: () => opts.onCancel?.() }, 'Cancel') : null)
  );
  form.addEventListener('submit', ev => { ev.preventDefault(); onSubmit(readValues(form, schema)); });
  return form;
}
