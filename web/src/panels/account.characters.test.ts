// web/src/panels/account.characters.test.ts -- the character section of the Account panel.
//
// Moved wholesale from plugins/builtin/characters.test.ts when the Characters panel merged into
// Account (G5): the same fifteen cases, against `createCharacterSection(deps).el` instead of a
// plugin panel's `mount(body)`. The composed panel around it is account.test.ts.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createCharacterSection, type CharacterSectionDeps } from './accountCharacters';
import * as api from '../characters/api';

// The section's whole job is talking to the characters API; every test drives it through these.
vi.mock('../characters/api', async importOriginal => {
  const actual = await importOriginal<typeof api>();
  return { ...actual, listCharacters: vi.fn(), createCharacter: vi.fn(), deleteCharacter: vi.fn() };
});
const listCharacters = vi.mocked(api.listCharacters);
const createCharacter = vi.mocked(api.createCharacter);
const deleteCharacter = vi.mocked(api.deleteCharacter);

const chars = [{ id: 'c1', gameName: 'al', createdAt: 1, lastLoginAt: null }, { id: 'c2', gameName: 'bo', createdAt: 2, lastLoginAt: null }];
const alpha = { id: 'a', gameName: 'alpha', createdAt: 1, lastLoginAt: null };
const beta = { id: 'b', gameName: 'beta', createdAt: 2, lastLoginAt: null };
const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  vi.resetAllMocks();
  document.body.innerHTML = '';
  listCharacters.mockResolvedValue({ characters: chars, limit: 3 });
});

/**
 * Builds the section, puts its element on the page and starts the listing. `reload` is the panel's
 * job now, not the section's, so it is called here exactly where `mount()` used to call it.
 */
function mount(over: Partial<CharacterSectionDeps> = {}) {
  const deps = {
    idToken: async () => 'token',
    isAnonymous: () => false,
    active: () => null,
    stateOf: () => null,
    openTab: vi.fn(async () => {}),
    closeTab: vi.fn(),
    onListChanged: vi.fn(),
    reauth: vi.fn(async () => {}),
    ...over
  } as unknown as CharacterSectionDeps & {
    openTab: ReturnType<typeof vi.fn>; closeTab: ReturnType<typeof vi.fn>;
    onListChanged: ReturnType<typeof vi.fn>; reauth: ReturnType<typeof vi.fn>;
  };
  const body = document.createElement('div');
  document.body.appendChild(body);
  const section = createCharacterSection(deps);
  body.appendChild(section.el);
  void section.reload();
  return { body, deps, section };
}

/** The listing settles a microtask after `reload`, so most cases wait for the first row. */
async function mounted(over: Partial<CharacterSectionDeps> = {}) {
  const m = mount(over);
  await vi.waitFor(() => expect(m.body.querySelector('[data-char-row]')).not.toBeNull());
  return m;
}

