import { byId, hide, show, toggleVisible } from '../dom';
import type { AppState, CharacterSummary, Identity } from '../types';
import { checkName, createCharacter, friendlyCharacterError, listCharacters } from './api';

export interface GateDeps {
  idToken(): Promise<string>;
  /** Characters plus the character just created, if the gate created it. */
  onReady(characters: CharacterSummary[], chosen: CharacterSummary, created: boolean): void;
  /**
   * Reports a failure the gate screen cannot show itself, because it happened before the screen
   * was ever shown (a failed listing). The caller is responsible for putting the message
   * somewhere the player is actually looking.
   */
  onError(message: string): void;
  setState(s: AppState): void;
}

export interface CharactersGate {
  enter(identity: Identity): Promise<void>;
  cached(): CharacterSummary[];
  /** The account's server-side character limit; 0 before the first successful listing. */
  limit(): number;
  refresh(): Promise<CharacterSummary[]>;
}

const LIST_FAILED = 'Could not load your characters. Check your connection and try again.';
const CHECK_DEBOUNCE_MS = 300;

/**
 * The gate every signed-in user passes through before the client boots: it lists the account's
 * characters and either hands the first one straight to `onReady` (the common case) or shows
 * the naming form. Guests name their character exactly like registered users do -- whenever an
 * account has no character, whoever is signing in picks the name themselves.
 */
export function createCharactersGate(root: HTMLElement, deps: GateDeps): CharactersGate {
  const q = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#${id}`) ?? byId<T>(id);
  let cached: CharacterSummary[] = [];
  let limit = 0;
  let checkTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped per keystroke; a check whose id is stale by the time it resolves is discarded. */
  let checkSeq = 0;

  function setError(msg: string | null): void {
    const el = q('char-create-error');
    el.textContent = msg ?? '';
    if (msg) show(el); else hide(el);
  }

  /** Creates a character; resolves to a player-facing error message, or null on success. */
  async function create(name: string): Promise<string | null> {
    toggleVisible(q('char-busy'), true);
    try {
      const created = await createCharacter(await deps.idToken(), name);
      cached = [...cached, created];
      deps.onReady(cached, created, true);
      return null;
    } catch (err) {
      return friendlyCharacterError((err as Error).message);
    } finally {
      toggleVisible(q('char-busy'), false);
    }
  }

  /**
   * Resolves one availability check. `seq` is the keystroke it belongs to: responses can land
   * out of order, and writing a late one would report availability for a name the field no
   * longer holds, so anything superseded is dropped.
   */
  async function runCheck(value: string, seq: number): Promise<void> {
    if (!value) { if (seq === checkSeq) q('char-name-status').textContent = ''; return; }
    const token = await deps.idToken().catch(() => null);
    if (token === null) return;
    const r = await checkName(token, value).catch(() => null);
    if (seq !== checkSeq) return;
    q('char-name-status').textContent = !r ? '' : r.ok ? `${r.gameName} is available` : friendlyCharacterError(r.error);
  }

  q<HTMLFormElement>('char-create-form').addEventListener('submit', e => {
    e.preventDefault();
    setError(null);
    const name = q<HTMLInputElement>('char-name').value.trim();
    if (!name) { setError('Choose a name for your character.'); return; }
    void create(name).then(setError);
  });

  q<HTMLInputElement>('char-name').addEventListener('input', () => {
    if (checkTimer) clearTimeout(checkTimer);
    const value = q<HTMLInputElement>('char-name').value.trim();
    const seq = ++checkSeq;
    checkTimer = setTimeout(() => { void runCheck(value, seq); }, CHECK_DEBOUNCE_MS);
  });

  return {
    async enter(identity: Identity): Promise<void> {
      void identity;   // the gate no longer branches on who is signing in
      try {
        const listed = await listCharacters(await deps.idToken());
        cached = listed.characters;
        limit = listed.limit;
      } catch {
        // A transient 500/offline must not read as "brand-new account": showing the form from
        // here would offer a full account a character it cannot have.
        deps.onError(LIST_FAILED);
        return;
      }
      const first = cached[0];
      if (first) { deps.onReady(cached, first, false); return; }
      // Zero characters: guest or registered, the player names this one (owner requirement 1).
      setError(null);
      deps.setState('characters');
      q<HTMLInputElement>('char-name').focus();
    },
    cached: () => cached,
    limit: () => limit,
    async refresh(): Promise<CharacterSummary[]> {
      const listed = await listCharacters(await deps.idToken());
      cached = listed.characters;
      limit = listed.limit;
      return cached;
    }
  };
}
