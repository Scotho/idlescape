import { describe, expect, test } from 'bun:test';
import { createWikiAuth } from './auth';

const reader = (headers: Record<string, string> = {}) => new Request('http://x/wiki', { headers });
const api = (headers: Record<string, string> = {}) => new Request('http://x/api/wiki/search', { headers });

describe('wiki auth', () => {
  test('with no bearer verifier the reader and the api are public, token or not', async () => {
    const a = createWikiAuth();
    expect(await a.allowed(reader(), 'wiki')).toBe(true);
    expect(await a.allowed(api(), 'wikiApi')).toBe(true);
    expect(await a.allowed(api({ authorization: 'Bearer any' }), 'wikiApi')).toBe(true);
  });
  test('with a verifier, a presented bearer must pass it; a call without one stays public', async () => {
    const a = createWikiAuth({ verifyBearer: async t => t === 'good' });
    expect(await a.allowed(api({ authorization: 'Bearer good' }), 'wikiApi')).toBe(true);
    expect(await a.allowed(api({ authorization: 'Bearer bad' }), 'wikiApi')).toBe(false);
    expect(await a.allowed(api(), 'wikiApi')).toBe(true);
    expect(await a.allowed(reader({ authorization: 'Bearer bad' }), 'wiki')).toBe(true);
  });
});
