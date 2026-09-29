// The per-script enable store: what it answers before anything is stored, when the debounce
// reaches the backend, which side wins on load, and what happens with no account behind it.
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createToggleStore } from './toggles';

const backend = () => ({ load: vi.fn(async () => ({}) as Record<string, boolean>), write: vi.fn(async () => {}) });

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

test('a script with no stored toggle is enabled', async () => {
  const store = createToggleStore(backend());
  await store.load('u1');
  expect(store.isEnabled('chop-and-drop')).toBe(true);
});

test('a write lands in localStorage at once and in the backend after the debounce', async () => {
  const b = backend();
  const store = createToggleStore(b, { debounceMs: 800 });
  await store.load('u1');
  store.setEnabled('u1', 'chop-and-drop', false);

  expect(store.isEnabled('chop-and-drop')).toBe(false);
  expect(localStorage.getItem('cs.script.u.u1.chop-and-drop')).toBe('false');
  expect(b.write).not.toHaveBeenCalled();
  vi.advanceTimersByTime(799);
  expect(b.write).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(b.write).toHaveBeenCalledWith('u1', 'chop-and-drop', false);
});

test('two writes inside the debounce make one backend call with the last value', async () => {
  const b = backend();
  const store = createToggleStore(b, { debounceMs: 800 });
  await store.load('u1');
  store.setEnabled('u1', 'x', false);
  vi.advanceTimersByTime(400);
  store.setEnabled('u1', 'x', true);
  vi.advanceTimersByTime(800);
  expect(b.write).toHaveBeenCalledTimes(1);
  expect(b.write).toHaveBeenCalledWith('u1', 'x', true);
});

test('a second write inside the debounce pushes the deadline out', async () => {
  const b = backend();
  const store = createToggleStore(b, { debounceMs: 800 });
  await store.load('u1');
  store.setEnabled('u1', 'x', false);
  vi.advanceTimersByTime(400);
  store.setEnabled('u1', 'x', true);
  // 900 ms after the first write, 500 after the second: the first deadline has to have been
  // dropped rather than merely out-voted by the pending value.
  vi.advanceTimersByTime(500);
  expect(b.write).not.toHaveBeenCalled();
  vi.advanceTimersByTime(300);
  expect(b.write).toHaveBeenCalledWith('u1', 'x', true);
});

test('two scripts written together each reach the backend', async () => {
  const b = backend();
  const store = createToggleStore(b, { debounceMs: 800 });
  await store.load('u1');
  store.setEnabled('u1', 'x', false);
  store.setEnabled('u1', 'y', false);
  vi.advanceTimersByTime(800);
  expect(b.write.mock.calls).toEqual([['u1', 'x', false], ['u1', 'y', false]]);
});

test('the backend wins over the local mirror on load', async () => {
  localStorage.setItem('cs.script.u.u1.x', 'true');
  const b = backend();
  b.load.mockResolvedValue({ x: false });
  const store = createToggleStore(b);
  await store.load('u1');
  expect(store.isEnabled('x')).toBe(false);
});

test('a local value the backend has never heard of survives the load', async () => {
  localStorage.setItem('cs.script.u.u1.x', 'false');
  const b = backend();
  b.load.mockResolvedValue({ y: false });
  const store = createToggleStore(b);
  const values = await store.load('u1');
  expect(store.isEnabled('x')).toBe(false);
  expect(store.isEnabled('y')).toBe(false);
  expect([...values.entries()].sort()).toEqual([['x', false], ['y', false]]);
});

test('a switch flipped while the load is in flight outranks the snapshot that lands after it', async () => {
  const b = backend();
  let landRemote = (_v: Record<string, boolean>): void => {};
  b.load.mockReturnValue(new Promise<Record<string, boolean>>(res => { landRemote = res; }));
  const store = createToggleStore(b, { debounceMs: 800 });
  // `wire.ts` fires the load and does not await it, so this is the real ordering, not a
  // contrived one: the player flips a switch while the Firestore read is still open.
  const loading = store.load('u1');
  store.setEnabled('u1', 'x', false);
  // Another session's store mirrors its own answer into the same localStorage while this read is
  // open: the shell runs one store per character tab, all of them over one account.
  localStorage.setItem('cs.script.u.u1.x', 'true');
  landRemote({ x: true, y: true });
  await loading;
  // The write is on its way to the account, so the panel must not go back to showing it on.
  expect(store.isEnabled('x')).toBe(false);
  expect(store.isEnabled('y')).toBe(true);
  vi.advanceTimersByTime(800);
  expect(b.write).toHaveBeenCalledWith('u1', 'x', false);
});