describe('account character section', () => {
  test('lists characters, marks the active one, offers create under the limit', async () => {
    const { body } = mount({ active: () => chars[0] });
    await flush();
    expect(body.querySelectorAll('[data-char-row]')).toHaveLength(2);
    expect(body.querySelector('[data-char-row="c1"]')!.classList.contains('active')).toBe(true);
    expect(body.querySelector('#char-panel-create')).not.toBeNull();
  });

  test('rows show the live session status and offer Open tab instead of Log in as', async () => {
    listCharacters.mockResolvedValue({ characters: [alpha, beta], limit: 3 });
    const { body, deps } = await mounted({ active: () => alpha, stateOf: id => (id === 'a' ? 'online' : id === 'b' ? 'connecting' : null) });
    expect(body.querySelector('[data-char-row="a"]')!.textContent).toContain('online');
    expect(body.querySelector('[data-char-row="b"]')!.textContent).toContain('connecting');
    expect(body.querySelector('[data-char-switch]')).toBeNull();
    body.querySelector<HTMLButtonElement>('[data-char-open="b"]')!.click();
    await vi.waitFor(() => expect(deps.openTab).toHaveBeenCalledWith(beta));
  });

  test('a character with no session reads offline', async () => {
    listCharacters.mockResolvedValue({ characters: [alpha], limit: 3 });
    const { body } = await mounted({ stateOf: () => null });
    expect(body.querySelector('[data-char-row="a"]')!.textContent).toContain('offline');
  });

  test('the active character has no Open tab button but keeps Delete', async () => {
    listCharacters.mockResolvedValue({ characters: [alpha, beta], limit: 3 });
    const { body } = await mounted({ active: () => alpha, stateOf: () => 'online' });
    expect(body.querySelector('[data-char-open="a"]')).toBeNull();
    expect(body.querySelector('[data-char-delete="a"]')).not.toBeNull();
  });

  test('a successful delete closes the tab for that character and reports the new listing', async () => {
    listCharacters.mockResolvedValueOnce({ characters: [alpha, beta], limit: 3 })
                  .mockResolvedValueOnce({ characters: [alpha], limit: 3 });
    deleteCharacter.mockResolvedValue(undefined);
    const { body, deps } = await mounted({ active: () => alpha, stateOf: () => 'online' });
    body.querySelector<HTMLButtonElement>('[data-char-delete="b"]')!.click();
    body.querySelector<HTMLInputElement>('#char-del-phrase')!.value = 'delete beta';
    body.querySelector<HTMLInputElement>('#char-del-phrase')!.dispatchEvent(new Event('input'));
    body.querySelector<HTMLButtonElement>('#char-del-confirm')!.click();
    await vi.waitFor(() => expect(deps.closeTab).toHaveBeenCalledWith('b'));
    expect(deps.onListChanged).toHaveBeenLastCalledWith([alpha], 3);
  });

  test('creating from the panel reports the new listing so the tab strip refreshes', async () => {
    listCharacters.mockResolvedValueOnce({ characters: [alpha], limit: 3 })
                  .mockResolvedValueOnce({ characters: [alpha, beta], limit: 3 });
    createCharacter.mockResolvedValue(beta);
    const { body, deps } = await mounted();
    body.querySelector<HTMLInputElement>('#char-panel-name')!.value = 'beta';
    body.querySelector<HTMLFormElement>('#char-panel-create')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(deps.onListChanged).toHaveBeenLastCalledWith([alpha, beta], 3));
  });

  // Owner requirement carried from the Task 6 review: every account names every character, so the
  // name input is no longer hidden from anonymous players.
  test('an anonymous account still gets the name input and its typed name is what is created', async () => {
    listCharacters.mockResolvedValue({ characters: [alpha], limit: 3 });
    createCharacter.mockResolvedValue(beta);
    const { body } = await mounted({ isAnonymous: () => true });
    const name = body.querySelector<HTMLInputElement>('#char-panel-name');
    expect(name).not.toBeNull();
    name!.value = 'beta';
    body.querySelector<HTMLFormElement>('#char-panel-create')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(createCharacter).toHaveBeenCalledWith('token', 'beta'));
  });

  test('a failing open keeps its message visible after the rows re-render', async () => {
    listCharacters.mockResolvedValue({ characters: [alpha, beta], limit: 3 });
    const openTab = vi.fn(async () => { throw new Error('client failed to start'); });
    const { body } = await mounted({ active: () => alpha, openTab });
    body.querySelector<HTMLButtonElement>('[data-char-open="b"]')!.click();
    await vi.waitFor(() => expect(body.querySelector('#char-panel-error')!.textContent).toBe('client failed to start'));
    expect(body.querySelector('#char-panel-error')!.classList.contains('hidden')).toBe(false);
  });

  test('an empty name is refused without ever reaching the create API', async () => {
    listCharacters.mockResolvedValue({ characters: [alpha], limit: 3 });
    const { body } = await mounted();
    body.querySelector<HTMLFormElement>('#char-panel-create')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(body.querySelector('#char-panel-error')!.textContent)
      .toBe('Names are 1-12 letters, digits or underscores and start with a letter.'));
    expect(createCharacter).not.toHaveBeenCalled();
  });

  test('open calls openTab with the other character', async () => {
    const { body, deps } = await mounted({ active: () => chars[0] });
    body.querySelector<HTMLButtonElement>('[data-char-open="c2"]')!.click();
    expect(deps.openTab).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2' }));
  });

  test('delete requires the exact phrase, re-auths, then deletes and re-lists', async () => {
    deleteCharacter.mockResolvedValue(undefined);
    const { body, deps } = await mounted({ active: () => chars[0] });
    body.querySelector<HTMLButtonElement>('[data-char-delete="c2"]')!.click();
    const confirm = body.querySelector<HTMLButtonElement>('#char-del-confirm')!;
    expect(confirm.disabled).toBe(true);
    body.querySelector<HTMLInputElement>('#char-del-phrase')!.value = 'delete bo';
    body.querySelector<HTMLInputElement>('#char-del-phrase')!.dispatchEvent(new Event('input'));
    expect(confirm.disabled).toBe(false);
    body.querySelector<HTMLInputElement>('#char-del-password')!.value = 'pw';
    confirm.click();
    await flush(); await flush();
    expect(deps.reauth).toHaveBeenCalledWith('pw');
    expect(deleteCharacter).toHaveBeenCalledWith('token', 'c2', 'delete bo');
    expect(listCharacters).toHaveBeenCalledTimes(2);
  });

  test('open buttons disable while an open is in flight and re-enable once it settles', async () => {
    let resolveOpen: () => void = () => {};
    const openTab = vi.fn(() => new Promise<void>(r => { resolveOpen = r; }));
    const { body } = await mounted({ active: () => chars[0], openTab });
    const btn = body.querySelector<HTMLButtonElement>('[data-char-open="c2"]')!;
    btn.click();
    expect(openTab).toHaveBeenCalledTimes(1);
    expect(btn.disabled).toBe(true);
    resolveOpen();
    await flush();
    expect(body.querySelector<HTMLButtonElement>('[data-char-open="c2"]')!.disabled).toBe(false);
  });

  test('a failed listing shows a friendly error, not an empty account with a create form', async () => {
    listCharacters.mockRejectedValue(new Error('characters 500'));
    const { body } = mount();
    await flush();
    expect(body.querySelector('.alert-error')?.textContent).toBe('Something went wrong. Try again.');
    expect(body.querySelectorAll('[data-char-row]')).toHaveLength(0);
    expect(body.querySelector('#char-panel-create')).toBeNull();
    expect(body.textContent).not.toContain('No characters yet');
  });

  test('a create failure shows the friendly message, never the raw code', async () => {
    createCharacter.mockRejectedValue(new Error('limit'));
    const { body } = await mounted();
    body.querySelector<HTMLInputElement>('#char-panel-name')!.value = 'zed';
    body.querySelector<HTMLFormElement>('#char-panel-create')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush(); await flush();
    expect(body.querySelector('#char-panel-error')!.textContent).toBe('You have reached your character limit.');
  });

  test('when no tab is open (active is null) every character offers Open tab', async () => {
    const { body } = await mounted({ active: () => null });
    expect(body.querySelector('[data-char-open="c1"]')).not.toBeNull();
    expect(body.querySelector('[data-char-open="c2"]')).not.toBeNull();
    expect(body.querySelectorAll('.char-row.active')).toHaveLength(0);
  });

  // The section outlives no panel: a listing that lands after the Account panel closed must not
  // repaint the element it was handed, and must not report a roster the shell would rebuild from.
  test('a listing that settles after dispose neither repaints nor reports', async () => {
    let settle: (v: { characters: typeof chars; limit: number }) => void = () => {};
    listCharacters.mockReturnValue(new Promise(r => { settle = r; }));
    const { body, deps, section } = mount();
    section.dispose();
    settle({ characters: chars, limit: 3 });
    await flush(); await flush();
    expect(body.querySelectorAll('[data-char-row]')).toHaveLength(0);
    expect(deps.onListChanged).not.toHaveBeenCalled();
  });
});
