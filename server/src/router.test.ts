import { describe, expect, test } from 'bun:test';
import { classify, principalRule } from './router';
import { CACHE_PREFIXES } from './types';

describe('classify', () => {
  test('api routes', () => {
    expect(classify('/api/health', false)).toEqual({ kind: 'health' });
    expect(classify('/api/gate', false)).toEqual({ kind: 'notfound' });
    expect(classify('/api/bridge', false)).toEqual({ kind: 'notfound' });
  });
  test('websocket upgrade at root', () => {
    expect(classify('/', true)).toEqual({ kind: 'ws' });
  });
  test('index at root without upgrade', () => {
    expect(classify('/', false)).toEqual({ kind: 'index' });
  });
  test('styleguide page', () => {
    expect(classify('/styleguide', false)).toEqual({ kind: 'page', file: 'styleguide.html' });
  });
  test('engine cache endpoints (274: no /models over HTTP)', () => {
    for (const p of ['/crc', '/title', '/config', '/interface', '/media', '/versionlist', '/textures', '/wordenc', '/sounds', '/scape_main_12345678.mid']) {
      expect(classify(p, false)).toEqual({ kind: 'cache' });
    }
  });
  test('cache prefixes are sourced from the shared CACHE_PREFIXES array', () => {
    for (const prefix of CACHE_PREFIXES) {
      expect(classify(prefix, false)).toEqual({ kind: 'cache' });
    }
  });
  test('CRC-suffixed cache paths classify as cache', () => {
    expect(classify('/title123456789', false)).toEqual({ kind: 'cache' });
    expect(classify('/crc987654321', false)).toEqual({ kind: 'cache' });
  });
  test('/models is no longer cache in 274 (streamed over ondemand websocket instead)', () => {
    expect(classify('/models', false)).toEqual({ kind: 'notfound' });
  });
  test('client bundle files', () => {
    expect(classify('/client/client.js', false)).toEqual({ kind: 'client', file: 'client.js' });
    expect(classify('/client/tinymidipcm.wasm', false)).toEqual({ kind: 'client', file: 'tinymidipcm.wasm' });
    expect(classify('/client/ondemandworker.js', false)).toEqual({ kind: 'client', file: 'ondemandworker.js' });
  });
  test('vite assets', () => {
    expect(classify('/assets/index-abc123.js', false)).toEqual({ kind: 'static', file: 'assets/index-abc123.js' });
  });
  test('path traversal is not found', () => {
    expect(classify('/client/../.env', false)).toEqual({ kind: 'notfound' });
    expect(classify('/assets/..%2f..%2fx', false)).toEqual({ kind: 'notfound' });
  });
  test('unknown is not found', () => {
    expect(classify('/rs2.cgi', false)).toEqual({ kind: 'notfound' });
  });
  test('wiki reader and api', () => {
    expect(classify('/wiki', false)).toEqual({ kind: 'wiki', path: '/wiki' });
    expect(classify('/wiki/item/bronze-axe', false)).toEqual({ kind: 'wiki', path: '/wiki/item/bronze-axe' });
    expect(classify('/api/wiki/search', false)).toEqual({ kind: 'wikiApi', path: '/api/wiki/search' });
    expect(classify('/wikipedia', false)).toEqual({ kind: 'notfound' });
  });
});

describe('classify pairing routes', () => {
  test('mint', () => {
    expect(classify('/api/pair', false)).toEqual({ kind: 'pair', sub: 'mint' });
  });
  test('fetch by token', () => {
    expect(classify('/pair/abcDEF123_-', false)).toEqual({ kind: 'pair', sub: 'fetch', token: 'abcDEF123_-' });
  });
  test('exchange by token', () => {
    expect(classify('/api/pair/abcDEF123_-/exchange', false)).toEqual({ kind: 'pair', sub: 'exchange', token: 'abcDEF123_-' });
  });
  test('revoke by id', () => {
    expect(classify('/api/agent-tokens/xyz123/revoke', false)).toEqual({ kind: 'pair', sub: 'revoke', id: 'xyz123' });
  });
  test('connect guide', () => {
    expect(classify('/connect', false)).toEqual({ kind: 'pair', sub: 'guide' });
  });
});

describe('characters routes', () => {
  test('classifies list, check, create, session, delete', () => {
    expect(classify('/api/characters', false)).toEqual({ kind: 'characters', sub: 'list' });
    expect(classify('/api/characters/check', false)).toEqual({ kind: 'characters', sub: 'check' });
    expect(classify('/api/characters/abcDEF123_-abcDEF123/session', false)).toEqual({ kind: 'characters', sub: 'session', id: 'abcDEF123_-abcDEF123' });
    expect(classify('/api/characters/abcDEF123_-abcDEF123', false)).toEqual({ kind: 'characters', sub: 'delete', id: 'abcDEF123_-abcDEF123' });
    expect(classify('/api/characters/../x', false)).toEqual({ kind: 'notfound' });
  });
  test('principal rules', () => {
    expect(principalRule({ kind: 'characters', sub: 'list' })).toBe('human');
    expect(principalRule({ kind: 'pair', sub: 'mint' })).toBe('human');
    expect(principalRule({ kind: 'pair', sub: 'exchange', token: 't' })).toBe('none');
    expect(principalRule({ kind: 'health' })).toBe('none');
  });
});

describe('shared bank routes', () => {
  test('classifies the read, the ops post and the engine change hook', () => {
    expect(classify('/api/bank', false)).toEqual({ kind: 'bank', sub: 'get' });
    expect(classify('/api/bank/ops', false)).toEqual({ kind: 'bank', sub: 'ops' });
    expect(classify('/internal/bank-changed', false)).toEqual({ kind: 'bankHook' });
    expect(classify('/api/bank/nope', false)).toEqual({ kind: 'notfound' });
  });
  test('the bank is human-only in SP8; the hook is authorised by its source ip + secret instead', () => {
    expect(principalRule({ kind: 'bank', sub: 'get' })).toBe('human');
    expect(principalRule({ kind: 'bank', sub: 'ops' })).toBe('human');
    expect(principalRule({ kind: 'bankHook' })).toBe('none');
  });
});

describe('the per-character client page', () => {
  test('/play.html is served as a page from web/dist', () => {
    expect(classify('/play.html', false)).toEqual({ kind: 'page', file: 'play.html' });
  });
  test('the WebSocket upgrade path is unaffected', () => {
    expect(classify('/', true)).toEqual({ kind: 'ws' });
  });
});

describe('the bank event stream', () => {
  test('the bank event stream is its own route and stays human-only', () => {
    expect(classify('/api/bank/events', false)).toEqual({ kind: 'bank', sub: 'events' });
    expect(principalRule({ kind: 'bank', sub: 'events' })).toBe('human');
  });
});
