// web/src/frame/overlays.test.ts -- the canvas overlays: two corner pills, the status line, the
// xp drop, and the wiring that feeds all three.
//
// `frame/overlays.ts` was the one module in this directory with no test at all. Everything here is
// a class or a text claim read back off the DOM: jsdom lays nothing out, so where a pill SITS is a
// pixel claim and belongs in a Playwright spec, and what it SAYS belongs here.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DROP_LIFETIME_MS, MAX_DROPS, createOverlays, isRunning, wireOverlays } from './overlays';
import type { EventBus, ShellEvent } from './events';
import type { PairingState, PairingStore } from './pairing';
import { IDLE_STATUS } from '../tasks/api';
import type { RunStatus } from '../tasks/types';

const deps = { skillColour: (skill: string) => (skill === 'Woodcutting' ? '#2e7d32' : '#ff981f') };

let root: HTMLElement;
beforeEach(() => { root = document.createElement('div'); document.body.replaceChildren(root); });
afterEach(() => { vi.useRealTimers(); });

const pairing = (): HTMLElement => root.querySelector('.ov-pairing') as HTMLElement;

describe('pairing pill', () => {
  test('says not paired when unpaired, whatever the run is doing (ruling R6)', () => {
    const ov = createOverlays(root, deps);
    ov.setPairing('unpaired', true);
    expect(pairing().textContent).toBe('● not paired');
    expect(pairing().className).toContain('ov-pill-neutral');
  });

  test('says claude driving only when paired AND running', () => {
    const ov = createOverlays(root, deps);
    ov.setPairing('paired-live', true);
    expect(pairing().textContent).toBe('● claude driving');
    expect(pairing().className).toContain('ov-pill-accent');
    ov.setPairing('paired-live', false);
    expect(pairing().textContent).toBe('● claude paired');
    expect(pairing().className).toContain('ov-pill-ok');
  });

  test('treats a stale pairing as paired: the session exists, it is just quiet', () => {
    const ov = createOverlays(root, deps);
    ov.setPairing('paired-stale', false);
    expect(pairing().textContent).toBe('● claude paired');
  });

  // The pill is built unpaired rather than blank, because an overlay that has never been told
  // anything is an overlay on an account with no Claude session on it.
  test('starts on the unpaired reading before anything has told it otherwise', () => {
    createOverlays(root, deps);
    expect(pairing().textContent).toBe('● not paired');
    expect(pairing().className).toContain('ov-pill-corner');
  });

  // One tone at a time: the class is rewritten, not accumulated, or a pill that was ever accent
  // keeps the accent border for the rest of the session.
  test('drops the tone it was wearing when the state changes', () => {
    const ov = createOverlays(root, deps);
    ov.setPairing('paired-live', true);
    ov.setPairing('unpaired', false);
    expect(pairing().className).not.toContain('ov-pill-accent');
    expect(pairing().className).not.toContain('ov-pill-ok');
  });
});

describe('the xp and status pills', () => {
  test('the xp line hides on null and shows what it is given', () => {
    const ov = createOverlays(root, deps);
    const xp = root.querySelector('.ov-xp') as HTMLElement;
    expect(xp.classList.contains('hidden')).toBe(true);
    ov.setXpLine('Woodcutting · 24,180 xp/h');
    expect(xp.textContent).toBe('Woodcutting · 24,180 xp/h');
    expect(xp.classList.contains('hidden')).toBe(false);
    ov.setXpLine(null);
    expect(xp.classList.contains('hidden')).toBe(true);
  });

  // `setStatus` keeps the three tones both callers already pass. The pre-v2 module spelled them
  // `.ok` / `.muted` / `.error` on its own element; they are pill tones now, and `muted` is the
  // family's neutral.
  test('a status maps its three tones onto the pill family and hides when it says nothing', () => {
    const ov = createOverlays(root, deps);
    const status = root.querySelector('.ov-status') as HTMLElement;
    expect(status.classList.contains('hidden')).toBe(true);
    ov.setStatus('connecting…', 'muted');
    expect(status.textContent).toBe('connecting…');
    expect(status.className).toContain('ov-pill-neutral');
    expect(status.classList.contains('hidden')).toBe(false);
    ov.setStatus('session failed', 'error');
    expect(status.className).toContain('ov-pill-error');
    expect(status.className).not.toContain('ov-pill-neutral');
    ov.setStatus('paired', 'ok');
    expect(status.className).toContain('ov-pill-ok');
    ov.setStatus('', 'muted');
    expect(status.classList.contains('hidden')).toBe(true);
  });

  test('setHidden hides the whole layer and nothing else', () => {
    const ov = createOverlays(root, deps);
    ov.setHidden(true);
    expect(root.classList.contains('hidden')).toBe(true);
    ov.setHidden(false);
    expect(root.classList.contains('hidden')).toBe(false);
  });
});

