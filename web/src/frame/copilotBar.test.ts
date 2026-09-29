// The co-pilot bar's five states, its live-region contract (ruling R25) and the three side effects
// it inherited from the run banner: the strip dot, the toasts and the Escape panic key. The SP4b
// detail row, its toggle and the health pip are next door in copilotBar.detail.test.ts.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createCopilotBar, type CopilotBar } from './copilotBar';
import { fakeApi } from '../plugins/builtin/tasks.harness';
import { icon } from '../ui/icon';
import type { PairingState } from './pairing';
import type { SessionState } from '../sessions/types';
import type { RunStatus } from '../tasks/types';

// The Automation button holds the drawn glyph the shipped strip holds from Task 9, not a text one:
// the run dot is appended BESIDE that child, and a fixture that is a bare text node would let a
// `replaceChildren` regression in `paintStripDot` pass unnoticed.
const SHELL = `<div id="wrap">
  <div id="copilot-bar" role="status"></div>
  <div id="copilot-detail" hidden></div>
  <div class="copilot-rule" data-state="idle"></div>
  <nav id="strip"><button class="strip-btn" data-panel="tasks">${icon('automation').outerHTML}</button></nav>
</div>`;

let clock = 100_000;
let pairing: PairingState = 'paired-live';
let session: SessionState = 'online';
let live: CopilotBar | null = null;

