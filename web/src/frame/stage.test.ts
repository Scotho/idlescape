// web/src/frame/stage.test.ts -- the stage over a scripted session manager and a Worker-less runtime.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createStage, PANEL_W, STRIP_W, type StageDeps } from './stage';
import { siteLabel } from './siteLabel';
import { createTasksRouter } from '../tasks/router';
import type { CharacterSessionManager, SessionManagerDeps } from '../sessions/manager';
import type { CharacterSession, SessionState } from '../sessions/types';
import type { CharacterSummary } from '../types';
import type { TasksApi } from '../tasks/api';
import { IDLE_STATUS } from '../tasks/api';
import type { ClientHooks } from '../clientTypes';

function fakeSession(id: string, state: SessionState, onlineSince: number | null = state === 'online' ? 1_000 : null): CharacterSession & { handlers: number } {
  const iframe = document.createElement('iframe');
  const session = {
    id, character: { id, gameName: `name_${id}`, createdAt: 1, lastLoginAt: null }, iframe,
    hooks: null as ClientHooks | null, state, startedAt: 0, lastStateAt: 0, onlineSince, handlers: 0
  };
  session.hooks = {
    on: () => { session.handlers++; return () => { session.handlers--; }; },
    getState: () => ({ loggedIn: state === 'online' })
  } as unknown as ClientHooks;
  return session;
}

function fakeApi(): TasksApi & { subscribers: number } {
  const api = {
    subscribers: 0,
    dispose: vi.fn(),
    status: () => IDLE_STATUS,
    onEvent: vi.fn(() => () => {}),
    onStatus: vi.fn(() => { api.subscribers++; return () => { api.subscribers--; }; })
  };
  return api as unknown as TasksApi & { subscribers: number };
}

/** Every stage `build()` makes, so `afterEach` stops its 1 Hz tab clock. */
const stages: { dispose(): void }[] = [];
afterEach(() => { for (const s of stages) s.dispose(); stages.length = 0; });

function build(opts: { now?: () => number } = {}) {
  const sessions = new Map<string, CharacterSession>();
  let activeId: string | null = null;
  /** Set by `failActivate` so a test can drive `selectCharacter`'s rejection path. */
  let activateError: Error | null = null;
  let managerDeps: SessionManagerDeps | null = null;
  const closed: string[] = [];
  const apis = new Map<string, ReturnType<typeof fakeApi>>();
  const logins: string[] = [];
  /** What the scripted manager answers `login` with; the real one refuses a second in-flight login. */
  let loginResult: { ok: true } | { ok: false; code: number; reason: string } = { ok: true };
  const manager: CharacterSessionManager = {
    setCharacters: () => {},
    open: () => Promise.reject(new Error('unused')),
    activate: id => {
      if (activateError) return Promise.reject(activateError);
      activeId = id;
      return Promise.resolve(sessions.get(id) ?? null);
    },
    login: id => { logins.push(id); return Promise.resolve(loginResult); },
    close: id => { closed.push(id); sessions.delete(id); if (activeId === id) activeId = null; },
    get: id => sessions.get(id),
    list: () => [...sessions.values()],
    active: () => (activeId ? sessions.get(activeId) ?? null : null),
    activeId: () => activeId,
    states: () => Object.fromEntries([...sessions.values()].map(s => [s.id, s.state])),
    dispose: () => {}
  };
  /** Stands in for the home controller's cached listing, which can lag behind the panel's. */
  let cached: CharacterSummary[] | null = null;
  const el = () => document.createElement('div');
  const title = el();
  const tabs = el();
  const overlays = { setXpLine: vi.fn(), setStatus: vi.fn() };
  const notify = vi.fn();
  const openPanel = vi.fn();
  const tasks = createTasksRouter({ activeId: () => manager.activeId() });
  const deps: StageDeps = {
    frames: el(), tabs, stage: el(), sidePanel: el(), title,
    mintSession: () => Promise.reject(new Error('unused')),
    uid: () => 'u', characters: () => cached ?? [...sessions.values()].map(s => s.character), characterLimit: () => 3,
    overlays, tasks, notify, openPanel, restorePanel: vi.fn(),
    enabledClientPlugins: () => [], getSize: () => 'auto', getFilter: () => 'auto', now: opts.now,
    createSessions: d => { managerDeps = d; return manager; },
    wireTasks: d => { const api = fakeApi(); apis.set(d.characterId()!, api); wired.set(d.characterId()!, d); return api; }
  };
  /** The deps each runtime was wired with, so a test can call the `relogin` the stage passed. */
  const wired = new Map<string, Parameters<NonNullable<StageDeps['wireTasks']>>[0]>();
  const stage = createStage(deps);
  stages.push(stage);
  /** Boots a session the way the manager would: it exists, then it is ready. */
  const ready = (session: CharacterSession): void => { sessions.set(session.id, session); managerDeps!.onReady(session); };
  const change = (): void => managerDeps!.onChange(manager.list());
  const show = (id: string | null): void => { activeId = id; change(); };
  const setCached = (list: CharacterSummary[]): void => { cached = list; };
  const failActivate = (err: Error | null): void => { activateError = err; };
  const refuseLogin = (reason: string): void => { loginResult = { ok: false, code: -1, reason }; };
  return {
    stage, ready, change, show, setCached, failActivate, refuseLogin,
    closed, apis, wired, logins, title, tabs, overlays, notify, tasks, openPanel
  };
}