describe('dropXp', () => {
  test('mounts a drop with the skill colour and an outlined +N', () => {
    const ov = createOverlays(root, deps);
    ov.dropXp('Woodcutting', 25);
    const drop = root.querySelector('.xp-drop') as HTMLElement;
    expect(drop.querySelector('.xp-drop-value')?.textContent).toBe('+25');
    expect((drop.querySelector('.xp-drop-chip') as HTMLElement).style.background).not.toBe('');
    expect((drop.querySelector('.xp-drop-chip') as HTMLElement).style.background).toBe('rgb(46, 125, 50)');
  });

  test('a skill the colour map does not know still gets a chip', () => {
    const ov = createOverlays(root, deps);
    ov.dropXp('Fletching', 4);
    expect((root.querySelector('.xp-drop-chip') as HTMLElement).style.background).toBe('rgb(255, 152, 31)');
  });

  test('removes the drop when its animation ends, and leaves nothing behind', () => {
    const ov = createOverlays(root, deps);
    ov.dropXp('Woodcutting', 25);
    root.querySelector('.xp-drop')!.dispatchEvent(new Event('animationend'));
    expect(root.querySelector('.xp-drop')).toBeNull();
  });

  // jsdom fires no real `animationend`, and neither does a browser tab that was backgrounded for
  // the whole 2.6s. The timer is the fallback, and whichever fires first clears the other.
  test('removes the drop on the fallback timer when no animationend ever arrives', () => {
    vi.useFakeTimers();
    const ov = createOverlays(root, deps);
    ov.dropXp('Woodcutting', 25);
    vi.advanceTimersByTime(DROP_LIFETIME_MS - 1);
    expect(root.querySelector('.xp-drop')).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(root.querySelector('.xp-drop')).toBeNull();
  });

  // The drift guard for that fallback. `DROP_LIFETIME_MS` is a hand-copied second spelling of the
  // `.xp-drop` animation duration, and the two failure directions are both silent: lengthen the
  // CSS and the timer tears every drop down mid-flight, shorten it and the timer lingers. Same
  // shape as `stats/skills.test.ts` reading its three chip colours back out of `tokens.css` (R3).
  // Mutation target: changing either number alone fails here and nowhere else in this file.
  test('times the fallback off the CSS animation and not off a number of its own', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../styles/overlay.css'), 'utf8');
    const seconds = /\.xp-drop\s*\{[^}]*animation:\s*floatUp\s+([0-9.]+)s/.exec(css)?.[1];
    expect(seconds).toBeDefined();
    expect(Math.round(Number(seconds) * 1000)).toBe(DROP_LIFETIME_MS);
  });

  test('an animationend cancels the fallback timer, so nothing runs against a gone node', () => {
    vi.useFakeTimers();
    const ov = createOverlays(root, deps);
    ov.dropXp('Woodcutting', 25);
    root.querySelector('.xp-drop')!.dispatchEvent(new Event('animationend'));
    expect(vi.getTimerCount()).toBe(0);
  });

  test('caps concurrent drops so a burst cannot fill the canvas', () => {
    const ov = createOverlays(root, deps);
    for (let i = 0; i < 10; i++) ov.dropXp('Woodcutting', 25);
    expect(root.querySelectorAll('.xp-drop').length).toBeLessThanOrEqual(MAX_DROPS);
  });

  // The cap drops the OLDEST, so a burst shows the newest four and not the first four.
  test('the survivors of a burst are the newest drops', () => {
    const ov = createOverlays(root, deps);
    for (let i = 1; i <= 6; i++) ov.dropXp('Woodcutting', i);
    expect([...root.querySelectorAll('.xp-drop-value')].map(n => n.textContent)).toEqual(['+3', '+4', '+5', '+6']);
  });

  test('fires nothing after dispose', () => {
    const ov = createOverlays(root, deps);
    ov.dispose();
    ov.dropXp('Woodcutting', 25);
    expect(root.querySelector('.xp-drop')).toBeNull();
  });

  test('dispose clears the drops that were still floating, and their timers with them', () => {
    vi.useFakeTimers();
    const ov = createOverlays(root, deps);
    ov.dropXp('Woodcutting', 25);
    ov.dropXp('Woodcutting', 30);
    ov.dispose();
    expect(root.querySelector('.xp-drop')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  // Every one of the five writers, not four of them: a fence with a gap in it reads as total and
  // is not, and `setHidden` is the one that touches the layer itself rather than a pill inside it.
  test('the pills stop moving after dispose too, and so does the layer', () => {
    const ov = createOverlays(root, deps);
    ov.dispose();
    ov.setPairing('paired-live', true);
    ov.setStatus('connecting…', 'muted');
    ov.setXpLine('Woodcutting · 1 xp/h');
    ov.setHidden(true);
    expect(pairing().textContent).toBe('● not paired');
    expect((root.querySelector('.ov-status') as HTMLElement).textContent).toBe('');
    expect((root.querySelector('.ov-xp') as HTMLElement).classList.contains('hidden')).toBe(true);
    expect(root.classList.contains('hidden')).toBe(false);
  });
});

// --- the wiring ------------------------------------------------------------------------------

function fakeBus(): EventBus & { push(e: Partial<ShellEvent>): void } {
  const subs = new Set<(e: ShellEvent) => void>();
  const bus = {
    emit: () => { throw new Error('the overlay wiring never emits'); },
    all: () => [],
    subscribe(fn: (e: ShellEvent) => void) { subs.add(fn); return () => { subs.delete(fn); }; },
    dispose: () => { subs.clear(); },
    push(e: Partial<ShellEvent>) {
      const full: ShellEvent = {
        seq: 1, at: 0, characterId: 'a', characterName: 'alpha', type: 'xp',
        skill: 'Woodcutting', text: '', tone: 'default', amount: 25, ...e
      };
      for (const fn of [...subs]) fn(full);
    }
  };
  return bus;
}

function fakePairing(): PairingStore & { push(s: PairingState): void } {
  const subs = new Set<(s: PairingState) => void>();
  let state: PairingState = 'unpaired';
  return {
    state: () => state,
    sessions: () => [],
    subscribe(fn: (s: PairingState) => void) { subs.add(fn); return () => { subs.delete(fn); }; },
    start: () => { throw new Error('the overlay wiring never starts the pairing store'); },
    stop: () => { throw new Error('the overlay wiring never stops the pairing store'); },
    push(s: PairingState) { state = s; for (const fn of [...subs]) fn(s); }
  };
}

const status = (over: Partial<RunStatus> = {}): RunStatus => ({ ...IDLE_STATUS, ...over });

function harness(initial: { pairing?: PairingState; status?: RunStatus } = {}) {
  const bus = fakeBus();
  const pair = fakePairing();
  if (initial.pairing) pair.push(initial.pairing);
  const statusSubs = new Set<(s: RunStatus) => void>();
  let active: string | null = 'a';
  const ov = createOverlays(root, deps);
  const off = wireOverlays(ov, {
    pairing: pair,
    bus,
    status: () => initial.status ?? status(),
    onStatus(cb) { statusSubs.add(cb); return () => { statusSubs.delete(cb); }; },
    activeId: () => active
  });
  return { bus, pair, ov, off, statusSubs, setActive: (id: string | null) => { active = id; },
    pushStatus: (s: RunStatus) => { for (const fn of [...statusSubs]) fn(s); } };
}

describe('wireOverlays', () => {
  test('paints the pairing pill from the store and the run, not from a literal at login', () => {
    const h = harness();
    expect(pairing().textContent).toBe('● not paired');
    h.pair.push('paired-live');
    expect(pairing().textContent).toBe('● claude paired');
    h.pushStatus(status({ state: 'running' }));
    expect(pairing().textContent).toBe('● claude driving');
    h.pushStatus(status({ state: 'stopped' }));
    expect(pairing().textContent).toBe('● claude paired');
    h.pair.push('unpaired');
    expect(pairing().textContent).toBe('● not paired');
  });

  // A tab opened onto a run that was already going, on an account that was already paired: both
  // truths are READ at wiring time, not waited for. Nothing fires an event on a page load.
  test('reads both truths once at wiring time rather than waiting for the first event', () => {
    harness({ pairing: 'paired-live', status: status({ state: 'running' }) });
    expect(pairing().textContent).toBe('● claude driving');
  });

  // R6: a player-started run on an unpaired account is a running run, and the pill still says the
  // truth about the pairing.
  test('a live run on an unpaired account never claims claude is driving', () => {
    const h = harness();
    h.pushStatus(status({ state: 'running' }));
    expect(pairing().textContent).toBe('● not paired');
  });

  test('drops xp for the active character only, reading amount rather than parsing text', () => {
    const h = harness();
    h.bus.push({ characterId: 'a', skill: 'Woodcutting', amount: 25, text: 'Woodcutting +25 xp' });
    expect(root.querySelector('.xp-drop-value')?.textContent).toBe('+25');
    h.bus.push({ characterId: 'b', skill: 'Mining', amount: 90 });
    expect([...root.querySelectorAll('.xp-drop-value')].map(n => n.textContent)).toEqual(['+25']);
  });

  test('draws nothing for an event that is not an xp event', () => {
    const h = harness();
    h.bus.push({ type: 'loot', amount: 3, skill: null });
    h.bus.push({ type: 'level', amount: 42 });
    expect(root.querySelector('.xp-drop')).toBeNull();
  });

  test('unsubscribes everything it subscribed', () => {
    const h = harness();
    h.off();
    h.pair.push('paired-live');
    h.bus.push({ characterId: 'a', amount: 25 });
    h.pushStatus(status({ state: 'running' }));
    expect(pairing().textContent).toBe('● not paired');
    expect(root.querySelector('.xp-drop')).toBeNull();
  });

  test('isRunning covers the whole of a live run and nothing settled', () => {
    expect(isRunning(status({ state: 'starting' }))).toBe(true);
    expect(isRunning(status({ state: 'running' }))).toBe(true);
    expect(isRunning(status({ state: 'paused' }))).toBe(false);
    expect(isRunning(status({ state: 'idle' }))).toBe(false);
    expect(isRunning(status({ state: 'done' }))).toBe(false);
  });
});
