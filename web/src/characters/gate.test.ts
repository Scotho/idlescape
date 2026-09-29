import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createCharactersGate, type CharactersGate } from './gate';
import * as api from './api';
import type { MockInstance } from 'vitest';

/** The real partial, so the tests also prove the markup carries the ids the gate wires. */
function mount(): HTMLElement {
  document.body.innerHTML = readFileSync(resolve(process.cwd(), 'src/partials/characters.html'), 'utf-8');
  return document.getElementById('screen-characters')!;
}

const REGISTERED = { uid: 'u1', isAnonymous: false, email: 'a@b.c', displayName: null };
const GUEST = { uid: 'g1', isAnonymous: true, email: null, displayName: null };

let root: HTMLElement;
let gate: CharactersGate;
// `ReturnType<typeof vi.spyOn<...>>` resolves the first of `spyOn`'s overloads, whose key
// parameter is constrained to the module's getters, of which a module of functions has none: the
// constraint is `never` and the three lines below never typechecked. `MockInstance` names the same
// type directly. Audit C16.
let listCharacters: MockInstance<typeof api.listCharacters>;
let createCharacter: MockInstance<typeof api.createCharacter>;
let checkName: MockInstance<typeof api.checkName>;
let onReady: ReturnType<typeof vi.fn>;
let onError: ReturnType<typeof vi.fn>;
let setState: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.restoreAllMocks();
  root = mount();
  listCharacters = vi.spyOn(api, 'listCharacters');
  createCharacter = vi.spyOn(api, 'createCharacter');
  checkName = vi.spyOn(api, 'checkName');
  onReady = vi.fn();
  onError = vi.fn();
  setState = vi.fn();
  gate = createCharactersGate(root, { idToken: async () => 'token', onReady, onError, setState });
});