describe('createStage', () => {
  // The Characters panel is gone (G5) and its list is a section of Account, so that is where the
  // plus tab has to send a player who wants another character. `PanelId` no longer holds
  // `characters`, which is the compile error that found this site; nothing asserted where it went.
  test('the plus tab opens the Account panel, which is where the character list lives', () => {
    const { stage, tabs, openPanel } = build();
    stage.renderTabs();
    tabs.querySelector<HTMLButtonElement>('[data-char-tab-new]')!.click();
    expect(openPanel).toHaveBeenCalledWith('account');
  });

  test('close(id) disposes that session\'s runtime and unwires its hooks, leaving the others alone', () => {
    const { stage, ready, closed, apis } = build();
    const a = fakeSession('a', 'online');
    const b = fakeSession('b', 'title');
    ready(a);
    ready(b);
    expect(a.handlers).toBeGreaterThan(0);
    stage.close('a');
    expect(apis.get('a')!.dispose).toHaveBeenCalledTimes(1);
    expect(a.handlers).toBe(0);
    expect(closed).toEqual(['a']);
    expect(apis.get('b')!.dispose).not.toHaveBeenCalled();
    expect(b.handlers).toBeGreaterThan(0);
  });

  test('closeAll disposes every runtime', () => {
    const { stage, ready, closed, apis } = build();
    ready(fakeSession('a', 'online'));
    ready(fakeSession('b', 'title'));
    stage.closeAll();
    expect(apis.get('a')!.dispose).toHaveBeenCalledTimes(1);
    expect(apis.get('b')!.dispose).toHaveBeenCalledTimes(1);
    expect(closed.sort()).toEqual(['a', 'b']);
    expect(stage.activeTasks()).toBeNull();
  });

  test('each runtime stays attached to the router for as long as its tab lives', () => {
    const { stage, ready, show, change, apis, tasks } = build();
    ready(fakeSession('a', 'online'));
    ready(fakeSession('b', 'title'));
    // The router subscribes once per runtime, however often the stage re-renders.
    change();
    change();
    expect(apis.get('a')!.onStatus).toHaveBeenCalledTimes(1);
    expect(apis.get('b')!.onStatus).toHaveBeenCalledTimes(1);
    show('a');
    expect(tasks.current()).toBe(apis.get('a'));
    show('b');
    expect(tasks.current()).toBe(apis.get('b'));
    expect(stage.activeTasks()).toBe(apis.get('b'));
    stage.close('b');
    // Closed means gone from the router as well as disposed: nothing routes to a dead runtime.
    expect(apis.get('b')!.subscribers).toBe(0);
    expect(tasks.current()).toBeNull();
    show('a');
    expect(tasks.current()).toBe(apis.get('a'));
  });

  test('syncChrome writes the title for an online session and clears it for one on the title screen', () => {
    const { stage, ready, title, overlays } = build();
    const online = fakeSession('a', 'online');
    const idle = fakeSession('b', 'title');
    ready(online);
    ready(idle);
    stage.syncChrome(online);
    expect(title.textContent).toBe(siteLabel('name_a'));
    // An online session says nothing on the status pill: the pairing pill is a node of its own,
    // painted from the pairing store, and the literal that used to be written here was a claim
    // about Claude that this function had no way of knowing (plan ruling R6).
    expect(overlays.setStatus).toHaveBeenLastCalledWith('', 'muted');
    stage.syncChrome(idle);
    expect(title.textContent).toBe('');
    expect(overlays.setStatus).toHaveBeenLastCalledWith('press Login to play', 'muted');
    expect(overlays.setXpLine).toHaveBeenLastCalledWith(null);
  });

  test('syncChrome gives an offline session its own reconnect line', () => {
    const { stage, ready, title, overlays } = build();
    const dropped = fakeSession('a', 'offline');
    ready(dropped);
    stage.syncChrome(dropped);
    expect(title.textContent).toBe('');
    expect(overlays.setStatus).toHaveBeenLastCalledWith('offline · press Login to reconnect', 'muted');
  });

  test('close re-syncs the chrome: closing the last tab leaves no title or status behind', () => {
    const { stage, ready, show, title, overlays } = build();
    const a = fakeSession('a', 'online');
    ready(a);
    show('a');
    stage.syncChrome(a);
    expect(title.textContent).toBe(siteLabel('name_a'));
    stage.close('a');
    expect(title.textContent).toBe('');
    expect(overlays.setStatus).toHaveBeenLastCalledWith('', 'muted');
    expect(overlays.setXpLine).toHaveBeenLastCalledWith(null);
  });

  test('close re-syncs the chrome onto whichever session is active afterwards', () => {
    const { stage, ready, show, title } = build();
    ready(fakeSession('a', 'online'));
    const b = fakeSession('b', 'online');
    ready(b);
    show('b');
    stage.close('a');
    expect(title.textContent).toBe(siteLabel('name_b'));
  });

  test('setCharacters is what the tab strip renders, so a character created in the panel gets a tab', () => {
    const { stage, ready, tabs } = build();
    ready(fakeSession('a', 'online'));
    stage.renderTabs();
    expect(tabs.querySelectorAll('[data-char-tab]')).toHaveLength(1);
    stage.setCharacters([
      { id: 'a', gameName: 'name_a', createdAt: 1, lastLoginAt: null },
      { id: 'c', gameName: 'name_c', createdAt: 2, lastLoginAt: null }
    ]);
    expect(tabs.querySelectorAll('[data-char-tab]')).toHaveLength(2);
  });

  test('opening a tab never rebuilds the roster from a stale cache', async () => {
    const { stage, ready, tabs, setCached } = build();
    ready(fakeSession('a', 'online'));
    // The home controller still remembers a character the panel has just deleted.
    setCached([
      { id: 'a', gameName: 'name_a', createdAt: 1, lastLoginAt: null },
      { id: 'b', gameName: 'name_b', createdAt: 2, lastLoginAt: null }
    ]);
    stage.setCharacters([{ id: 'a', gameName: 'name_a', createdAt: 1, lastLoginAt: null }]);
    expect(tabs.querySelectorAll('[data-char-tab]')).toHaveLength(1);
    await stage.selectCharacter('a');
    expect(tabs.querySelectorAll('[data-char-tab]')).toHaveLength(1);
  });

  test('setCharacters carries the limit reported with the listing into the slot count', () => {
    const { stage, ready, tabs } = build();
    ready(fakeSession('a', 'online'));
    stage.setCharacters([{ id: 'a', gameName: 'name_a', createdAt: 1, lastLoginAt: null }], 2);
    expect(tabs.querySelectorAll('[data-char-tab-new]')).toHaveLength(1);
    expect(tabs.querySelectorAll('[data-char-tab-locked]')).toHaveLength(1);
  });

  test('activate points the chrome at whichever session ended up active', async () => {
    const { stage, ready, title } = build();
    ready(fakeSession('a', 'online'));
    await stage.activate('a');
    expect(title.textContent).toContain('name_a');
  });

  test('a select that lost its session to a delete re-renders the strip without a toast', async () => {
    const { stage, ready, failActivate, notify, tabs } = build();
    ready(fakeSession('a', 'online'));
    stage.setCharacters([{ id: 'a', gameName: 'name_a', createdAt: 1, lastLoginAt: null }]);
    // Deleting a character whose frame is still booting closes the session, and the manager
    // rejects the in-flight open with exactly this message. That is the delete working, not a
    // failure the player has to read about.
    failActivate(new Error('session closed'));
    await stage.selectCharacter('a');
    expect(notify).not.toHaveBeenCalled();
    expect(tabs.querySelectorAll('[data-char-tab]')).toHaveLength(1);
  });

  test('any other activate failure is still a toast', async () => {
    const { stage, ready, failActivate, notify } = build();
    ready(fakeSession('a', 'online'));
    failActivate(new Error('The game client did not start.'));
    await stage.selectCharacter('a');
    expect(notify).toHaveBeenCalledWith('The game client did not start.', 'error');
  });

  test('each runtime re-logs in through the session manager, for its own character', async () => {
    const { ready, wired, logins } = build();
    ready(fakeSession('a', 'online'));
    ready(fakeSession('b', 'title'));
    expect(await wired.get('b')!.relogin()).toEqual({ ok: true });
    // The manager, not `hooks.loginArmed()`: it refuses a second login while one is in flight and
    // reports success for a session already online, neither of which the client knows. And it is
    // bound to THIS session, so a run recovers the character it started on.
    expect(logins).toEqual(['b']);
  });

  // The runtime writes the name onto every run summary it stores, so a history row read a month
  // later names the character rather than a document id. It comes off THIS session's character.
  test('each runtime is wired with its own character name', () => {
    const { ready, wired } = build();
    ready(fakeSession('a', 'online'));
    ready(fakeSession('b', 'online'));
    expect(wired.get('a')!.characterName()).toBe('name_a');
    expect(wired.get('b')!.characterName()).toBe('name_b');
  });

  test('a login the session manager refuses comes back as a reason, not a rejection', async () => {
    const { ready, wired, refuseLogin } = build();
    ready(fakeSession('a', 'online'));
    refuseLogin('Login already in progress.');
    expect(await wired.get('a')!.relogin()).toEqual({ ok: false, reason: 'Login already in progress.' });
  });

  test('Escape inside a frame reaches the parent document, and stops when the tab closes', () => {
    const { stage, ready } = build();
    const a = fakeSession('a', 'online');
    // `contentDocument` only exists once the iframe is in a document.
    document.body.appendChild(a.iframe);
    ready(a);
    const seen: string[] = [];
    const onKey = (e: Event): void => { seen.push((e as KeyboardEvent).key); };
    document.addEventListener('keydown', onKey);
    const inner = a.iframe.contentDocument!;
    const escape = (): void => {
      inner.dispatchEvent(new inner.defaultView!.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    };
    try {
      escape();
      // The run banner's panic key listens on the parent document; a keydown in the iframe
      // never crosses the frame boundary on its own.
      expect(seen).toEqual(['Escape']);
      stage.close('a');
      escape();
      expect(seen).toEqual(['Escape']);
    } finally {
      document.removeEventListener('keydown', onKey);
      a.iframe.remove();
    }
  });

  test('the reserved width constants match the geometry tokens', () => {
    // node:path, not `new URL(..., import.meta.url)`: jsdom's global URL is not the class
    // node:fs accepts, which is the same trap styles/bank.test.ts records at its head.
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, '../styles/tokens.css'), 'utf8');
    // Mutation target: bumping --panel-w in tokens.css without bumping PANEL_W must fail here.
    expect(css).toContain(`--panel-w: ${PANEL_W}px`);
    expect(css).toContain(`--strip-w: ${STRIP_W}px`);
  });
});

