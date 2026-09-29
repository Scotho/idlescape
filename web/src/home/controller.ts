import { byId, hide, show, toggleVisible } from '../dom';
import {
  attachEmail, currentIdToken, friendlyAuthError, onUserIdToken, resetPassword,
  signInEmail, signInGuest, signUpEmail
} from '../auth';
import { createCharactersGate } from '../characters/gate';
import { createConnectCard, type ConnectCard } from '../panels/connectCard';
import { pickSignupFn, submitEntrySignup } from '../entrySignup';
import type { AppState, CharacterSummary, Identity } from '../types';
import patchNotes from '../data/patchNotes.json';
import { createHomeView, type WorldStatus } from './view';

export interface HomeControllerDeps {
  /** Drives the screen switcher in `main.ts`. */
  setState(s: AppState): void;
  /** Mirrors the signed-in identity back to the composition root (shell re-init, panels). */
  onIdentity(identity: Identity | null): void;
  /** The game name of the running session, for the guest line in the identity strip. */
  gameName(): string | null;
  /** Hands the frame the account's characters and the one to open. */
  enterFrame(characters: CharacterSummary[], chosen: CharacterSummary, created: boolean): void;
}

export interface HomeController {
  /** Shows the home screen and starts listening for auth changes. Call once, at boot. */
  start(): void;
  setPlayers(status: WorldStatus): void;
  identity(): Identity | null;
  characters(): CharacterSummary[];
  refreshCharacters(): Promise<CharacterSummary[]>;
  /** The account's server-side character limit; 0 before the first successful listing. */
  characterLimit(): number;
  /** Tears down the pairing card; the frame calls it before leaving the home screen. */
  dismissConnect(): void;
}

const GUEST_UNAVAILABLE_MESSAGE = 'Guest play is unavailable right now. Sign in with email or try again.';
const CHOICE_BUTTONS = ['btn-guest', 'btn-show-login', 'btn-show-signup', 'btn-connect'];

/**
 * Owns everything between page load and a running client: the home screen's four
 * choices, the email forms, the Claude pairing card and the character gate. Nothing signs in
 * on its own any more -- a visitor stays signed out until they pick "Play as Guest", log in or
 * sign up, and every route out of here funnels through the characters gate.
 */