describe('characters gate', () => {
  test('a guest with no character gets the naming form, not a silent creation', async () => {
    listCharacters.mockResolvedValue({ characters: [], limit: 2 });
    await gate.enter({ uid: 'g1', isAnonymous: true, email: null, displayName: null });
    expect(createCharacter).not.toHaveBeenCalled();
    expect(setState).toHaveBeenCalledWith('characters');
    expect(onReady).not.toHaveBeenCalled();
  });

  test('a registered user with no character gets the same form', async () => {
    listCharacters.mockResolvedValue({ characters: [], limit: 3 });
    await gate.enter({ uid: 'u1', isAnonymous: false, email: 'a@b.c', displayName: null });
    expect(setState).toHaveBeenCalledWith('characters');
  });

  test('submitting the form creates the character and reports it as freshly created', async () => {
    listCharacters.mockResolvedValue({ characters: [], limit: 2 });
    createCharacter.mockResolvedValue({ id: 'c1', gameName: 'zed', createdAt: 1, lastLoginAt: null });
    await gate.enter({ uid: 'g1', isAnonymous: true, email: null, displayName: null });
    root.querySelector<HTMLInputElement>('#char-name')!.value = 'Zed';
    root.querySelector<HTMLFormElement>('#char-create-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(createCharacter).toHaveBeenCalledWith('token', 'Zed');
    expect(onReady).toHaveBeenCalledWith([{ id: 'c1', gameName: 'zed', createdAt: 1, lastLoginAt: null }], { id: 'c1', gameName: 'zed', createdAt: 1, lastLoginAt: null }, true);
  });

  test('an existing character is handed over without the form and is not marked created', async () => {
    const existing = { id: 'c0', gameName: 'alpha', createdAt: 1, lastLoginAt: null };
    listCharacters.mockResolvedValue({ characters: [existing], limit: 3 });
    await gate.enter({ uid: 'u1', isAnonymous: false, email: 'a@b.c', displayName: null });
    expect(onReady).toHaveBeenCalledWith([existing], existing, false);
    expect(setState).not.toHaveBeenCalledWith('characters');
  });

  test('the limit from the listing is exposed to the shell', async () => {
    listCharacters.mockResolvedValue({ characters: [], limit: 2 });
    await gate.enter({ uid: 'g1', isAnonymous: true, email: null, displayName: null });
    expect(gate.limit()).toBe(2);
  });

  test('the first of several characters is the one handed over, and all are cached', async () => {
    listCharacters.mockResolvedValue({
      characters: [
        { id: 'c1', gameName: 'al', createdAt: 1, lastLoginAt: null },
        { id: 'c2', gameName: 'bo', createdAt: 2, lastLoginAt: null }
      ],
      limit: 3
    });
    await gate.enter(REGISTERED);
    expect(onReady).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ id: 'c1' }), false);
    expect(gate.cached()).toHaveLength(2);
  });

  test('refresh re-lists the account and records the new limit', async () => {
    listCharacters.mockResolvedValue({ characters: [], limit: 2 });
    await gate.enter(REGISTERED);
    const grown = { id: 'c1', gameName: 'al', createdAt: 1, lastLoginAt: null };
    listCharacters.mockResolvedValue({ characters: [grown], limit: 5 });
    await expect(gate.refresh()).resolves.toEqual([grown]);
    expect(gate.cached()).toEqual([grown]);
    expect(gate.limit()).toBe(5);
  });

  test('an empty name is refused on the form, without asking the server', async () => {
    listCharacters.mockResolvedValue({ characters: [], limit: 3 });
    await gate.enter(REGISTERED);
    // jsdom does not enforce `required` on a dispatched submit, so this is the guard in gate.ts
    // and not the browser: whitespace is the same as nothing.
    root.querySelector<HTMLInputElement>('#char-name')!.value = '   ';
    root.querySelector<HTMLFormElement>('#char-create-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(document.getElementById('char-create-error')!.textContent).toBe('Choose a name for your character.');
    expect(createCharacter).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });

  test('a create failure is shown on the form the player is looking at', async () => {
    listCharacters.mockResolvedValue({ characters: [], limit: 3 });
    createCharacter.mockRejectedValue(new Error('taken'));
    await gate.enter(REGISTERED);
    root.querySelector<HTMLInputElement>('#char-name')!.value = 'Zed';
    root.querySelector<HTMLFormElement>('#char-create-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(document.getElementById('char-create-error')!.textContent).toMatch(/taken/));
    expect(onReady).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  test('a failed listing reports an error instead of looking like a new account', async () => {
    listCharacters.mockRejectedValue(new Error('characters 500'));
    await gate.enter(GUEST);
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/could not load your characters/i));
    expect(createCharacter).not.toHaveBeenCalled();
    expect(setState).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });

  test('a failing idToken during enter is reported, not thrown', async () => {
    const failing = createCharactersGate(root, {
      idToken: async () => { throw new Error('not signed in'); },
      onReady, onError, setState
    });
    await expect(failing.enter(REGISTERED)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/could not load your characters/i));
  });

  test('a superseded availability check does not overwrite the status', async () => {
    listCharacters.mockResolvedValue({ characters: [], limit: 3 });
    let settleFirst: (r: { ok: true; gameName: string }) => void = () => {};
    const slowFirst = new Promise<{ ok: true; gameName: string }>(r => { settleFirst = r; });
    checkName.mockReturnValueOnce(slowFirst).mockResolvedValueOnce({ ok: true, gameName: 'bo' });
    await gate.enter(REGISTERED);
    const input = document.getElementById('char-name') as HTMLInputElement;
    const type = async (value: string): Promise<void> => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await new Promise(r => setTimeout(r, 340));
    };
    await type('al');
    await type('bo');
    expect(document.getElementById('char-name-status')!.textContent).toBe('bo is available');
    settleFirst({ ok: true, gameName: 'al' });
    await new Promise(r => setTimeout(r, 0));
    expect(document.getElementById('char-name-status')!.textContent).toBe('bo is available');
  });
});
