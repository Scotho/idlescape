// web/src/sessions/manager.login.test.ts -- login, logout and reconnect, split out of
// `manager.test.ts` when Task 18 added the online stamp. The lifecycle, polling, boot and teardown
// cases stayed there; everything that drives a session across the online edge is here.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { READY_TIMEOUT_MESSAGE } from './manager';
import { buildManager, character, fakeClient, type Creds } from './manager.harness';
import type { LoginResult } from '../clientTypes';

describe('createSessionManager login and reconnect', () => {
  let host: HTMLElement;
  beforeEach(() => { vi.useFakeTimers(); host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { vi.useRealTimers(); host.remove(); });

  test('login moves the session through connecting to online', async () => {
    const a = fakeClient();
    const { manager } = buildManager(host, { a });
    await manager.activate('a');
    const pending = manager.login('a');
    expect(manager.get('a')!.state).toBe('connecting');
    a.loggedIn = true;
    a.emit('login', { gameName: 'name_a' });
    await expect(pending).resolves.toEqual({ ok: true });
    expect(manager.get('a')!.state).toBe('online');
    expect(a.loginArmedCalls).toBe(1);
  });

  test('login on a session that is already online resolves without calling loginArmed again', async () => {
    const a = fakeClient();
    const { manager } = buildManager(host, { a });
    await manager.activate('a');
    const pending = manager.login('a');
    a.loggedIn = true;
    a.emit('login', { gameName: 'name_a' });
    await expect(pending).resolves.toEqual({ ok: true });
    expect(a.loginArmedCalls).toBe(1);
    // A returning player who pressed Login themselves: the client reports logged in, and the
    // shell must not wait on `loginArmed()` against a client whose title screen is gone.
    await expect(manager.login('a')).resolves.toEqual({ ok: true });
    expect(a.loginArmedCalls).toBe(1);
    expect(manager.get('a')!.state).toBe('online');
  });

  test('a second login while the first is still in flight is refused, not re-armed', async () => {
    const a = fakeClient();
    const { manager } = buildManager(host, { a });
    await manager.activate('a');
    // The client keeps a single `loginResolver`: a second `loginArmed()` overwrites it and the
    // first promise never settles. Hold the first call open to sit in that window.
    let release: (r: LoginResult) => void = () => {};
    a.hooks.loginArmed = () => { a.loginArmedCalls++; return new Promise<LoginResult>(resolve => { release = resolve; }); };
    const first = manager.login('a');
    expect(manager.get('a')!.state).toBe('connecting');
    await expect(manager.login('a')).resolves.toEqual({ ok: false, code: -1, reason: 'Login already in progress.' });
    expect(a.loginArmedCalls).toBe(1);
    release({ ok: true });
    await expect(first).resolves.toEqual({ ok: true });
  });

  test('logout returns the session to the title screen and disconnect marks it offline', async () => {
    const a = fakeClient();
    const { manager } = buildManager(host, { a });
    await manager.activate('a');
    await manager.login('a');
    a.loggedIn = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(manager.get('a')!.state).toBe('online');
    a.hooks.logout();
    await vi.advanceTimersByTimeAsync(1000);
    expect(manager.get('a')!.state).toBe('title');
    a.emit('disconnect', { code: 0 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(manager.get('a')!.state).toBe('offline');
  });

  test('login while credentials are still being minted is refused', async () => {
    const a = fakeClient();
    let release: (c: Creds) => void = () => {};
    const minting = new Promise<Creds>(resolve => { release = resolve; });
    const { manager } = buildManager(host, { a }, { mintSession: () => minting });
    const opening = manager.open(character('a', 'alpha'));
    await vi.advanceTimersByTimeAsync(0);
    // The hooks exist, but nothing has been armed: the session still reads as booting.
    expect(manager.get('a')!.hooks).toBeNull();
    expect(manager.get('a')!.state).toBe('booting');
    await expect(manager.login('a')).resolves.toEqual({ ok: false, code: -1, reason: READY_TIMEOUT_MESSAGE });
    expect(a.loginArmedCalls).toBe(0);
    release({ gameName: 'name_a', secret: 's_a' });
    await opening;
    await expect(manager.login('a')).resolves.toEqual({ ok: true });
    expect(a.loginArmedCalls).toBe(1);
  });

  test('login before the client is ready fails without touching the frame', async () => {
    const a = fakeClient();
    const { manager } = buildManager(host, { a }, { readyAfterMs: 120 });
    void manager.open(character('a', 'alpha'));
    await expect(manager.login('a')).resolves.toEqual({ ok: false, code: -1, reason: READY_TIMEOUT_MESSAGE });
    await expect(manager.login('missing')).resolves.toMatchObject({ ok: false });
    expect(a.loginArmedCalls).toBe(0);
  });
});
