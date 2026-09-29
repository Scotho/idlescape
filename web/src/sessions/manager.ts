// The character session manager (SP7): one same-origin `<iframe src="/play.html">` per open
// character, each running its own client whose realm installs `window.idlescape.client`.
//
// It owns the iframe's whole life — create, wait for hooks, mint and arm credentials, show or
// hide, log in, close — and derives each session's `SessionState` from what the client reports,
// polled once a second. It has no UI: the tab strip, the composition root, the Characters
// panel and the tasks router all consume it through `CharacterSessionManager`.
import type { ClientHooks, ClientPluginRegistry, LoginResult } from '../clientTypes';
import type { CharacterSummary } from '../types';
import { deriveSessionState, type CharacterSession, type SessionState } from './types';

export const READY_TIMEOUT_MESSAGE = 'The game client did not start. Reload the page and try again.';
/** Why an in-flight `open` rejects when a `close`/`dispose` overtook it. Not a failure to report. */
export const SESSION_CLOSED_MESSAGE = 'session closed';
/** What a `login` gets while an earlier one on the same character has not settled. */
export const LOGIN_IN_PROGRESS_MESSAGE = 'Login already in progress.';
const PLAY_URL = '/play.html';
const READY_POLL_MS = 50;
const DEFAULT_POLL_MS = 1000;
const DEFAULT_READY_TIMEOUT_MS = 30_000;

/** The realm inside one client iframe. */
export type ClientFrameWindow = Window & { idlescape?: { client?: ClientHooks | null; plugins?: ClientPluginRegistry | null } };

export interface SessionManagerDeps {
  host: HTMLElement;
  mintSession(characterId: string): Promise<{ gameName: string; secret: string }>;
  /** Called once per session, as soon as its hooks exist and its credentials are armed. */
  onReady(session: CharacterSession): void;
  onChange(sessions: CharacterSession[]): void;
  /** Testing seam; the default creates a real `<iframe src="/play.html">`. */
  createFrame?(character: CharacterSummary): HTMLIFrameElement;
  now?(): number;
  pollMs?: number;
  readyTimeoutMs?: number;
}

export interface CharacterSessionManager {
  /** The account's live characters; `activate` opens an unopened one from this roster. */
  setCharacters(characters: CharacterSummary[]): void;
  open(character: CharacterSummary): Promise<CharacterSession>;
  activate(characterId: string): Promise<CharacterSession | null>;
  login(characterId: string): Promise<LoginResult>;
  close(characterId: string): void;
  get(characterId: string): CharacterSession | undefined;
  list(): CharacterSession[];
  active(): CharacterSession | null;
  activeId(): string | null;
  states(): Record<string, SessionState>;
  dispose(): void;
}

interface Entry {
  session: CharacterSession;
  pendingLogin: boolean;
  disconnected: boolean;
  /** Set by `close`/`dispose`; an in-flight `open` checks it after every await. */
  cancelled: boolean;
  unsubscribe: () => void;
}

export function frameWindow(session: CharacterSession | null): ClientFrameWindow | null {
  return (session?.iframe.contentWindow as ClientFrameWindow | null) ?? null;
}