test('a second load drops what the first one held', async () => {
  const b = backend();
  b.load.mockResolvedValueOnce({ x: false }).mockResolvedValueOnce({});
  const store = createToggleStore(b);
  await store.load('u1');
  expect(store.isEnabled('x')).toBe(false);
  await store.load('u2');
  expect(store.isEnabled('x')).toBe(true);
});

test('signed out, the local mirror is the whole store and nothing is written remotely', async () => {
  localStorage.setItem('cs.script.anon.x', 'false');
  const b = backend();
  const store = createToggleStore(b);
  await store.load(null);
  expect(b.load).not.toHaveBeenCalled();
  expect(store.isEnabled('x')).toBe(false);
  store.setEnabled(null, 'y', false);
  vi.advanceTimersByTime(5000);
  expect(b.write).not.toHaveBeenCalled();
  expect(store.isEnabled('y')).toBe(false);
  expect(localStorage.getItem('cs.script.anon.y')).toBe('false');
});

test('a backend that throws leaves the local value standing', async () => {
  const b = backend();
  b.load.mockRejectedValue(new Error('offline'));
  localStorage.setItem('cs.script.u.u1.x', 'false');
  const store = createToggleStore(b);
  await store.load('u1');
  expect(store.isEnabled('x')).toBe(false);
});

test('a backend write that rejects is not an error: localStorage already holds the value', async () => {
  const b = backend();
  b.write.mockRejectedValue(new Error('offline'));
  const store = createToggleStore(b, { debounceMs: 10 });
  await store.load('u1');
  store.setEnabled('u1', 'x', false);
  vi.advanceTimersByTime(10);
  await Promise.resolve();
  expect(store.isEnabled('x')).toBe(false);
});

test('flush writes what is pending now and leaves no timer to fire it twice', async () => {
  const b = backend();
  const store = createToggleStore(b, { debounceMs: 800 });
  await store.load('u1');
  store.setEnabled('u1', 'x', false);
  const armed = vi.getTimerCount();
  await store.flush();
  expect(b.write).toHaveBeenCalledTimes(1);
  expect(b.write).toHaveBeenCalledWith('u1', 'x', false);
  // The debounce timer is disarmed, not merely defused by the pending value being cleared: a
  // timer outliving the store it belongs to is the leak this counts. (jsdom's localStorage arms
  // one of its own on every write, which is why this is a delta and not a count of zero.)
  expect(vi.getTimerCount()).toBe(armed - 1);
  vi.advanceTimersByTime(5000);
  expect(b.write).toHaveBeenCalledTimes(1);
});

test('flush with nothing pending writes nothing', async () => {
  const b = backend();
  const store = createToggleStore(b, { debounceMs: 800 });
  await store.load('u1');
  store.setEnabled('u1', 'x', false);
  vi.advanceTimersByTime(800);
  await store.flush();
  expect(b.write).toHaveBeenCalledTimes(1);
});

test('a stored "true" is read back as enabled rather than as unknown', async () => {
  localStorage.setItem('cs.script.anon.x', 'true');
  localStorage.setItem('cs.other.x', 'false');
  const store = createToggleStore(backend());
  const values = await store.load(null);
  expect(values.get('x')).toBe(true);
  // A key from another namespace is not a script id, whatever it holds.
  expect(values.has('other.x')).toBe(false);
});

// Audit C10: the leak, reproduced. Before scoping, the mirror was a bare `cs.script.<id>` key and
// load(uid) enumerated the whole namespace, so one account's Off followed the player into another.
test('a script disabled by one account still runs for another', async () => {
  const store = createToggleStore(backend(), { debounceMs: 10 });
  await store.load('userA');
  store.setEnabled('userA', 'chop-and-drop', false);
  expect(store.isEnabled('chop-and-drop')).toBe(false);
  expect(localStorage.getItem('cs.script.u.userA.chop-and-drop')).toBe('false');

  await store.load('userB');
  // Absent means enabled: userB has never touched this script and must not inherit userA's off.
  expect(store.isEnabled('chop-and-drop')).toBe(true);
  expect(localStorage.getItem('cs.script.u.userB.chop-and-drop')).toBeNull();
});

test('a signed-out toggle does not follow the player into an account', async () => {
  const store = createToggleStore(backend(), { debounceMs: 10 });
  await store.load(null);
  store.setEnabled(null, 'chop-and-drop', false);
  expect(localStorage.getItem('cs.script.anon.chop-and-drop')).toBe('false');

  await store.load('userA');
  expect(store.isEnabled('chop-and-drop')).toBe(true);
});
