import { afterEach, describe, expect, test, vi } from 'vitest';
import { createCharacter, deleteCharacter, friendlyCharacterError, listCharacters, mintSession } from './api';

function mockFetch(status: number, body: unknown) {
  const f = vi.fn(async () => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', f);
  return f;
}
afterEach(() => vi.unstubAllGlobals());

describe('characters api', () => {
  test('list sends the bearer and carries the server-owned limit', async () => {
    const f = mockFetch(200, { characters: [{ id: 'c1', gameName: 'a', createdAt: 1, lastLoginAt: null }], limit: 2 });
    expect(await listCharacters('tok')).toEqual({ characters: [{ id: 'c1', gameName: 'a', createdAt: 1, lastLoginAt: null }], limit: 2 });
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ authorization: 'Bearer tok' });
  });
  test('friendlyCharacterError maps known codes and falls back to a generic message', () => {
    expect(friendlyCharacterError('limit')).toBe('You have reached your character limit.');
    expect(friendlyCharacterError('taken')).toBe('That name is taken.');
    expect(friendlyCharacterError('characters 500')).toBe('Something went wrong. Try again.');
    expect(friendlyCharacterError('')).toBe('Something went wrong. Try again.');
  });
  test('create surfaces the 409 error code', async () => {
    mockFetch(409, { error: 'limit' });
    await expect(createCharacter('tok', 'x')).rejects.toThrow('limit');
  });
  test('mintSession returns credentials', async () => {
    mockFetch(200, { gameName: 'a', secret: 's' });
    expect(await mintSession('tok', 'c1')).toEqual({ gameName: 'a', secret: 's' });
  });
  test('delete resolves on 204 and throws the code otherwise', async () => {
    mockFetch(204, null);
    await expect(deleteCharacter('tok', 'c1', 'delete a')).resolves.toBeUndefined();
    mockFetch(403, { error: 'reauth' });
    await expect(deleteCharacter('tok', 'c1', 'delete a')).rejects.toThrow('reauth');
  });
});
