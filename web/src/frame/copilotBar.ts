// web/src/frame/copilotBar.ts -- the persistent co-pilot bar above the game canvas (G8.1).
//
// It replaces `frame/runBanner.ts`, which only existed while a run did. The bar is 42px of chrome
// in all five presented states, so the player can always see whether Claude is paired, whether
// anything is running, and how to stop it. It reads TWO sources: the run state from the tasks
// router and the pairing state from the frame singleton (plan ruling R10), and it turns both into
// words in exactly one place, `frame/runPresentation.ts` (ruling R22).
//
// It keeps the three side effects the banner owned -- the corner dot on the Automation strip
// button, the run toasts, and Escape as the player's panic key -- and the live-region contract
// SP4a and SP4b built around them (ruling R25): `#copilot-bar` is an atomic `role="status"`, so
// the clock, the countdown and the detail row are all `aria-hidden` and are written in place,
// never rebuilt, or a screen reader would re-read the whole bar once a second for the whole run.
//
// The detail row and the rule are SIBLINGS of the bar, not children: the bar is one fixed 42px
// row, and a second line inside an atomic live region is the thing the aria-hidden above exists
// to work around. `main.ts` hands all three nodes in.
import { h } from '../ui/el';
import { dot } from '../ui/parts';
import { presentRun, type CopilotState, type RunPresentation } from './runPresentation';
import type { PairingState } from './pairing';
import type { SessionState } from '../sessions/types';
import { IDLE_STATUS, type TasksApi } from '../tasks/api';
import type { RunState, RunStatus } from '../tasks/types';
import type { PanelId } from '../types';

export type NotifyKind = 'info' | 'error' | 'ok';

export interface CopilotBarDeps {
  /** `#copilot-bar`, the live region itself. */
  bar: HTMLElement;
  /** `#copilot-detail`, its sibling second row. */
  detail: HTMLElement;
  /** `.copilot-rule`, the 2px band under both. */
  rule: HTMLElement;
  /** The icon strip; an accessor because `rebuildStrip` replaces its children. */
  strip(): HTMLElement;
  /** Null until the first session builds the runtime, so the bar is safe to create at boot. */
  api(): TasksApi | null;
  pairing(): PairingState;
  session(): SessionState;
  openPanel(id: PanelId): void;
  /** The trace pop-out. Task 16 builds the window; until then the caller opens Automation. */
  openTrace(): void;
  notify(message: string, kind?: NotifyKind): void;
  now?(): number;
}

export interface CopilotBar {
  /** A new run status from the router. */
  update(status: RunStatus): void;
  /** Repaint from the sources the bar polls rather than subscribes to: pairing and the strip. */
  refresh(): void;
  dispose(): void;
}

/** Elapsed time and the auto-resume countdown are both second-resolution. */
const TICK_MS = 1000;
const TERMINAL = new Set<RunState>(['done', 'failed', 'stopped']);
/** The three presented states in which a run exists: the clock, the strip dot and Stop are theirs. */
const RUN_EXISTS = new Set<CopilotState>(['running', 'paused', 'stuck']);
/** How many run outcomes the bar remembers having toasted (see `announced`). */
const ANNOUNCE_MEMORY = 32;

function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(total / 60);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return mins >= 60 ? `${Math.floor(mins / 60)}:${pad(mins % 60)}:${pad(total % 60)}` : `${pad(mins)}:${pad(total % 60)}`;
}

/** Set text only when it really changed: a no-op write still churns the DOM and drops selections. */
function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

const sep = (): HTMLElement => h('span', { class: 'copilot-sep', 'aria-hidden': 'true' }, '·');

