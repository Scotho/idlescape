// web/src/plugins/builtin/statusHud.test.ts
import { describe, expect, test, vi } from 'vitest';
import { boostSummary, createStatusHudPlugin } from './statusHud';
import type { ClientState, ClientHooks } from '../../clientTypes';
import type { PluginContext } from '../types';

function state(over: Partial<ClientState> = {}): ClientState {
  return {
    loggedIn: true, gameName: 'bob', skills: { xp: [], level: [] }, inventory: [], fps: 50, rttMs: null,
    hp: { current: 30, max: 40 }, prayer: { current: 10, max: 43 }, energy: 55,
    boosts: new Array(25).fill(0), position: { x: 3222, z: 3218, level: 0 }, activeTab: 3, sceneReady: true, ...over
  };
}

function ctx(getState: () => ClientState, showBoosts = true): PluginContext {
  const client = { getState } as unknown as ClientHooks;
  return {
    client: () => client,
    settings: { get: ((k: string) => (k === 'showBoosts' ? showBoosts : undefined)) as PluginContext['settings']['get'], set: vi.fn(), subscribe: () => () => {} },
    storage: { get: () => null, set: () => {} },
    notify: vi.fn(), openPanel: vi.fn(), user: () => null
  };
}

describe('status-hud plugin', () => {
  test('manifest: shell, off by default, has showBoosts setting', () => {
    const p = createStatusHudPlugin();
    expect(p.manifest.id).toBe('status-hud');
    expect(p.manifest.tier).toBe('shell');
    expect(p.manifest.defaultEnabled).toBeUndefined();
    expect(p.manifest.settings?.showBoosts).toBeTruthy();
  });

  test('overlay renders hp/prayer/energy values after enable', () => {
    vi.useFakeTimers();
    const p = createStatusHudPlugin({ intervalMs: 100 });
    const c = ctx(() => state());
    const el = p.overlay!(c);
    p.onEnable!(c);
    vi.advanceTimersByTime(100);
    expect(el.textContent).toContain('30');
    expect(el.textContent).toContain('40');
    expect(el.textContent).toContain('55');
    p.onDisable!();
    vi.useRealTimers();
  });

  test('boost summary lists boosted and drained skills when showBoosts is on', () => {
    vi.useFakeTimers();
    const boosts = new Array(25).fill(0); boosts[2] = 4; boosts[0] = -2; // Strength +4, Attack -2
    const p = createStatusHudPlugin({ intervalMs: 100 });
    const c = ctx(() => state({ boosts }), true);
    const el = p.overlay!(c);
    p.onEnable!(c);
    vi.advanceTimersByTime(100);
    expect(el.textContent).toContain('Strength');
    expect(el.textContent).toContain('+4');
    expect(el.textContent).toContain('Attack');
    p.onDisable!();
    vi.useRealTimers();
  });

  test('onDisable stops the interval (no further getState calls)', () => {
    vi.useFakeTimers();
    const getState = vi.fn(() => state());
    const p = createStatusHudPlugin({ intervalMs: 100 });
    const c = ctx(getState);
    p.overlay!(c); p.onEnable!(c);
    vi.advanceTimersByTime(100);
    const callsAfterEnable = getState.mock.calls.length;
    p.onDisable!();
    vi.advanceTimersByTime(500);
    expect(getState.mock.calls.length).toBe(callsAfterEnable);
    vi.useRealTimers();
  });

  test('pre-login (max 0) does not throw and reads as no data rather than as zero health', () => {
    vi.useFakeTimers();
    const p = createStatusHudPlugin({ intervalMs: 100 });
    const c = ctx(() => state({ hp: { current: 0, max: 0 }, prayer: { current: 0, max: 0 }, energy: 0 }));
    const el = p.overlay!(c);
    p.onEnable!(c);
    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
    expect([...el.querySelectorAll('.hud-value')].map(n => n.textContent)).toEqual(['—', '—', '0']);
    p.onDisable!();
    vi.useRealTimers();
  });

  // Task 13: the HUD is the mock's overlay pill column, not the pre-v2 grid of labelled bars. The
  // host IS the stack, because the plugin overlay layer places nothing (styles/layout/panels.css).
  test('the overlay is a hud stack of three meter pills, in HP, prayer, run order', () => {
    vi.useFakeTimers();
    const p = createStatusHudPlugin({ intervalMs: 100 });
    const c = ctx(() => state());
    const el = p.overlay!(c);
    p.onEnable!(c);
    vi.advanceTimersByTime(100);
    expect(el.className).toBe('hud-stack');
    expect([...el.querySelectorAll('.hud-pill')].map(n => n.className))
      .toEqual(['ov-pill hud-pill hud-pill-hp', 'ov-pill hud-pill hud-pill-prayer', 'ov-pill hud-pill hud-pill-run']);
    expect([...el.querySelectorAll('.hud-label')].map(n => n.textContent)).toEqual(['HP', 'PRAY', 'RUN']);
    // Run energy is out of 100 and the mock shows it bare; the other two carry their maximum.
    expect([...el.querySelectorAll('.hud-value')].map(n => n.textContent)).toEqual(['30/40', '10/43', '55']);
    expect([...el.querySelectorAll('.hud-fill')].map(n => (n as HTMLElement).style.width)).toEqual(['75%', '23%', '55%']);
    p.onDisable!();
    vi.useRealTimers();
  });

  test('the boost pill is the fourth pill, and it is absent when nothing is boosted', () => {
    vi.useFakeTimers();
    const boosts = new Array(25).fill(0); boosts[8] = 3; // Woodcutting +3, the mock's own pill
    const p = createStatusHudPlugin({ intervalMs: 100 });
    const c = ctx(() => state({ boosts }), true);
    const el = p.overlay!(c);
    p.onEnable!(c);
    vi.advanceTimersByTime(100);
    expect(el.children).toHaveLength(4);
    expect(el.children[3].className).toBe('ov-pill ov-pill-accent');
    expect(el.children[3].textContent).toBe('Woodcutting +3');
    p.onDisable!();
    vi.useRealTimers();
  });

  test('showBoosts off drops the pill entirely rather than rendering an empty one', () => {
    vi.useFakeTimers();
    const boosts = new Array(25).fill(0); boosts[8] = 3;
    const p = createStatusHudPlugin({ intervalMs: 100 });
    const c = ctx(() => state({ boosts }), false);
    const el = p.overlay!(c);
    p.onEnable!(c);
    vi.advanceTimersByTime(100);
    expect(el.children).toHaveLength(3);
    p.onDisable!();
    vi.useRealTimers();
  });

  test('boostSummary names only the skills that moved, with the sign', () => {
    const boosts = new Array(25).fill(0); boosts[2] = 4; boosts[0] = -2;
    expect(boostSummary(boosts)).toBe('Attack -2, Strength +4');
    expect(boostSummary(new Array(25).fill(0))).toBe('');
  });
});
