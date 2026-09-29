import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as charApi from '../characters/api';
import type { CharacterSummary, Identity } from '../types';

// The controller drives Firebase directly; the gate underneath it is real, so only the auth
// boundary and the characters API are stubbed.
const auth = vi.hoisted(() => ({
  onUserIdToken: vi.fn(),
  signInGuest: vi.fn(async () => {}),
  currentIdToken: vi.fn(async () => 't'),
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  attachEmail: vi.fn(),
  resetPassword: vi.fn(),
  friendlyAuthError: vi.fn(() => 'auth error')
}));
vi.mock('../auth', () => auth);

const { createHomeController } = await import('./controller');

/** The real partials, so the test also proves the markup carries the ids the controller wires. */
function partial(name: string): string {
  return readFileSync(resolve(process.cwd(), `src/partials/${name}.html`), 'utf-8');
}

const GUEST: Identity = { uid: 'u1', isAnonymous: true, email: null, displayName: null };
const CHARACTER: CharacterSummary = { id: 'c1', gameName: 'al', createdAt: 1, lastLoginAt: null };

const btn = (id: string): HTMLButtonElement => document.getElementById(id) as HTMLButtonElement;
const flush = (ms = 10): Promise<void> => new Promise(r => setTimeout(r, ms));

function start() {
  const setState = vi.fn();
  const enterFrame = vi.fn();
  const ctl = createHomeController({ setState, enterFrame, onIdentity: vi.fn(), gameName: () => null });
  ctl.start();
  const emit = auth.onUserIdToken.mock.calls.at(-1)![0] as (id: Identity | null) => void;
  return { ctl, setState, enterFrame, emit };
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.currentIdToken.mockResolvedValue('t');
  document.body.innerHTML = partial('home') + partial('characters');
});

afterEach(() => { vi.restoreAllMocks(); });

describe('home controller', () => {
  test('a second attempt while the gate is in flight is ignored, and the choices stay disabled', async () => {
    const list = vi.spyOn(charApi, 'listCharacters')
      .mockImplementation(() => new Promise(r => setTimeout(() => r({ characters: [CHARACTER], limit: 3 }), 30)));
    const { ctl, emit, enterFrame } = start();

    emit(GUEST);
    expect(btn('btn-guest').disabled).toBe(true);
    expect(document.getElementById('home-busy')!.classList.contains('hidden')).toBe(false);

    btn('btn-guest').click();
    btn('btn-connect-login').click(); // not part of the choices row, so never disabled
    emit(GUEST); // e.g. an id-token refresh landing mid-flight
    emit({ ...GUEST, uid: 'u2' }); // and a different uid, which bypasses the gateUid check

    await flush(80);
    expect(list).toHaveBeenCalledTimes(1);
    expect(enterFrame).toHaveBeenCalledTimes(1);
    expect(enterFrame).toHaveBeenCalledWith([CHARACTER], expect.objectContaining({ id: 'c1' }), false);
    expect(ctl.characterLimit()).toBe(3);
  });

  test('a guest with no character names it on the characters screen instead of entering the frame', async () => {
    vi.spyOn(charApi, 'listCharacters').mockResolvedValue({ characters: [], limit: 2 });
    const create = vi.spyOn(charApi, 'createCharacter');
    const { ctl, emit, setState, enterFrame } = start();

    emit(GUEST);
    await flush();

    expect(setState).toHaveBeenLastCalledWith('characters');
    expect(create).not.toHaveBeenCalled();
    expect(enterFrame).not.toHaveBeenCalled();
    expect(ctl.characterLimit()).toBe(2);
  });

  test('a gate failure is shown on the home screen, re-enables the choices, and can be retried', async () => {
    const list = vi.spyOn(charApi, 'listCharacters').mockRejectedValue(new Error('characters 500'));
    const { emit, setState, enterFrame } = start();

    emit(GUEST);
    await flush();

    const error = document.getElementById('home-error')!;
    expect(error.textContent).toMatch(/could not load your characters/i);
    expect(error.classList.contains('hidden')).toBe(false);
    expect(btn('btn-guest').disabled).toBe(false);
    expect(document.getElementById('home-busy')!.classList.contains('hidden')).toBe(true);
    expect(enterFrame).not.toHaveBeenCalled();
    expect(setState).toHaveBeenLastCalledWith('home');

    btn('btn-guest').click();
    await flush();
    expect(list).toHaveBeenCalledTimes(2);
  });

  test('a token refresh while the pairing card is open does not enter the gate under it', async () => {
    const list = vi.spyOn(charApi, 'listCharacters').mockResolvedValue({ characters: [CHARACTER], limit: 3 });
    const { emit, enterFrame } = start();

    emit(null); // the signed-out state that enables the choices row
    // "Connect a Claude session" signs a guest in itself; the resulting auth event shows the
    // pairing card instead of the gate.
    btn('btn-connect').click();
    emit(GUEST);
    await flush();
    expect(document.getElementById('entry-connect-view')!.classList.contains('hidden')).toBe(false);
    expect(list).not.toHaveBeenCalled();

    // The hourly id-token refresh for the same uid must not fall through to the gate.
    emit(GUEST);
    await flush();
    expect(list).not.toHaveBeenCalled();
    expect(enterFrame).not.toHaveBeenCalled();
    expect(document.getElementById('entry-connect-view')!.classList.contains('hidden')).toBe(false);
  });

  test('a failed listing never reaches character creation', async () => {
    vi.spyOn(charApi, 'listCharacters').mockRejectedValue(new Error('characters 500'));
    const create = vi.spyOn(charApi, 'createCharacter');
    const { emit, enterFrame } = start();

    emit(GUEST);
    await flush();

    expect(create).not.toHaveBeenCalled();
    expect(enterFrame).not.toHaveBeenCalled();
    expect(document.getElementById('home-error')!.textContent).toMatch(/could not load your characters/i);
    expect(btn('btn-guest').disabled).toBe(false);
  });
});
