// One character's client session as the shell sees it (SP7): the iframe, the hooks its realm
// installs, and the five-state lifecycle derived from what the client reports. `deriveSessionState`
// is the one place the states come from, so the manager, the tab strip and the Characters panel
// never disagree about what "connecting" means.
import type { ClientHooks } from '../clientTypes';
import type { CharacterSummary } from '../types';

/** Internal lifecycle of one character's client. */
export type SessionState = 'booting' | 'title' | 'connecting' | 'online' | 'offline';
/** What the tab strip and the Characters panel actually show. */
export type SessionStatus = 'offline' | 'connecting' | 'online';

export interface CharacterSession {
  readonly id: string;
  character: CharacterSummary;
  iframe: HTMLIFrameElement;
  /** Null until the iframe's client has installed its hooks. */
  hooks: ClientHooks | null;
  state: SessionState;
  startedAt: number;
  lastStateAt: number;
  /**
   * When this character last came ONLINE, or null while it is not. Distinct from `startedAt`,
   * which is when the iframe object was created, in state `booting`: the tab's clock is an
   * online timer, so a frame parked on the title screen must read nothing, not two hours.
   * Frame-local and never persisted: a reload restarting the clock is correct, the session did
   * restart.
   */
  onlineSince: number | null;
}

export interface SessionInputs {
  /** The iframe's `window.idlescape.client` is present. */
  hooks: boolean;
  /** `getState().loggedIn`. */
  loggedIn: boolean;
  /** A `loginArmed()` call has not settled yet. */
  pendingLogin: boolean;
  /** The `disconnect` hook event fired and no `login`/`logout` has cleared it. */
  disconnected: boolean;
}

/**
 * The one place the five states come from. `loggedIn` is authoritative because it is polled
 * from the client itself; the flags only decide how a *not* logged-in session is described.
 */
export function deriveSessionState(i: SessionInputs): SessionState {
  if (!i.hooks) return 'booting';
  if (i.loggedIn) return 'online';
  if (i.pendingLogin) return 'connecting';
  if (i.disconnected) return 'offline';
  return 'title';
}

export function displayStatus(s: SessionState): SessionStatus {
  if (s === 'online') return 'online';
  if (s === 'connecting') return 'connecting';
  return 'offline';
}