// The online timer (Task 18). One interval for the whole strip, and it patches the status span
// rather than re-rendering the strip, which would blow away focus and the roving tabindex.
describe('the tab clock', () => {
  const statusOf = (tabs: HTMLElement): HTMLElement => tabs.querySelector<HTMLElement>('[data-char-tab="a"] [data-tab-status]')!;

  test('repaints an online tab once a second, in place', () => {
    vi.useFakeTimers();
    try {
      let now = 5_000;
      const { stage, ready, tabs } = build({ now: () => now });
      ready(fakeSession('a', 'online', 1_000));
      stage.renderTabs();
      const status = statusOf(tabs);
      // `render` paints the clock itself, so the word `online` is never on screen.
      expect(status.textContent).toBe('0:04');
      now = 65_000;
      vi.advanceTimersByTime(1000);
      expect(statusOf(tabs)).toBe(status);
      expect(status.textContent).toBe('1:04');
    } finally {
      vi.useRealTimers();
    }
  });

  test('dispose stops the clock, and nothing repaints after it', () => {
    vi.useFakeTimers();
    try {
      let now = 5_000;
      const { stage, ready, tabs } = build({ now: () => now });
      ready(fakeSession('a', 'online', 1_000));
      stage.renderTabs();
      const status = statusOf(tabs);
      stage.dispose();
      now = 65_000;
      vi.advanceTimersByTime(5000);
      expect(status.textContent).toBe('0:04');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
