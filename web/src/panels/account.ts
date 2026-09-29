// web/src/panels/account.ts -- the Account panel: who you are signed in as, the guest-to-email
// upgrade, your characters, and the way out. The character list moved in here from the Characters
// panel (G5) and lives in accountCharacters.ts, which is 200 lines on its own.
import { friendlyAuthError } from '../auth';
import { createCharacterSection, type CharacterSection, type CharacterSectionDeps } from './accountCharacters';
import { alert, badge, h, kv } from '../ui/el';
import type { PanelView, PluginManifest } from '../frame/panels';
import type { Identity } from '../types';

export const manifest = { id: 'account', name: 'Account', icon: 'account', tier: 'shell' } as const satisfies PluginManifest;

export interface AccountDeps {
  identity: () => Identity | null;
  signOut: () => Promise<void>;
  attachEmail: (email: string, password: string) => Promise<unknown>;
  /** Everything the character section talks to; it owns the characters API itself. */
  characters: CharacterSectionDeps;
}

/**
 * The guest-to-email form. Its own error line rather than `#account-error`: that box belongs to
 * the client host, which writes login rejections into it from outside this module.
 */
function attachForm(deps: AccountDeps, onAttached: () => void): HTMLElement {
  const email = h('input', { class: 'input', id: 'attach-email', type: 'email', placeholder: 'Email', autocomplete: 'email', required: true });
  const password = h('input', { class: 'input', id: 'attach-password', type: 'password', placeholder: 'Password (6 or more characters)', autocomplete: 'new-password', required: true });
  const error = h('div', { class: 'alert alert-error hidden', id: 'attach-error', 'aria-live': 'polite' });
  const form = h('form', { id: 'attach-form', class: 'stack' },
    email, password, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Attach email'), error);
  form.addEventListener('submit', e => {
    e.preventDefault();
    deps.attachEmail(email.value, password.value).then(
      () => onAttached(),
      err => { error.textContent = friendlyAuthError(err); error.classList.remove('hidden'); }
    );
  });
  return form;
}

export function createAccountPanel(deps: AccountDeps): PanelView {
  let section: CharacterSection | null = null;

  function render(body: HTMLElement): void {
    // A re-render after a successful attach builds a second section; the first one must go, or
    // its in-flight listing repaints an element that is no longer on screen.
    section?.dispose();
    const characters = createCharacterSection(deps.characters);
    section = characters;

    const identity = deps.identity();
    const isGuest = identity?.isAnonymous ?? true;
    const guest: HTMLElement[] = isGuest
      ? [alert('Guest progress lives in this browser. Attach an email to keep this character on any device.', { tone: 'warn' }), attachForm(deps, () => render(body))]
      : [];
    body.replaceChildren(
      kv('Signed in as', identity?.displayName ?? identity?.email ?? 'Guest'),
      kv('Account', badge(isGuest ? 'Guest' : 'Email', isGuest ? 'warn' : 'ok')),
      ...guest,
      characters.el,
      h('button', { class: 'btn btn-lg btn-block', id: 'sign-out', type: 'button', onclick: () => { void deps.signOut(); } }, 'Sign out'),
      h('div', { class: 'alert alert-error hidden', id: 'account-error', 'aria-live': 'polite' })
    );
    void characters.reload();
  }

  return {
    title: 'Account',
    mount(body: HTMLElement) { render(body); },
    unmount() { section?.dispose(); section = null; }
  };
}

/**
 * The client host writes login rejections here; no-op if the panel isn't mounted. The box is an
 * `.alert` now, which is a bordered block with a left rail rather than the retired `.p-error`'s
 * bare red sentence, so an empty one is a visible empty box: it carries `hidden` in the markup and
 * this toggles it, the way `#attach-error` and the character section's `#char-panel-error` do.
 */
export function setAccountError(message: string | null): void {
  const el = document.getElementById('account-error');
  if (!el) return;
  el.textContent = message ?? '';
  el.classList.toggle('hidden', !message);
}
