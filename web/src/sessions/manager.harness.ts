// web/src/sessions/manager.harness.ts -- the scripted client and the manager builder both session
// manager suites share.
//
// `manager.test.ts` (lifecycle, polling, boot and teardown) and `manager.login.test.ts` (login,
// logout, reconnect) were one 396-line file before Task 18 added the online stamp. They split, and
// the fake client is the one thing they both need: it is a full `ClientHooks` with a real event
// table, so a handler the manager subscribes and never releases is observable rather than silent.
import { createSessionManager, type CharacterSessionManager } from './manager';
import type { CharacterSession } from './types';
import type { ClientHooks, ClientState, HookEvents, LoginResult } from '../clientTypes';
import type { CharacterSummary } from '../types';

export const character = (id: string, gameName: string): CharacterSummary => ({ id, gameName, createdAt: 1, lastLoginAt: null });

export type Creds = { gameName: string; secret: string };

export interface FakeClient {
  hooks: ClientHooks;
  emit<E extends keyof HookEvents>(event: E, payload: HookEvents[E]): void;
  loggedIn: boolean;
  armed: [string, string, string | undefined][];
  suspended: boolean[];
  attended: boolean[];
  loginArmedCalls: number;
  loginResult: LoginResult;
  logoutCalls: number;
}

export function fakeClient(): FakeClient {
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  const self: FakeClient = {
    loggedIn: false, armed: [], suspended: [], attended: [], loginArmedCalls: 0, logoutCalls: 0,
    loginResult: { ok: true },
    emit: (event, payload) => { for (const h of handlers.get(event as string) ?? []) h(payload); },
    hooks: {
      login: () => Promise.resolve<LoginResult>({ ok: true }),
      armLogin: (gameName: string, secret: string, label?: string) => { self.armed.push([gameName, secret, label]); },
      loginArmed: () => { self.loginArmedCalls++; return Promise.resolve(self.loginResult); },
      logout: () => { self.logoutCalls++; self.loggedIn = false; self.emit('logout', {}); },
      setRenderSuspended: (v: boolean) => { self.suspended.push(v); },
      setAttended: (v: boolean) => { self.attended.push(v); },
      echoChat: () => {},
      getState: () => ({ loggedIn: self.loggedIn } as ClientState),
      getObjName: () => null,
      getWorldState: () => { throw new Error('unused'); },
      dispatch: () => { throw new Error('unused'); },
      on: (event: string, handler: (p: unknown) => void) => {
        const set = handlers.get(event) ?? new Set();
        set.add(handler);
        handlers.set(event, set);
        return () => set.delete(handler);
      }
    } as unknown as ClientHooks
  };
  return self;
}

/** A real <iframe> (so appendChild works in jsdom) with a scripted contentWindow. */
export function frameFor(client: FakeClient, readyAfterMs: number): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  const start = Date.now();
  Object.defineProperty(iframe, 'contentWindow', {
    get: () => (Date.now() - start >= readyAfterMs ? { idlescape: { client: client.hooks }, focus: () => {} } : {})
  });
  return iframe;
}

export interface BuildOpts {
  /** Per-client boot delay; a bare number applies to all of them. Default 0, ready immediately. */
  readyAfterMs?: number | Record<string, number>;
  readyTimeoutMs?: number;
  mintSession?: (id: string) => Promise<Creds>;
  /** The manager's clock. The online stamp reads it, so a suite that asserts one drives it. */
  now?: () => number;
}

export interface Built {
  manager: CharacterSessionManager;
  changes: CharacterSession[][];
  ready: string[];
}

export function buildManager(host: HTMLElement, clients: Record<string, FakeClient>, opts: BuildOpts = {}): Built {
  const changes: CharacterSession[][] = [];
  const ready: string[] = [];
  const after = opts.readyAfterMs ?? 0;
  const delay = (id: string): number => (typeof after === 'number' ? after : after[id]);
  const manager = createSessionManager({
    host,
    createFrame: c => frameFor(clients[c.id], delay(c.id)),
    mintSession: opts.mintSession ?? (async id => ({ gameName: `name_${id}`, secret: `s_${id}` })),
    onReady: s => { ready.push(s.id); },
    onChange: s => { changes.push(s); },
    pollMs: 1000,
    readyTimeoutMs: opts.readyTimeoutMs,
    now: opts.now
  });
  manager.setCharacters(Object.keys(clients).map(id => character(id, `name_${id}`)));
  return { manager, changes, ready };
}
