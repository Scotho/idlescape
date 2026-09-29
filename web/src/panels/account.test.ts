import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createAccountPanel, manifest, setAccountError, type AccountDeps } from './account';
import * as api from '../characters/api';
import type { Identity } from '../types';

// The composed panel mounts the character section, which lists on mount. The section's own
// fifteen cases are account.characters.test.ts; here it only has to be present and quiet.
vi.mock('../characters/api', async importOriginal => {
  const actual = await importOriginal<typeof api>();
  return { ...actual, listCharacters: vi.fn(), createCharacter: vi.fn(), deleteCharacter: vi.fn() };
});
const listCharacters = vi.mocked(api.listCharacters);

const flush = () => new Promise(r => setTimeout(r, 0));

function fakeDeps(identity: Identity | null, overrides: Partial<AccountDeps> = {}): AccountDeps {
  return {
    identity: () => identity,
    signOut: vi.fn(async () => {}),
    attachEmail: vi.fn(async () => ({})),
    characters: {
      idToken: async () => 'token',
      isAnonymous: () => identity?.isAnonymous ?? true,
      active: () => null,
      stateOf: () => null,
      openTab: vi.fn(async () => {}),
      closeTab: vi.fn(),
      onListChanged: vi.fn(),
      reauth: vi.fn(async () => {})
    },
    ...overrides
  };
}

const BOB: Identity = { uid: 'u1', isAnonymous: false, email: 'a@b.com', displayName: 'Bob' };
const GUEST: Identity = { uid: 'u2', isAnonymous: true, email: null, displayName: null };

describe('createAccountPanel', () => {
  beforeEach(() => { listCharacters.mockResolvedValue({ characters: [{ id: 'c1', gameName: 'al', createdAt: 1, lastLoginAt: null }], limit: 3 }); });
  afterEach(() => { document.body.innerHTML = ''; vi.resetAllMocks(); });

  test('manifest is the account shell panel', () => {
    expect(manifest).toEqual({ id: 'account', name: 'Account', icon: 'account', tier: 'shell' });
  });

  test('renders the signed-in display name', () => {
    const view = createAccountPanel(fakeDeps(BOB));
    const body = document.createElement('div');
    view.mount(body);
    expect(body.textContent).toContain('Bob');
  });

  // `#account-error` is an `.alert alert-error` since Task 3 retired `.p-error`, and an `.alert`
  // is a bordered block with a left rail: an empty one is a visible empty box, where the old bare
  // red sentence was invisible. So the box must start hidden and only appear with a message.
  test('the login error box stays hidden until a message is written to it', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    createAccountPanel(fakeDeps(BOB)).mount(host);
    const box = host.querySelector<HTMLElement>('#account-error')!;
    expect(box.className).toBe('alert alert-error hidden');

    setAccountError('That character is already signed in.');
    expect(box.classList.contains('hidden')).toBe(false);
    expect(box.textContent).toBe('That character is already signed in.');

    setAccountError(null);
    expect(box.classList.contains('hidden')).toBe(true);
    expect(box.textContent).toBe('');
  });

  test('a hostile displayName is escaped, not rendered as a live element (stored-XSS regression)', () => {
    // users/{uid} docs are world-readable to any authed user, so another player's
    // displayName is external input rendered here; it must land as escaped text.
    const hostile = '<img src=x onerror=alert(1)>';
    const view = createAccountPanel(fakeDeps({ ...BOB, displayName: hostile }));
    const body = document.createElement('div');
    view.mount(body);

    expect(body.querySelector('img')).toBeNull();
    expect(body.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(body.innerHTML).not.toContain('<img src=x');
  });

  // G5: the Characters panel is gone and its list is a section of this one. Without this case the
  // merge could be undone by deleting one line of `render` and nothing here would notice.
  test('the character list is a section of this panel, above the way out', async () => {
    const body = document.createElement('div');
    createAccountPanel(fakeDeps(BOB)).mount(body);
    await flush();
    expect(body.querySelector('[data-char-row="c1"]')).not.toBeNull();
    const signOut = body.querySelector<HTMLButtonElement>('#sign-out')!;
    expect(signOut.textContent).toBe('Sign out');
    expect(signOut.className).toBe('btn btn-lg btn-block');
    // Order matters: the way out is the last thing on the panel, under the characters.
    expect(body.querySelector('[data-char-row="c1"]')!.compareDocumentPosition(signOut) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('Sign out goes through the dependency rather than the auth module', () => {
    const deps = fakeDeps(BOB);
    const body = document.createElement('div');
    createAccountPanel(deps).mount(body);
    body.querySelector<HTMLButtonElement>('#sign-out')!.click();
    expect(deps.signOut).toHaveBeenCalled();
  });

  test('the guest attach form appears only for an anonymous identity', () => {
    const guestBody = document.createElement('div');
    createAccountPanel(fakeDeps(GUEST)).mount(guestBody);
    expect(guestBody.querySelector('#attach-form')).not.toBeNull();
    expect(guestBody.querySelector('.badge-warn')?.textContent).toBe('Guest');

    const emailBody = document.createElement('div');
    createAccountPanel(fakeDeps(BOB)).mount(emailBody);
    expect(emailBody.querySelector('#attach-form')).toBeNull();
    expect(emailBody.querySelector('.badge-ok')?.textContent).toBe('Email');
  });

  // The panel re-renders itself after a successful attach, and unmounts when the player closes it.
  // Either way the section it built must be released, or a listing in flight repaints an element
  // that is no longer on the page.
  test('unmount disposes the character section, and nothing lands in the body afterwards', async () => {
    let settle: (v: Awaited<ReturnType<typeof api.listCharacters>>) => void = () => {};
    listCharacters.mockReturnValue(new Promise(r => { settle = r; }));
    const body = document.createElement('div');
    const view = createAccountPanel(fakeDeps(BOB));
    view.mount(body);
    view.unmount!();
    settle({ characters: [{ id: 'c1', gameName: 'al', createdAt: 1, lastLoginAt: null }], limit: 3 });
    await flush(); await flush();
    expect(body.querySelector('[data-char-row]')).toBeNull();
  });
});