export function createHomeController(deps: HomeControllerDeps): HomeController {
  let identity: Identity | null = null;
  let connectCard: ConnectCard | null = null;
  /**
   * The uid we last handed to the gate. `onIdTokenChanged` also fires on hourly token refresh
   * and on a guest->email link (same uid), and re-entering the gate there would restart the
   * session under the player, so only a genuinely new uid gets handed over.
   */
  let gateUid: string | null = null;
  /** A guest sign-in started by "Connect to Claude" shows the pairing card, not the gate. */
  let pendingConnect = false;
  /** True from the moment a sign-in or a gate entry starts until the screen has moved on. */
  let busy = false;
  /** Single-flight guard for `gate.enter`, independent of the visual busy state. */
  let gateInFlight = false;

  const home = createHomeView(byId('screen-home'), {
    // Already signed in (e.g. a guest minted for the pairing card, then "Back"): go straight to
    // the gate. Calling signInAnonymously again would hand back the same user without firing
    // onIdTokenChanged, leaving the button stuck on "signing in…".
    onGuest: () => { if (busy) return; if (identity) enterGate(identity); else guestSignIn(false); },
    onShowLogin: () => home.setView('login'),
    onShowSignup: () => home.setView('signup'),
    onShowConnect: () => { if (busy) return; if (identity) showConnectCard(); else guestSignIn(true); },
    onBack: () => { dismissConnect(); home.setView('choices'); }
  });

  const gate = createCharactersGate(byId('screen-characters'), {
    idToken: currentIdToken,
    onReady: (all, chosen, created) => deps.enterFrame(all, chosen, created),
    onError: message => {
      // The gate never got far enough to show its own screen; put the failure where the player
      // is, and drop `gateUid` so the same user can retry from the choices row.
      gateUid = null;
      deps.setState('home');
      home.setView('choices');
      setBusy(false);
      home.setError(message);
    },
    setState: s => deps.setState(s)
  });

  /** One switch for "something is in flight": spinner on, choices unclickable. */
  function setBusy(value: boolean): void {
    busy = value;
    home.setBusy(value);
    setChoicesEnabled(!value);
  }

  /** Signs in anonymously; `forConnect` routes the resulting auth event to the pairing card. */
  function guestSignIn(forConnect: boolean): void {
    pendingConnect = forConnect;
    home.setError(null);
    setBusy(true);
    signInGuest().catch(() => {
      pendingConnect = false;
      setBusy(false);
      home.setError(GUEST_UNAVAILABLE_MESSAGE);
    });
  }

  function showConnectCard(): void {
    home.setView('connect');
    if (!connectCard) {
      connectCard = createConnectCard();
      byId('entry-connect-host').appendChild(connectCard.el);
    }
  }

  function dismissConnect(): void {
    connectCard?.dispose();
    connectCard = null;
    byId('entry-connect-host').innerHTML = '';
  }

  /**
   * Hands the current user to the characters gate, which decides form vs. straight to play.
   * Nothing is created here any more: since SP7 a guest names their own character on the same
   * form a registered user gets. The listing is still a round-trip during which the home screen
   * is on screen, so the entry stays single-flight and the choices stay disabled throughout: a
   * second click would otherwise list the account twice and race two `startSession` calls for
   * the same character against one `hooks.login`.
   */
  function enterGate(id: Identity): void {
    if (gateInFlight) return;
    gateInFlight = true;
    gateUid = id.uid;
    setBusy(true);
    void gate.enter(id).finally(() => { gateInFlight = false; });
  }

  function setChoicesEnabled(enabled: boolean): void {
    for (const id of CHOICE_BUTTONS) byId<HTMLButtonElement>(id).disabled = !enabled;
    toggleVisible('entry-checking', !enabled);
  }

  /** Identity strip + guest warning; reflects the currently signed-in identity. */
  function renderIdentityStrip(): void {
    const idEl = byId('entry-identity');
    const linkEl = byId<HTMLButtonElement>('entry-account-link');
    if (identity && !identity.isAnonymous) {
      idEl.textContent = identity.email ?? identity.displayName ?? '';
      linkEl.textContent = 'Switch account';
    } else {
      const name = deps.gameName();
      idEl.textContent = identity?.isAnonymous ? (name ? `Guest · ${name}` : 'Guest') : '';
      linkEl.textContent = 'Sign in with email';
    }
    show(linkEl);
    toggleVisible('entry-guest-warning', identity?.isAnonymous === true);
  }

  function onAuth(id: Identity | null): void {
    identity = id;
    deps.onIdentity(id);
    renderIdentityStrip();
    if (!id) {
      gateUid = null;
      pendingConnect = false;
      gateInFlight = false;
      dismissConnect();
      hide('entry-signup-success');
      deps.setState('home');
      home.setView('choices');
      setBusy(false);
      return;
    }
    home.setError(null);
    // The pairing card stands in for the gate for this uid: claim it, or the next id-token
    // refresh (hourly, same uid) would fall through to `enterGate` and start a session under
    // the card the player is still reading.
    if (pendingConnect) { pendingConnect = false; gateUid = id.uid; setBusy(false); showConnectCard(); return; }
    // Straight from the sign-in round-trip into the gate round-trip: stay busy rather than
    // flashing the choices back on between the two.
    if (id.uid !== gateUid) { enterGate(id); return; }
    // A token refresh for the uid already in the gate must not re-enable the choices under it.
    if (!gateInFlight) setBusy(false);
  }

  function wireForms(): void {
    byId('entry-account-link').addEventListener('click', () => home.setView('login'));
    byId('btn-entry-back').addEventListener('click', () => { dismissConnect(); home.setView('choices'); });
    byId('btn-connect-login').addEventListener('click', () => {
      if (busy) return;
      if (identity) enterGate(identity); else guestSignIn(false);
    });
    byId<HTMLFormElement>('signin-form').addEventListener('submit', e => {
      e.preventDefault();
      signInEmail(byId<HTMLInputElement>('signin-email').value, byId<HTMLInputElement>('signin-password').value)
        .catch(err => setError('signin-error', friendlyAuthError(err)));
    });
    byId<HTMLFormElement>('signup-form').addEventListener('submit', e => { e.preventDefault(); void onSignup(); });
    byId('btn-forgot').addEventListener('click', () => {
      const email = byId<HTMLInputElement>('signin-email').value;
      if (!email) { setError('signin-error', 'Enter your email first.'); return; }
      resetPassword(email)
        .then(() => { const n = byId('signin-notice'); n.textContent = 'Check your email for a reset link.'; show(n); })
        .catch(err => setError('signin-error', friendlyAuthError(err)));
    });
  }

  /**
   * An anonymous guest's "Create account" links their credential (the character carries over,
   * spec 2.1); anyone else gets a fresh account. Either way `identity` must flip to the now
   * non-anonymous user, because linking keeps the same uid and `onAuthStateChanged` stays
   * silent for it.
   */
  async function onSignup(): Promise<void> {
    const form = byId<HTMLFormElement>('signup-form');
    const name = byId<HTMLInputElement>('signup-name').value;
    try {
      await submitEntrySignup(
        pickSignupFn(identity?.isAnonymous, attachEmail, signUpEmail),
        byId<HTMLInputElement>('signup-email').value,
        byId<HTMLInputElement>('signup-password').value,
        name,
        {
          setIdentity: id => { identity = id; deps.onIdentity(id); },
          renderIdentityStrip,
          closeForm: () => {
            home.setView('choices');
            form.reset();
            const success = byId('entry-signup-success');
            success.textContent = `Account created — signed in as ${name}.`;
            show(success);
          },
          clearError: () => setError('signup-error', null)
        }
      );
    } catch (err) {
      const message = (err as Error).message;
      setError('signup-error', message.startsWith('Display') ? message : friendlyAuthError(err));
    }
  }

  function setError(id: string, message: string | null): void {
    const el = byId(id);
    el.textContent = message ?? '';
    el.classList.toggle('hidden', message === null);
  }

  wireForms();

  return {
    start(): void {
      deps.setState('home');
      home.setView('choices');
      home.renderPatchNotes(patchNotes);
      setChoicesEnabled(false);
      onUserIdToken(onAuth);
    },
    setPlayers: status => home.setPlayers(status),
    identity: () => identity,
    characters: () => gate.cached(),
    refreshCharacters: () => gate.refresh(),
    characterLimit: () => gate.limit(),
    dismissConnect
  };
}
