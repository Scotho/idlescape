// web/src/sessions/manager.test.ts -- the session lifecycle: open, activate, poll, boot and
// teardown. Login, logout and reconnect live in `manager.login.test.ts`; the scripted client and
// the manager builder both files use live in `manager.harness.ts`.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createSessionManager, READY_TIMEOUT_MESSAGE } from './manager';
import { buildManager, character, fakeClient } from './manager.harness';

describe('createSessionManager', () => {
  let host: HTMLElement;
  beforeEach(() => { vi.useFakeTimers(); host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { vi.useRealTimers(); host.remove(); });

  test('open creates one iframe, mints credentials and arms the client', async () => {
    const a = fakeClient();
    const { manager, ready } = buildManager(host, { a });
    const session = await manager.open(character('a', 'alpha'));
    expect(host.querySelectorAll('iframe')).toHaveLength(1);
    expect(session.iframe.dataset.character).toBe('a');
    expect(a.armed).toEqual([['name_a', 's_a', 'name_a']]);
    expect(session.state).toBe('title');
    expect(ready).toEqual(['a']);
  });

  test('open is single-flight per character', async () => {
    const a = fakeClient();
    const { manager } = buildManager(host, { a });
    const [one, two] = await Promise.all([manager.open(character('a', 'alpha')), manager.open(character('a', 'alpha'))]);
    expect(one).toBe(two);
    expect(host.querySelectorAll('iframe')).toHaveLength(1);
    expect(a.armed).toHaveLength(1);
  });

  test('activate hides and suspends the others, resumes and shows the chosen one', async () => {
    const a = fakeClient();
    const b = fakeClient();
    const { manager } = buildManager(host, { a, b });
    await manager.open(character('a', 'alpha'));
    await manager.activate('a');
    await manager.activate('b');   // opens b lazily
    expect(manager.activeId()).toBe('b');
    expect(manager.get('a')!.iframe.classList.contains('hidden')).toBe(true);
    expect(manager.get('b')!.iframe.classList.contains('hidden')).toBe(false);
    expect(a.suspended.at(-1)).toBe(true);
    expect(b.suspended.at(-1)).toBe(false);
    // A background character is minded by the shell, so it must not idle itself out.
    expect(a.attended.at(-1)).toBe(true);
  });

  test('the 1 s poll reports a state change exactly once', async () => {
    const a = fakeClient();
    const { manager, changes } = buildManager(host, { a });
    await manager.activate('a');
    const before = changes.length;
    a.loggedIn = true;
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(changes.length).toBe(before + 1);
    expect(manager.states()).toEqual({ a: 'online' });
  });

  test('close logs out, drops the iframe and falls back to the previous character', async () => {
    const a = fakeClient();
    const b = fakeClient();
    const { manager } = buildManager(host, { a, b });
    await manager.activate('a');
    await manager.activate('b');
    manager.close('b');
    expect(b.logoutCalls).toBe(1);
    expect(host.querySelectorAll('iframe')).toHaveLength(1);
    expect(manager.get('b')).toBeUndefined();
    expect(manager.activeId()).toBe('a');
    expect(manager.get('a')!.iframe.classList.contains('hidden')).toBe(false);
  });
});

describe('createSessionManager boot and teardown edges', () => {
  let host: HTMLElement;
  beforeEach(() => { vi.useFakeTimers(); host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { vi.useRealTimers(); host.remove(); });

  test('a boot that fails while it holds the tab hands the tab back to the previous session', async () => {
    const a = fakeClient();
    const b = fakeClient();
    const { manager } = buildManager(host, { a, b }, { readyAfterMs: { a: 0, b: 10_000 }, readyTimeoutMs: 500 });
    await manager.activate('a');
    const first = manager.activate('b');
    const failing = expect(first).rejects.toThrow(READY_TIMEOUT_MESSAGE);
    // The second call finds the booting entry and shows it, so 'b' holds the tab while it boots.
    await manager.activate('b');
    expect(manager.activeId()).toBe('b');
    await vi.advanceTimersByTimeAsync(600);
    await failing;
    expect(manager.get('b')).toBeUndefined();
    expect(manager.activeId()).toBe('a');
    expect(manager.active()).toBe(manager.get('a'));
    expect(manager.get('a')!.iframe.classList.contains('hidden')).toBe(false);
    expect(a.suspended.at(-1)).toBe(false);
  });

  test('a boot that fails while it holds the only tab leaves nothing active', async () => {
    const b = fakeClient();
    const { manager } = buildManager(host, { b }, { readyAfterMs: 10_000, readyTimeoutMs: 500 });
    const failing = expect(manager.activate('b')).rejects.toThrow(READY_TIMEOUT_MESSAGE);
    await manager.activate('b');
    expect(manager.activeId()).toBe('b');
    await vi.advanceTimersByTimeAsync(600);
    await failing;
    expect(manager.activeId()).toBeNull();
    expect(manager.active()).toBeNull();
    expect(manager.list()).toEqual([]);
  });

  test('open after a close during boot starts a fresh boot instead of reusing the doomed one', async () => {
    const a = fakeClient();
    const { manager, ready } = buildManager(host, { a }, { readyAfterMs: 120 });
    const doomed = expect(manager.open(character('a', 'alpha'))).rejects.toThrow('session closed');
    const firstFrame = host.querySelector('iframe');
    manager.close('a');
    const fresh = manager.open(character('a', 'alpha'));
    expect(host.querySelectorAll('iframe')).toHaveLength(1);
    expect(host.querySelector('iframe')).not.toBe(firstFrame);
    await vi.advanceTimersByTimeAsync(200);
    await doomed;
    const session = await fresh;
    expect(session.iframe).toBe(host.querySelector('iframe'));
    expect(session.state).toBe('title');
    expect(a.armed).toHaveLength(1);
    expect(ready).toEqual(['a']);
  });

  test('a slow boot does not steal the tab from a character activated since', async () => {
    const a = fakeClient();
    const b = fakeClient();
    const { manager } = buildManager(host, { a, b }, { readyAfterMs: { a: 120, b: 0 } });
    const slow = manager.activate('a');
    await manager.activate('b');
    expect(manager.activeId()).toBe('b');
    await vi.advanceTimersByTimeAsync(200);
    const session = await slow;
    expect(session?.id).toBe('a');
    expect(manager.activeId()).toBe('b');
    expect(manager.get('a')!.iframe.classList.contains('hidden')).toBe(true);
    expect(manager.get('b')!.iframe.classList.contains('hidden')).toBe(false);
    expect(a.suspended.at(-1)).toBe(true);
    expect(b.suspended.at(-1)).toBe(false);
  });

  test('a frame that boots later is polled every 50 ms and is booting until then', async () => {
    const a = fakeClient();
    const { manager, ready } = buildManager(host, { a }, { readyAfterMs: 120 });
    const pending = manager.open(character('a', 'alpha'));
    expect(manager.get('a')!.state).toBe('booting');
    await vi.advanceTimersByTimeAsync(100);
    expect(manager.get('a')!.hooks).toBeNull();
    expect(ready).toEqual([]);
    await vi.advanceTimersByTimeAsync(50);
    const session = await pending;
    expect(session.hooks).toBe(a.hooks);
    expect(session.state).toBe('title');
    expect(ready).toEqual(['a']);
  });

  test('a frame that never boots rejects with the ready message and leaves nothing behind', async () => {
    const a = fakeClient();
    const { manager } = buildManager(host, { a }, { readyAfterMs: 10_000, readyTimeoutMs: 500 });
    const pending = manager.open(character('a', 'alpha'));
    const outcome = expect(pending).rejects.toThrow(READY_TIMEOUT_MESSAGE);
    await vi.advanceTimersByTimeAsync(600);
    await outcome;
    expect(manager.get('a')).toBeUndefined();
    expect(host.querySelectorAll('iframe')).toHaveLength(0);
    // The failed boot is forgotten, so a retry builds a fresh frame instead of finding a zombie.
    expect(manager.list()).toEqual([]);
  });

  test('close during boot cancels the open without arming the client', async () => {
    const a = fakeClient();
    const { manager, ready } = buildManager(host, { a }, { readyAfterMs: 120 });
    const pending = manager.open(character('a', 'alpha'));
    const outcome = expect(pending).rejects.toThrow('session closed');
    manager.close('a');
    await vi.advanceTimersByTimeAsync(200);
    await outcome;
    expect(a.armed).toEqual([]);
    expect(ready).toEqual([]);
    expect(host.querySelectorAll('iframe')).toHaveLength(0);
  });

  test('the default frame points at /play.html and is allowed to go fullscreen', () => {
    const manager = createSessionManager({ host, mintSession: () => Promise.reject(new Error('unused')), onReady: () => {}, onChange: () => {} });
    void manager.open(character('a', 'alpha'));
    const iframe = host.querySelector<HTMLIFrameElement>('iframe[data-character="a"]')!;
    expect(iframe.getAttribute('src')).toBe('/play.html');
    expect(iframe.allow).toContain('fullscreen');
    expect(iframe.title).toContain('alpha');
    manager.dispose();
  });

  test('dispose removes every frame and stops the poll', async () => {
    const a = fakeClient();
    const b = fakeClient();
    const { manager, changes } = buildManager(host, { a, b });
    await manager.activate('a');
    await manager.activate('b');
    manager.dispose();
    expect(host.querySelectorAll('iframe')).toHaveLength(0);
    expect(manager.list()).toEqual([]);
    expect(manager.activeId()).toBeNull();
    expect(manager.active()).toBeNull();
    const after = changes.length;
    a.loggedIn = true;
    await vi.advanceTimersByTimeAsync(3000);
    expect(changes.length).toBe(after);
    expect(vi.getTimerCount()).toBe(0);
  });
});

// The online stamp (Task 18, ruling R8). `onlineSince` is what the character tab's clock counts
// from, so it has to mean "this character came online at", not "this iframe was created at".
describe('the online stamp', () => {
  let host: HTMLElement;
  let clock = 0;
  beforeEach(() => { vi.useFakeTimers(); clock = 0; host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { vi.useRealTimers(); host.remove(); });

  /** A session opened at clock 0 and brought online at clock 5,000 by the 1 s poll. */
  async function onlineSession() {
    const a = fakeClient();
    const { manager } = buildManager(host, { a }, { now: () => clock });
    const session = await manager.open(character('a', 'alpha'));
    clock = 5_000;
    a.loggedIn = true;
    await vi.advanceTimersByTimeAsync(1000);
    return { manager, session, a };
  }

  test('stamps onlineSince on the transition into online, and only then', async () => {
    const a = fakeClient();
    const { manager } = buildManager(host, { a }, { now: () => clock });
    const session = await manager.open(character('a', 'alpha'));
    // The iframe exists and its hooks are armed; nobody is logged in.
    expect(session.onlineSince).toBeNull();
    clock = 5_000;
    a.loggedIn = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.onlineSince).toBe(5_000);
    // Still online four seconds later: the stamp does NOT move, or the clock would read 0:00.
    clock = 9_000;
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.onlineSince).toBe(5_000);
    expect(manager.get('a')!.state).toBe('online');
  });

  test('clears onlineSince on every transition out of online', async () => {
    for (const leave of ['logout', 'disconnect', 'title'] as const) {
      const { session, a } = await onlineSession();
      if (leave === 'logout') a.hooks.logout();
      if (leave === 'disconnect') { a.loggedIn = false; a.emit('disconnect', { code: 0 }); }
      if (leave === 'title') a.loggedIn = false;
      await vi.advanceTimersByTimeAsync(1000);
      expect(session.state, leave).not.toBe('online');
      expect(session.onlineSince, leave).toBeNull();
    }
  });

  test('re-stamps on a reconnect rather than resuming the old clock', async () => {
    const { session, a } = await onlineSession();   // stamped at 5,000
    a.loggedIn = false;
    a.emit('disconnect', { code: 0 });
    await vi.advanceTimersByTimeAsync(1000);
    clock = 20_000;
    a.loggedIn = true;
    a.emit('login', { gameName: 'name_a' });
    expect(session.onlineSince).toBe(20_000);
  });

  test('does not confuse startedAt with onlineSince', async () => {
    // `startedAt` has meant "the iframe object was created", in state booting, since SP7. A frame
    // parked on the title screen for two hours would read 2:00:00 if the tab used it (ruling R8).
    const { session } = await onlineSession();
    expect(session.startedAt).toBe(0);
    expect(session.startedAt).toBeLessThan(session.onlineSince!);
  });
});