function mount(over: { api?: Partial<ReturnType<typeof fakeApi>> } = {}) {
  document.body.innerHTML = SHELL;
  clock = 100_000;
  pairing = 'paired-live';
  session = 'online';
  const spies = { pause: vi.fn(async () => {}), resume: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
  const api = fakeApi(vi.fn, { ...spies, ...over.api });
  const notify = vi.fn();
  const openPanel = vi.fn();
  const openTrace = vi.fn();
  // A spy rather than a closure read, so a test can prove the bar STOPPED asking: an interval the
  // teardown leaked paints into detached nodes, which no assertion about the DOM can see.
  const pairingFn = vi.fn(() => pairing);
  const root = document.getElementById('copilot-bar')!;
  const rule = document.querySelector<HTMLElement>('.copilot-rule')!;
  const bar = createCopilotBar({
    bar: root, detail: document.getElementById('copilot-detail')!, rule,
    strip: () => document.getElementById('strip')!,
    api: () => api, pairing: pairingFn, session: () => session,
    openPanel, openTrace, notify, now: () => clock
  });
  live = bar;
  return { bar, root, rule, api: spies, notify, openPanel, openTrace, pairingFn, strip: document.getElementById('strip')! };
}

afterEach(() => { live?.dispose(); live = null; });

const status = (o: Partial<RunStatus> = {}): RunStatus => ({
  state: 'idle', reason: null, runId: 'r', scriptId: 's', scriptName: 'Chop and drop', task: 'Chop tree',
  statusLine: '', attempts: 1, startedAt: null, attached: false, resumeAtMs: null,
  target: null, health: null, xpPerHour: {}, ...o
});
const running = (o: Partial<RunStatus> = {}): RunStatus => status({ state: 'running', startedAt: clock, ...o });

describe('the co-pilot bar', () => {
  test('is a polite atomic status region, and the ticking parts are hidden from it', () => {
    const { root } = mount();
    expect(root.getAttribute('role')).toBe('status');
    expect(root.querySelector('[data-bar-elapsed]')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('[data-bar-countdown]')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('mutates the elapsed node in place, so a tick does not re-announce the bar', () => {
    const { bar, root } = mount();
    bar.update(running({ startedAt: 100_000 }));
    const first = root.querySelector('[data-bar-elapsed]');
    clock += 1000;
    bar.update(running({ startedAt: 100_000 }));
    // Mutation target: rebuilding the bar on every tick replaces this node and fails here.
    expect(root.querySelector('[data-bar-elapsed]')).toBe(first);
    expect(first!.textContent).toBe('00:01');
  });

  // The elapsed node above is a direct child of the bar and is never inside the subtree `paint`
  // rebuilds, so it cannot see the thing ruling R25 actually turns on: the `bodyKey` guard, which
  // is what stops the one-second ticker from replacing the CONTENTS of an atomic `role="status"`
  // and making a screen reader re-read the whole bar once a second for the whole run.
  test('writes the body in place across a tick, so the live region is not rebuilt', () => {
    const { bar, root } = mount();
    bar.update(running({ statusLine: 'chopping the nearest tree' }));
    const summary = root.querySelector('[data-bar-open]');
    expect(summary).not.toBeNull();
    clock += 1000;
    bar.refresh();
    // Mutation target: dropping the `bodyKey` guard rebuilds this node on every tick.
    expect(root.querySelector('[data-bar-open]')).toBe(summary);
    bar.update(status({ state: 'paused', reason: 'stuck', task: 'Chop tree', startedAt: 100_000 }));
    const headline = root.querySelector('[data-bar-headline]');
    expect(headline!.textContent).toBe('stuck on Chop tree');
    clock += 1000;
    bar.refresh();
    expect(root.querySelector('[data-bar-headline]')).toBe(headline);
  });

  test('renders all five states with the mock copy', () => {
    const { bar, root } = mount();
    bar.update(status({ state: 'idle' }));
    pairing = 'unpaired';
    bar.refresh();
    expect(root.textContent).toContain('not paired — Claude can play this character alongside you');
    expect(root.querySelector('button.btn-primary')?.textContent).toBe('Pair Claude');
    pairing = 'paired-live';
    bar.refresh();
    expect(root.textContent).toContain('paired · standing by');
    expect(root.querySelector('button.btn-primary')?.textContent).toBe('Run a script');
    bar.update(running({ scriptName: 'Chop and drop', task: 'Chop tree', statusLine: 'chopping the nearest tree · 41 logs' }));
    expect(root.textContent).toContain('Chop and drop');
    expect(root.textContent).toContain('chopping the nearest tree · 41 logs');
    expect(root.querySelector('kbd')?.textContent).toBe('Esc');
    expect([...root.querySelectorAll('.btn')].map(b => b.textContent)).toEqual(['Pause', 'Stop']);
    bar.update(status({ state: 'paused', reason: 'player', resumeAtMs: 115_000, startedAt: 100_000 }));
    expect(root.textContent).toContain('paused — you took control');
    expect(root.textContent).toContain('resumes in 15s');
    bar.update(status({ state: 'paused', reason: 'stuck', task: 'Chop tree', startedAt: 100_000 }));
    expect(root.textContent).toContain('stuck on Chop tree');
    expect([...root.querySelectorAll('.btn')].map(b => b.textContent)).toEqual(['Open trace', 'Stop']);
    expect(root.querySelector('.btn-danger')?.textContent).toBe('Stop');
  });

  test('the clock and the Esc hint show in the states the mock draws them in', () => {
    const { bar, root } = mount();
    const elapsed = root.querySelector<HTMLElement>('[data-bar-elapsed]')!;
    const esc = root.querySelector<HTMLElement>('[data-bar-esc]')!;
    expect(elapsed.hidden).toBe(true);
    expect(esc.hidden).toBe(true);
    bar.update(running({ startedAt: 100_000 - 125_000 }));
    expect(elapsed.hidden).toBe(false);
    expect(elapsed.textContent).toBe('02:05');
    expect(esc.hidden).toBe(false);
    // Note S5: the mock shows the clock in paused and stuck too, where README lists it only under
    // running. The Esc hint is the running state's alone.
    bar.update(status({ state: 'paused', reason: 'player', startedAt: 100_000 - 125_000 }));
    expect(elapsed.hidden).toBe(false);
    expect(esc.hidden).toBe(true);
    bar.update(status({ state: 'done' }));
    expect(elapsed.hidden).toBe(true);
  });

  test('animates the rule only while running, on the sibling node it was handed', () => {
    const { bar, root, rule } = mount();
    bar.update(running({}));
    expect(rule.getAttribute('data-state')).toBe('running');
    bar.update(status({ state: 'paused', reason: 'stuck' }));
    expect(rule.getAttribute('data-state')).toBe('stuck');
    // Mutation target: `root.querySelector('.copilot-rule')` finds nothing, because the rule is
    // a sibling of the status region and not inside it.
    expect(root.querySelector('.copilot-rule')).toBeNull();
    expect(root.getAttribute('data-state')).toBe('stuck');
  });

  test("draws the unpaired dot at the mock's lighter idle grey", () => {
    const { bar, root } = mount();
    pairing = 'unpaired';
    bar.update(status({ state: 'idle' }));
    // map-design 3.3: the unpaired bar dot is #666 (--dot-idle), not the family default
    // --text-faint. `dot('idle', { explicit: true })` is what emits it.
    expect(root.querySelector('[data-bar-dot]')?.className).toContain('dot-idle');
    bar.update(running({}));
    expect(root.querySelector('[data-bar-dot]')?.className).toContain('dot-accent');
    expect(root.querySelector('[data-bar-dot]')?.className).toContain('dot-pulse');
  });

  test('paints the strip dot onto the Automation button and clears it when the run settles', () => {
    const { bar, strip } = mount();
    bar.update(running({}));
    expect(strip.querySelector('[data-panel="tasks"] .strip-dot')!.className).toContain('dot-accent');
    bar.update(status({ state: 'done' }));
    expect(strip.querySelector('[data-panel="tasks"] .strip-dot')).toBeNull();
  });

  test('a missing Automation strip button is not an error', () => {
    const { bar, strip } = mount();
    strip.replaceChildren();
    bar.update(running({}));
    expect(strip.querySelector('.strip-dot')).toBe(null);
  });

  test('Escape pauses a running run, and only a running run', () => {
    const { bar, api } = mount();
    bar.update(running({}));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(api.pause).toHaveBeenCalledWith('player');
    api.pause.mockClear();
    bar.update(status({ state: 'paused', reason: 'player' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(api.pause).not.toHaveBeenCalled();
  });

  test('announces a terminal outcome once, however often the router republishes it', () => {
    const { bar, notify } = mount();
    const done = status({ state: 'done', runId: 'r1' });
    bar.update(done);
    bar.update(done);
    bar.update(done);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('Chop and drop finished', 'ok');
    // The bar follows the active tab, so a switch to another character and back re-publishes the
    // same outcome with a DIFFERENT status in between. Two guards stand between that and a second
    // toast, and only this interleaving separates them: the "did anything change" test lets this
    // one through, and the remembered outcome is what stops it.
    bar.update(status({ state: 'running', runId: 'other' }));
    bar.update(done);
    expect(notify.mock.calls.filter(c => c[0] === 'Chop and drop finished')).toHaveLength(1);
    // A pause the run recovers from and falls back into is news every time: only an outcome is
    // remembered, never a state the run can leave and re-enter.
    bar.update(status({ state: 'paused', reason: 'stuck', runId: 'r2' }));
    bar.update(status({ state: 'running', runId: 'r2' }));
    bar.update(status({ state: 'paused', reason: 'stuck', runId: 'r2' }));
    expect(notify.mock.calls.filter(c => String(c[0]).startsWith('Stuck on'))).toHaveLength(2);
    // A stuck status is not an OUTCOME, so the remembered set above does not cover it at all: the
    // "did anything change" test is the only thing between the tab switch that re-publishes one
    // unchanged and a second identical toast. Mutation target for that guard alone.
    bar.update(status({ state: 'paused', reason: 'stuck', runId: 'r2' }));
    expect(notify.mock.calls.filter(c => String(c[0]).startsWith('Stuck on'))).toHaveLength(2);
  });

  test('the three run controls call the api, and the two idle ones open a panel', () => {
    const { bar, root, api, openPanel, openTrace } = mount();
    bar.update(running({}));
    root.querySelector<HTMLButtonElement>('[data-bar-pause]')!.click();
    expect(api.pause).toHaveBeenCalledWith('player');
    root.querySelector<HTMLButtonElement>('[data-bar-stop]')!.click();
    expect(api.stop).toHaveBeenCalledWith('player');
    bar.update(status({ state: 'paused', reason: 'player' }));
    root.querySelector<HTMLButtonElement>('[data-bar-resume]')!.click();
    expect(api.resume).toHaveBeenCalledWith('player');
    bar.update(status({ state: 'paused', reason: 'stuck' }));
    root.querySelector<HTMLButtonElement>('[data-bar-trace]')!.click();
    expect(openTrace).toHaveBeenCalledTimes(1);
    bar.update(status({ state: 'idle' }));
    root.querySelector<HTMLButtonElement>('[data-bar-primary]')!.click();
    expect(openPanel).toHaveBeenCalledWith('tasks');
    pairing = 'unpaired';
    bar.refresh();
    root.querySelector<HTMLButtonElement>('[data-bar-primary]')!.click();
    expect(openPanel).toHaveBeenCalledWith('connect');
  });

  test('a running summary is the way into Automation', () => {
    const { bar, root, openPanel } = mount();
    bar.update(running({}));
    root.querySelector<HTMLButtonElement>('[data-bar-open]')!.click();
    expect(openPanel).toHaveBeenCalledWith('tasks');
  });

  // Ruling R5: a character on the title screen must not be offered "Run a script".
  test('a character that is not online gets the moved copy and a disabled primary', () => {
    const { bar, root } = mount();
    session = 'title';
    bar.update(status({ state: 'idle' }));
    expect(root.textContent).toContain('press Login to play');
    expect(root.querySelector<HTMLButtonElement>('[data-bar-primary]')!.disabled).toBe(true);
    session = 'online';
    bar.refresh();
    expect(root.querySelector<HTMLButtonElement>('[data-bar-primary]')!.disabled).toBe(false);
  });

  // The session lifecycle has no subscription of its own, so the bar's own tick is what notices a
  // character coming online. Mutation target: drop the interval and the bar sits on stale copy.
  test('the tick notices a session state change with no status behind it', () => {
    vi.useFakeTimers();
    try {
      const { bar, root } = mount();
      session = 'connecting';
      bar.update(status({ state: 'idle' }));
      expect(root.textContent).toContain('connecting…');
      session = 'online';
      vi.advanceTimersByTime(1000);
      expect(root.textContent).toContain('paired · standing by');
    } finally {
      vi.useRealTimers();
    }
  });

  // Entry 4's whole-branch review proved the case below vacuous on its "no key handler" clause:
  // `dispose()` sets `last = null` and `onKey` returns early unless `last?.state === 'running'`, so
  // a listener left bound is INERT, the post-dispose Escape proves nothing, and deleting
  // `document.removeEventListener('keydown', onKey)` left all sixteen cases green. Task 16 met the
  // identical hole in the trace window and ruled the same answer there: the only honest assertion
  // about a handler that cannot be observed through behaviour is that the function the module
  // added is the function it removed. Every shell page mounts one bar for its life, so a leak here
  // is a retained closure per reload rather than a wrong pixel.
  test('dispose gives the document keydown back, rather than leaving it bound and inert', () => {
    const added = vi.spyOn(document, 'addEventListener');
    const removed = vi.spyOn(document, 'removeEventListener');
    const { bar } = mount();
    const bound = added.mock.calls.find(c => c[0] === 'keydown')?.[1];
    expect(bound).toBeDefined();
    bar.dispose();
    live = null;
    expect(removed.mock.calls.some(c => c[0] === 'keydown' && c[1] === bound)).toBe(true);
    added.mockRestore();
    removed.mockRestore();
  });

  test('fires nothing after dispose: no timer, no key handler, no strip paint', () => {
    vi.useFakeTimers();
    try {
      const { bar, api, strip, root, pairingFn } = mount();
      bar.update(running({}));
      bar.dispose();
      live = null;
      const paints = pairingFn.mock.calls.length;
      clock += 5000;
      vi.advanceTimersByTime(5000);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(api.pause).not.toHaveBeenCalled();
      expect(strip.querySelector('.strip-dot')).toBeNull();
      expect(root.children).toHaveLength(0);
      // The ticker, proved by what it would have READ. A leaked interval repaints into the nodes
      // dispose detached, so nothing in the document changes and only this counts it.
      expect(pairingFn.mock.calls.length).toBe(paints);
    } finally {
      vi.useRealTimers();
    }
  });
});