export function createSessionManager(deps: SessionManagerDeps): CharacterSessionManager {
  const entries = new Map<string, Entry>();
  const opening = new Map<string, Promise<CharacterSession>>();
  /** Characters the account owns, so `activate` can open one that has never been opened. */
  const roster = new Map<string, CharacterSummary>();
  const now = deps.now ?? (() => Date.now());
  const pollMs = deps.pollMs ?? DEFAULT_POLL_MS;
  const readyTimeoutMs = deps.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  let activeId: string | null = null;
  /** The id of the most recent `activate` call, so an older one that finishes later stands down. */
  let wanted: string | null = null;

  const defaultFrame = (character: CharacterSummary): HTMLIFrameElement => {
    const iframe = document.createElement('iframe');
    iframe.src = PLAY_URL;
    iframe.title = `${character.gameName} game view`;
    // The Config panel's fullscreen button asks for the frame itself; without this permission
    // the browser refuses silently.
    iframe.allow = 'fullscreen';
    return iframe;
  };
  const makeFrame = deps.createFrame ?? defaultFrame;

  function emit(): void {
    deps.onChange(list());
  }

  function list(): CharacterSession[] {
    return [...entries.values()].map(e => e.session).sort((a, b) => a.character.createdAt - b.character.createdAt);
  }

  /** Recomputes one session's state; returns true when it moved. */
  function refresh(entry: Entry): boolean {
    const next = deriveSessionState({
      hooks: entry.session.hooks !== null,
      loggedIn: entry.session.hooks?.getState().loggedIn ?? false,
      pendingLogin: entry.pendingLogin,
      disconnected: entry.disconnected
    });
    if (next === entry.session.state) return false;
    entry.session.state = next;
    entry.session.lastStateAt = now();
    // The single authority for the tab's online clock. No `state !== 'online'` guard: `refresh`
    // returned early two lines up when the state had not moved, so reaching here IS the proof
    // that a transition happened, and such a guard would always be false. The `login`, `logout`
    // and `disconnect` hooks and the 1 s poll all come through here, which covers a client that
    // was already in game when the frame attached as well.
    entry.session.onlineSince = next === 'online' ? now() : null;
    return true;
  }

  function refreshAll(): void {
    let moved = false;
    for (const entry of entries.values()) moved = refresh(entry) || moved;
    if (moved) emit();
  }

  const poll = setInterval(refreshAll, pollMs);

  /**
   * Polls `contentWindow` rather than listening for `idlescape:client-ready`: the iframe's window
   * is replaced during navigation, so a listener attached before the document exists is lost.
   */
  function waitForHooks(entry: Entry): Promise<ClientHooks> {
    const deadline = now() + readyTimeoutMs;
    return new Promise<ClientHooks>((resolve, reject) => {
      const tick = (): void => {
        if (entry.cancelled) { reject(new Error(SESSION_CLOSED_MESSAGE)); return; }
        const hooks = frameWindow(entry.session)?.idlescape?.client ?? null;
        if (hooks) { resolve(hooks); return; }
        if (now() > deadline) { reject(new Error(READY_TIMEOUT_MESSAGE)); return; }
        setTimeout(tick, READY_POLL_MS);
      };
      tick();
    });
  }

  function subscribe(entry: Entry, hooks: ClientHooks): void {
    const offs = [
      hooks.on('login', () => { entry.disconnected = false; entry.pendingLogin = false; if (refresh(entry)) emit(); }),
      hooks.on('logout', () => { entry.disconnected = false; entry.pendingLogin = false; if (refresh(entry)) emit(); }),
      hooks.on('disconnect', () => { entry.disconnected = true; if (refresh(entry)) emit(); })
    ];
    entry.unsubscribe = () => { for (const off of offs) off(); };
  }

  /** Drops an entry's iframe and bookkeeping; the caller decides what becomes active. */
  function remove(entry: Entry): void {
    const id = entry.session.id;
    entry.cancelled = true;
    entry.unsubscribe();
    entry.session.iframe.remove();
    entries.delete(id);
    // A doomed in-flight open must not be handed to the next open/activate of the same id.
    opening.delete(id);
  }

  /** `remove`, then hand the tab to the last remaining session if the dropped one held it. */
  function drop(entry: Entry): void {
    const id = entry.session.id;
    remove(entry);
    if (activeId === id) show(list().at(-1)?.id ?? null);
  }

  async function openInner(character: CharacterSummary): Promise<CharacterSession> {
    const iframe = makeFrame(character);
    iframe.className = 'client-frame hidden';
    iframe.dataset.character = character.id;
    const session: CharacterSession = {
      id: character.id, character, iframe, hooks: null,
      state: 'booting', startedAt: now(), lastStateAt: now(), onlineSince: null
    };
    const entry: Entry = { session, pendingLogin: false, disconnected: false, cancelled: false, unsubscribe: () => {} };
    entries.set(character.id, entry);
    deps.host.appendChild(iframe);
    emit();

    try {
      const hooks = await waitForHooks(entry);
      subscribe(entry, hooks);
      // The credentials never touch the iframe URL: they are handed straight across the same-origin
      // boundary, and the title screen's Login button is the only thing that uses them.
      const creds = await deps.mintSession(character.id);
      if (entry.cancelled) throw new Error(SESSION_CLOSED_MESSAGE);
      hooks.armLogin(creds.gameName, creds.secret, creds.gameName);
      // Published only now, so a `login()` during the mint window is refused rather than
      // running `loginArmed()` against a client that holds no credentials yet.
      session.hooks = hooks;
      // Every session is minded by the shell for its whole life (client patch 27).
      hooks.setAttended(true);
      hooks.setRenderSuspended(activeId !== character.id);
    } catch (err) {
      // A half-built session must not linger: a retry would find it and never re-arm it.
      if (!entry.cancelled) { drop(entry); emit(); }
      throw err;
    }
    refresh(entry);
    deps.onReady(session);
    emit();
    return session;
  }

  function open(character: CharacterSummary): Promise<CharacterSession> {
    const existing = entries.get(character.id);
    if (existing) return Promise.resolve(existing.session);
    const inFlight = opening.get(character.id);
    if (inFlight) return inFlight;
    // Only forget itself: a close() during boot may already have let a fresh open take the slot.
    const p: Promise<CharacterSession> = openInner(character).finally(() => {
      if (opening.get(character.id) === p) opening.delete(character.id);
    });
    // Callers that await `p` still see the rejection; this branch only keeps a close() during
    // boot, or a boot timeout nobody is waiting on, from surfacing as an unhandled rejection.
    p.catch(() => {});
    opening.set(character.id, p);
    return p;
  }

  function show(characterId: string | null): void {
    for (const entry of entries.values()) {
      const isActive = entry.session.id === characterId;
      entry.session.iframe.classList.toggle('hidden', !isActive);
      entry.session.hooks?.setRenderSuspended(!isActive);
    }
    activeId = characterId;
    if (characterId === null) return;
    const session = entries.get(characterId)?.session;
    const canvas = session?.iframe.contentDocument?.getElementById('canvas');
    frameWindow(session ?? null)?.focus?.();
    (canvas as HTMLElement | null)?.focus?.();
  }

  return {
    open,

    setCharacters(characters: CharacterSummary[]): void {
      roster.clear();
      for (const c of characters) {
        roster.set(c.id, c);
        const entry = entries.get(c.id);
        if (entry) entry.session.character = c;
      }
    },

    async activate(characterId: string): Promise<CharacterSession | null> {
      const known = entries.get(characterId)?.session ?? null;
      const character = roster.get(characterId);
      if (!known && !character) return null;
      wanted = characterId;
      // Lazily create the iframe on first activation (spec section 5, decision 1).
      const session = known ?? (await open(character!));
      // Last call wins: a slow boot must not steal the tab from a character chosen since.
      if (wanted !== characterId) return session;
      show(characterId);
      emit();
      return session;
    },

    login(characterId: string): Promise<LoginResult> {
      const entry = entries.get(characterId);
      const hooks = entry?.session.hooks;
      if (!entry || !hooks) return Promise.resolve<LoginResult>({ ok: false, code: -1, reason: READY_TIMEOUT_MESSAGE });
      // `loginArmed()` against a client that is already in game never settles (the title screen
      // is gone), so a session that is online reports success without touching the frame.
      if (refresh(entry)) emit();
      if (entry.session.state === 'online') return Promise.resolve<LoginResult>({ ok: true });
      // The client holds one `loginResolver`: a second `loginArmed()` overwrites it, and the
      // promise the first caller is awaiting would never settle. Refuse instead.
      if (entry.pendingLogin) return Promise.resolve<LoginResult>({ ok: false, code: -1, reason: LOGIN_IN_PROGRESS_MESSAGE });
      entry.pendingLogin = true;
      if (refresh(entry)) emit();
      return hooks.loginArmed().finally(() => {
        entry.pendingLogin = false;
        if (refresh(entry)) emit();
      });
    },

    close(characterId: string): void {
      const entry = entries.get(characterId);
      if (!entry) return;
      entry.session.hooks?.logout();
      drop(entry);
      emit();
    },

    get: id => entries.get(id)?.session,
    list,
    active: () => (activeId ? entries.get(activeId)?.session ?? null : null),
    activeId: () => activeId,
    states: () => Object.fromEntries(list().map(s => [s.id, s.state])),
    dispose(): void {
      clearInterval(poll);
      for (const entry of [...entries.values()]) remove(entry);
      activeId = null;
    }
  };
}