export function createCopilotBar(d: CopilotBarDeps): CopilotBar {
  const now = d.now ?? Date.now;
  let last: RunStatus | null = null;
  /**
   * When the bar first saw this run settled. `RunStatus` carries no such stamp, and ruling R4
   * needs one: a run that lasted ten seconds and then failed is already past
   * `startedAt + LINGER_MS`, so keying the linger off `startedAt` would give it no chrome at all.
   */
  let settledAt: number | null = null;
  /** Spec decision 12, carried from the banner: collapsible, and nothing persists it. */
  let collapsed = false;
  let bodyKey: string | null = null;
  let actionKey: string | null = null;
  /**
   * The *outcomes* already toasted, as `runId:state:reason`. The bar follows the active tab, so
   * coming back to a character whose run finished re-publishes that same terminal status. Capped
   * so a long session cannot grow it without end. Only outcomes go in: a run that goes stuck, is
   * resumed and goes stuck again is news every time.
   */
  const announced = new Set<string>();
  let ticker: ReturnType<typeof setInterval> | null = null;

  const barDot = dot('idle', { explicit: true, size: 9 });
  barDot.setAttribute('data-bar-dot', '');
  // Lit while a recovery is running. Aria-hidden like the dot, because it is a colour and a
  // tooltip, and neither is worth a re-read of this atomic live region once a second.
  const healthPip = h('span', { class: 'dot copilot-health', 'data-bar-health': '', 'aria-hidden': 'true', hidden: true });
  // The mock's one constant: the label reads `Claude` in all five states (map-design note S4).
  const label = h('span', { class: 'copilot-label' }, 'Claude');
  const body = h('span', { class: 'copilot-body' });
  // The two ticking spans live for the life of the bar and are hidden from the accessibility
  // tree, for the reason the module comment gives.
  const countdownEl = h('span', { class: 'copilot-countdown', 'data-bar-countdown': '', 'aria-hidden': 'true', hidden: true });
  const grow = h('span', { class: 'copilot-grow' });
  const escHint = h('span', { class: 'copilot-esc', 'data-bar-esc': '', hidden: true }, h('kbd', {}, 'Esc'), ' take control');
  const elapsedEl = h('span', { class: 'copilot-elapsed num', 'data-bar-elapsed': '', 'aria-hidden': 'true', hidden: true });
  const detailToggle = h('button', {
    type: 'button', class: 'copilot-detail-toggle', 'data-bar-detail-toggle': '',
    'aria-expanded': 'true', 'aria-label': 'The run detail line',
    onclick: () => { collapsed = !collapsed; paint(); }
  }, '▾');
  const actions = h('span', { class: 'copilot-actions' });
  d.bar.replaceChildren(barDot, healthPip, label, body, countdownEl, grow, escHint, elapsedEl, detailToggle, actions);

  // The second row, on its own node: what the run is DOING on the left, what it is EARNING on the
  // right. The rate span is the slot sprint 3's rate-derived line writes into, so such a line is
  // a text write into a node that already exists rather than a re-layout of the bar.
  const detailWhat = h('span', { class: 'copilot-detail-what', 'data-bar-detail': '', 'aria-hidden': 'true' });
  const detailRate = h('span', { class: 'copilot-detail-rate num', 'data-bar-rate': '', 'aria-hidden': 'true' });
  d.detail.replaceChildren(detailWhat, detailRate);

  function button(hook: string, text: string, cls: string, onclick: () => void, disabled = false): HTMLButtonElement {
    return h('button', { type: 'button', class: cls, [hook]: '', disabled, onclick }, text);
  }

  /** A control that drives the run. A rejected call is a toast, never an unhandled rejection. */
  function control(hook: string, text: string, cls: string, act: (api: TasksApi) => Promise<unknown>): HTMLButtonElement {
    return button(hook, text, cls, () => {
      const api = d.api();
      if (!api) return;
      void act(api).catch((err: unknown) => d.notify((err as Error).message, 'error'));
    });
  }

  /** The Automation strip button is registered by another plugin, so look it up fresh every time. */
  function paintStripDot(tone: RunPresentation['tone'] | null): void {
    let strip: HTMLElement | null = null;
    try { strip = d.strip(); } catch { strip = null; }
    const btn = strip?.querySelector<HTMLElement>('[data-panel="tasks"]') ?? null;
    if (!btn) return;
    const existing = btn.querySelector<HTMLElement>('.strip-dot');
    if (!tone) { existing?.remove(); return; }
    const el = existing ?? btn.appendChild(h('span', { class: 'strip-dot dot', 'aria-hidden': 'true' }));
    const cls = tone === 'accent' ? 'strip-dot dot dot-accent dot-pulse' : `strip-dot dot dot-${tone}`;
    if (el.className !== cls) el.className = cls;
  }

  /** The state body: the mock's five, each rebuilt only when its words change. */
  function bodyOf(p: RunPresentation, s: RunStatus): HTMLElement[] {
    if (p.state === 'running') {
      // The whole summary is the way into Automation, so it is a real button.
      const summary = button('data-bar-open', '', 'copilot-summary', () => d.openPanel('tasks'));
      const parts: HTMLElement[] = [];
      if (s.scriptName) parts.push(h('span', { class: 'copilot-script', 'data-bar-script': '' }, s.scriptName));
      if (s.task) parts.push(h('span', { class: 'copilot-task', 'data-bar-task': '' }, s.task));
      parts.push(h('span', { class: 'copilot-msg' }, p.headline));
      for (const [i, part] of parts.entries()) { if (i) summary.append(sep()); summary.append(part); }
      return [summary];
    }
    if (p.state === 'paused' || p.state === 'stuck') {
      return [
        h('span', { class: 'copilot-headline', 'data-bar-headline': '' }, p.headline),
        ...(p.detail === null ? [] : [h('span', { class: 'copilot-text', 'data-bar-reason': '' }, p.detail)])
      ];
    }
    return [h('span', { class: 'copilot-text', 'data-bar-headline': '' }, p.headline)];
  }

  /** The controls that fit the state. Ruling R5: not being online disables the primary, not Stop. */
  function actionsOf(p: RunPresentation): HTMLElement[] {
    const stop = control('data-bar-stop', 'Stop', p.state === 'stuck' ? 'btn btn-danger' : 'btn', api => api.stop('player'));
    if (p.state === 'running') return [control('data-bar-pause', 'Pause', 'btn', api => api.pause('player')), stop];
    if (p.state === 'paused') return [control('data-bar-resume', 'Resume now', 'btn', api => api.resume('player')), stop];
    if (p.state === 'stuck') return [button('data-bar-trace', 'Open trace', 'btn', () => d.openTrace()), stop];
    const unpaired = p.state === 'unpaired';
    return [button(
      'data-bar-primary', unpaired ? 'Pair Claude' : 'Run a script', 'btn btn-primary',
      () => d.openPanel(unpaired ? 'connect' : 'tasks'), p.blocked
    )];
  }

  /** What the run is working on. `RunStatus` carries no position, so the tile comes from the api. */
  function whatText(s: RunStatus): string {
    const out: string[] = [];
    if (s.target) out.push(`${s.target.name} (${Math.round(s.target.distance)} tiles)`);
    if (s.health) out.push(`recovering: ${s.health.condition}`);
    // A missing player is the ordinary pre-login state, not an error.
    const player = d.api()?.getState()?.player;
    if (player) out.push(`${player.worldX}, ${player.worldZ}`);
    return out.join(' · ');
  }

  const rateText = (s: RunStatus): string =>
    Object.entries(s.xpPerHour ?? {}).map(([skill, rate]) => `${rate.toLocaleString()} ${skill} xp/h`).join(' · ');

  /**
   * The second row and the health pip. Both are painted from the status, never from the clock, and
   * both belong to a RUN: the position comes from the client, which knows where the player is
   * standing whether or not a script is driving, and a row that said "3204, 3218" over an idle
   * bar would be describing the player rather than the run. The mock draws no second row in the
   * unpaired and standby states at all.
   */
  function paintDetail(s: RunStatus, runExists: boolean): void {
    const what = runExists ? whatText(s) : '';
    const rate = runExists ? rateText(s) : '';
    setText(detailWhat, what);
    setText(detailRate, rate);
    const empty = what === '' && rate === '';
    d.detail.hidden = empty || collapsed;
    // Nothing to expand is nothing to offer a control for, so the chevron goes with the line.
    detailToggle.hidden = empty;
    detailToggle.setAttribute('aria-expanded', String(!collapsed));
    detailToggle.title = collapsed ? 'Show what the run is doing' : 'Hide what the run is doing';
    healthPip.hidden = !runExists || s.health === null;
    if (s.health) healthPip.title = `Recovering: ${s.health.condition}`;
  }

  function paint(): void {
    const s = last ?? IDLE_STATUS;
    const p = presentRun({ status: s, pairing: d.pairing(), session: d.session(), now: now(), settledAt });
    d.bar.dataset.state = p.state;
    d.rule.dataset.state = p.state;
    const dotClass = dot(p.tone, { explicit: true, glow: p.tone !== 'idle', pulse: p.state === 'running' }).className;
    if (barDot.className !== dotClass) barDot.className = dotClass;
    const bodyNext = `${p.state}|${s.scriptName ?? ''}|${s.task ?? ''}|${p.headline}|${p.detail ?? ''}`;
    if (bodyNext !== bodyKey) { bodyKey = bodyNext; body.replaceChildren(...bodyOf(p, s)); }
    const actionNext = `${p.state}|${String(p.blocked)}`;
    if (actionNext !== actionKey) { actionKey = actionNext; actions.replaceChildren(...actionsOf(p)); }
    paintDetail(s, RUN_EXISTS.has(p.state));
    paintStripDot(RUN_EXISTS.has(p.state) ? p.tone : null);
    if (p.resumeIn !== null) setText(countdownEl, `resumes in ${p.resumeIn}s`);
    countdownEl.hidden = p.resumeIn === null;
    setText(elapsedEl, mmss(s.startedAt === null ? 0 : now() - s.startedAt));
    elapsedEl.hidden = !RUN_EXISTS.has(p.state);
    escHint.hidden = p.state !== 'running';
  }

  function announce(s: RunStatus): void {
    if (s.state === 'paused' && s.reason === 'stuck') { d.notify(`Stuck on ${s.task ?? 'the current task'}. Open Automation to see why.`, 'error'); return; }
    if (s.reason === 'hard-stop') { d.notify('Run stopped: hp too low', 'error'); return; }
    const name = s.scriptName ?? 'The script';
    if (s.state === 'done') d.notify(`${name} finished`, 'ok');
    else if (s.state === 'stopped') d.notify(`${name} stopped`, 'ok');
    else if (s.state === 'failed') d.notify(`${name} failed`, 'error');
  }

  function onKey(e: KeyboardEvent): void {
    // Escape is the panic key: it only ever pauses, and only while the script is actually moving.
    // Ruling R30: no surface added by this plan calls preventDefault on it.
    if (e.key !== 'Escape' || e.defaultPrevented || last?.state !== 'running') return;
    void d.api()?.pause('player').catch(() => {});
  }
  document.addEventListener('keydown', onKey);
  // One interval for the whole bar. Unlike the banner's, it runs for the life of the bar: the bar
  // is never hidden, and the session lifecycle it reads for ruling R5 has no subscription of its
  // own, so this tick is also what notices a character coming online.
  ticker = setInterval(paint, TICK_MS);
  paint();

  return {
    update(s) {
      const changed = last === null || last.state !== s.state || last.reason !== s.reason;
      last = s;
      if (!TERMINAL.has(s.state)) settledAt = null;
      else if (changed || settledAt === null) settledAt = now();
      if (changed) {
        const key = `${s.runId ?? ''}:${s.state}:${s.reason ?? ''}`;
        const once = TERMINAL.has(s.state) || s.reason === 'hard-stop';
        if (!once) announce(s);
        else if (!announced.has(key)) {
          announced.add(key);
          const [oldest] = announced;
          if (announced.size > ANNOUNCE_MEMORY && oldest !== undefined) announced.delete(oldest);
          announce(s);
        }
      }
      paint();
    },
    refresh: paint,
    dispose() {
      document.removeEventListener('keydown', onKey);
      if (ticker !== null) { clearInterval(ticker); ticker = null; }
      paintStripDot(null);
      last = null;
      settledAt = null;
      bodyKey = null;
      actionKey = null;
      announced.clear();
      collapsed = false;
      d.bar.replaceChildren();
      d.bar.removeAttribute('data-state');
      d.detail.replaceChildren();
      d.detail.hidden = true;
      d.rule.setAttribute('data-state', 'idle');
    }
  };
}
