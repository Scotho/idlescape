import { afterEach, describe, expect, test, vi } from 'vitest';
import { createConnectPanel, manifest, type AgentTokenRow, type ConnectDeps } from './connect';
import { createPairingStore } from '../frame/pairing';
import type { HealthSnapshot } from '../types';

/**
 * The REAL pairing store over a fake Firestore listener (ruling R10): the panel is a consumer of
 * the frame's singleton now, so a stand-in for the store would stop testing the thing the panel
 * actually reads. `push` is how a test delivers a snapshot.
 */
function fakePairing() {
  let push: ((rows: AgentTokenRow[]) => void) | null = null;
  const unsubscribe = vi.fn();
  const uids: string[] = [];
  const store = createPairingStore({
    subscribeSessions: (uid, cb) => { uids.push(uid); push = cb; return unsubscribe; }
  });
  store.start('u1');
  return { store, uids, unsubscribe, push: (rows: AgentTokenRow[]) => push?.(rows) };
}

function fakeDeps(pairing: ConnectDeps['pairing'], overrides: Partial<ConnectDeps> = {}): ConnectDeps {
  return {
    hooks: () => null,
    pairing,
    ...overrides
  };
}

// One health fixture behind a factory. Five copies of the literal each grew a `players` field
// late and none of them had it, which is the drift the test typecheck exists to catch; the next
// field `HealthSnapshot` grows now costs one edit here rather than five. Audit C16.
const snapshot = (over: Partial<HealthSnapshot> = {}): HealthSnapshot => ({
  engine: 'up', engineUptimeMs: 1, version: '0.1.0', gateway: 'not_deployed',
  players: 0, wiki: 'up', management: 'up', ...over
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createConnectPanel', () => {
  test('manifest keeps id connect and icon, named Claude', () => {
    expect(manifest).toEqual({ id: 'connect', name: 'Claude', icon: 'claude', tier: 'shell' });
  });

  test('renders session rows and hides revoked ones; shows the pairing card with none active', () => {
    const pairing = fakePairing();
    const createCard = vi.fn(() => ({ el: document.createElement('div'), dispose: vi.fn() }));

    const view = createConnectPanel(fakeDeps(pairing.store), { createCard });
    const body = document.createElement('div');
    view.mount(body);

    expect(pairing.uids).toEqual(['u1']);
    // Unpaired is the pairing card and no session list at all (map-design 3.14). The pre-v2 panel
    // drew the card AND a one-line "nothing paired" state under it, which said the same thing the
    // card's own heading says.
    expect(createCard).toHaveBeenCalledTimes(1);
    expect(body.querySelector('#connect-sessions')).toBeNull();
    expect(body.textContent).not.toContain('Paired sessions');

    pairing.push([
      { id: 'a1', label: 'MacBook', createdAt: Date.now() - 60000, lastSeenAt: Date.now(), revokedAt: null },
      { id: 'a2', label: 'Old laptop', createdAt: Date.now() - 90000, lastSeenAt: Date.now() - 90000, revokedAt: Date.now() }
    ]);

    const rows = body.querySelectorAll('[data-session-row]');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('MacBook');
    expect(body.textContent).not.toContain('Old laptop');
    expect(body.textContent).toContain('Paired sessions');
    // A session seen inside the window takes the glowing live dot; the row action is the mock's
    // quiet outline, not the panel's default button.
    expect(rows[0].querySelector('.dot')!.className).toBe('dot dot-ok dot-pulse dot-glow');
    expect(rows[0].querySelector('[data-revoke]')!.className).toBe('btn btn-outline btn-xs');

    view.unmount?.();
    // The panel drops its SUBSCRIPTION and never the frame's listener: the co-pilot bar reads
    // the same store with this panel shut (ruling R10).
    expect(pairing.unsubscribe).not.toHaveBeenCalled();
    pairing.push([{ id: 'a1', label: 'MacBook', createdAt: 1, lastSeenAt: Date.now(), revokedAt: null }]);
    expect(pairing.store.state()).toBe('paired-live');
  });

  test('the gateway line reads the frame health poll, and repaints on the 5s tick', () => {
    vi.useFakeTimers();
    const pairing = fakePairing();
    const createCard = vi.fn(() => ({ el: document.createElement('div'), dispose: vi.fn() }));
    let health: HealthSnapshot | null = null;

    const view = createConnectPanel(fakeDeps(pairing.store, { health: () => health }), { createCard });
    const body = document.createElement('div');
    view.mount(body);
    const gateway = body.querySelector<HTMLElement>('#connect-gateway')!;
    // The mock writes this value as a coloured `● up` (3.14); the glyph is the state mark
    // ruling R19 keeps and the colour is what separates the three states at a glance.
    expect(gateway.textContent).toBe('● not deployed yet');
    expect(gateway.style.color).toBe('var(--text-muted)');

    health = snapshot({ gateway: 'up' });
    vi.advanceTimersByTime(5000);
    expect(gateway.textContent).toBe('● up');
    expect(gateway.style.color).toBe('var(--ok-bright)');

    view.unmount?.();
    health = snapshot({ gateway: 'down' });
    vi.advanceTimersByTime(5000);
    expect(gateway.textContent).toBe('● up');
    vi.useRealTimers();
  });

  // The mark is a repeat of the colour for sighted readers; a screen reader that meets it inside
  // the value node announces "black circle up". It is the panel's only decorative glyph, so it is
  // the only one that has to say so, on the first paint and on every 5s repaint.
  test('the gateway mark is hidden from assistive tech, the word is not', () => {
    vi.useFakeTimers();
    const pairing = fakePairing();
    const createCard = vi.fn(() => ({ el: document.createElement('div'), dispose: vi.fn() }));
    let health: HealthSnapshot | null = snapshot({ gateway: 'up' });

    const view = createConnectPanel(fakeDeps(pairing.store, { health: () => health }), { createCard });
    const body = document.createElement('div');
    view.mount(body);
    const gateway = body.querySelector<HTMLElement>('#connect-gateway')!;
    expect(gateway.querySelector('[aria-hidden="true"]')!.textContent).toBe('● ');
    expect(gateway.textContent).toBe('● up');
    // Everything the mark is not: the word is a bare text node of the value, not inside the span.
    expect(gateway.lastChild!.textContent).toBe('up');

    health = snapshot({ gateway: 'down' });
    vi.advanceTimersByTime(5000);
    expect(gateway.querySelector('[aria-hidden="true"]')!.textContent).toBe('● ');
    expect(gateway.lastChild!.textContent).toBe('down');
    view.unmount?.();
    vi.useRealTimers();
  });

  // map-design 3.14 ends the panel with a Link section: the gateway and the client link, both
  // facts about the shell rather than about a pairing, so they show in both states.
  test('the Link section reports the client link in the mock wording, paired or not', () => {
    const pairing = fakePairing();
    const createCard = vi.fn(() => ({ el: document.createElement('div'), dispose: vi.fn() }));
    const hooks = () => ({ getState: () => ({ fps: 50, rttMs: 38, loggedIn: true }) }) as unknown as ReturnType<ConnectDeps['hooks']>;

    const view = createConnectPanel(fakeDeps(pairing.store, { hooks }), { createCard });
    const body = document.createElement('div');
    view.mount(body);

    const labels = Array.from(body.querySelectorAll('.section-label')).map(el => el.textContent);
    expect(labels).toEqual(['Link']);
    expect(body.querySelector('#connect-link-health')!.textContent).toBe('fps 50 · rtt 38ms · ws ok');

    pairing.push([{ id: 'a1', label: 'MacBook', createdAt: 1, lastSeenAt: Date.now(), revokedAt: null }]);
    expect(Array.from(body.querySelectorAll('.section-label')).map(el => el.textContent))
      .toEqual(['Paired sessions', 'Link']);
    expect(body.querySelector('#connect-link-health')!.textContent).toBe('fps 50 · rtt 38ms · ws ok');

    view.unmount?.();
  });

  test('a hostile label is escaped, not rendered as a live element (stored-XSS regression)', () => {
    const pairing = fakePairing();
    const createCard = vi.fn(() => ({ el: document.createElement('div'), dispose: vi.fn() }));

    const view = createConnectPanel(fakeDeps(pairing.store), { createCard });
    const body = document.createElement('div');
    view.mount(body);

    const hostileLabel = '<img src=x onerror=alert(1)>';
    pairing.push([{ id: 'a1', label: hostileLabel, createdAt: Date.now(), lastSeenAt: Date.now(), revokedAt: null }]);

    // The label is external input (the exchange body a caller sends); it must land in the DOM
    // as escaped text, never as a live element the browser parses and executes.
    expect(body.querySelector('img')).toBeNull();
    const valueEl = body.querySelector('.kv-value')!;
    expect(valueEl.textContent).toBe(hostileLabel);
    expect(valueEl.innerHTML).not.toContain('<img');
    expect(body.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');

    view.unmount?.();
  });

  test('revoke button confirms and calls the injected revoke with the id token', async () => {
    const pairing = fakePairing();
    const createCard = vi.fn(() => ({ el: document.createElement('div'), dispose: vi.fn() }));
    const revoke = vi.fn(async () => {});
    const getIdToken = vi.fn(async () => 'id-token-1');
    vi.stubGlobal('confirm', vi.fn(() => true));

    const view = createConnectPanel(fakeDeps(pairing.store), { createCard, revoke, getIdToken });
    const body = document.createElement('div');
    view.mount(body);
    pairing.push([{ id: 'a1', label: 'MacBook', createdAt: Date.now(), lastSeenAt: Date.now(), revokedAt: null }]);

    body.querySelector<HTMLButtonElement>('[data-revoke]')!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(revoke).toHaveBeenCalledWith('id-token-1', 'a1');
    view.unmount?.();
    vi.unstubAllGlobals();
  });

  test('a failed revoke shows a transient error instead of an unhandled rejection', async () => {
    const pairing = fakePairing();
    const createCard = vi.fn(() => ({ el: document.createElement('div'), dispose: vi.fn() }));
    const revoke = vi.fn(async () => { throw new Error('404'); });
    const getIdToken = vi.fn(async () => 'id-token-1');
    vi.stubGlobal('confirm', vi.fn(() => true));

    const view = createConnectPanel(fakeDeps(pairing.store), { createCard, revoke, getIdToken });
    const body = document.createElement('div');
    view.mount(body);
    pairing.push([{ id: 'a1', label: 'MacBook', createdAt: Date.now(), lastSeenAt: Date.now(), revokedAt: null }]);

    body.querySelector<HTMLButtonElement>('[data-revoke]')!.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const errorEl = body.querySelector<HTMLElement>('#connect-revoke-error')!;
    expect(errorEl.classList.contains('hidden')).toBe(false);
    expect(errorEl.textContent).toContain("Couldn't revoke");

    view.unmount?.();
    vi.unstubAllGlobals();
  });

  test('unmount resets manualShowCard so a reopen does not show stale view state', () => {
    const pairing = fakePairing();
    const createCard = vi.fn(() => ({ el: document.createElement('div'), dispose: vi.fn() }));

    const view = createConnectPanel(fakeDeps(pairing.store), { createCard });
    const body = document.createElement('div');
    view.mount(body);
    pairing.push([{ id: 'a1', label: 'MacBook', createdAt: Date.now(), lastSeenAt: Date.now(), revokedAt: null }]);
    // Force the card open via "Pair another" while a session is already active.
    const pairAnother = body.querySelector<HTMLButtonElement>('#connect-pair-another')!;
    expect(pairAnother.textContent).toBe('Pair another session');
    expect(pairAnother.className).toBe('btn btn-link');
    pairAnother.click();
    expect(body.querySelector('#connect-pair-another')).toBeNull();

    view.unmount?.();

    // The rows survive the remount, because they are the frame's and not the panel's; only the
    // "Pair another" view state resets, so the button is back.
    const body2 = document.createElement('div');
    view.mount(body2);
    expect(body2.querySelector('#connect-pair-another')).not.toBeNull();
    expect(body2.querySelectorAll('[data-session-row]').length).toBe(1);

    view.unmount?.();
  });
});
