import { CACHE_PREFIXES } from './types';

export type Route =
  | { kind: 'health' }
  | { kind: 'ws' }
  | { kind: 'cache' }
  | { kind: 'client'; file: string }
  | { kind: 'static'; file: string }
  | { kind: 'index' }
  | { kind: 'page'; file: string }
  | { kind: 'pair'; sub: 'mint' | 'fetch' | 'exchange' | 'revoke' | 'guide'; token?: string; id?: string }
  | { kind: 'characters'; sub: 'list' | 'check' | 'create' | 'session' | 'delete'; id?: string }
  | { kind: 'bank'; sub: 'get' | 'ops' | 'events' }
  | { kind: 'bankHook' }
  | { kind: 'wiki'; path: string }
  | { kind: 'wikiApi'; path: string }
  | { kind: 'notfound' };

export type PrincipalRule = 'human' | 'agent' | 'either' | 'none';

const SAFE_FILE = /^[A-Za-z0-9._-]+$/;
const CHAR_ID = /^[A-Za-z0-9_-]{20}$/;

function safeSegments(rest: string): string | null {
  if (rest.includes('%')) return null;
  const parts = rest.split('/');
  if (parts.some(p => p === '' || p === '.' || p === '..' || !SAFE_FILE.test(p))) return null;
  return parts.join('/');
}

export function classify(pathname: string, isUpgrade: boolean): Route {
  if (pathname === '/') return isUpgrade ? { kind: 'ws' } : { kind: 'index' };
  if (pathname === '/styleguide') return { kind: 'page', file: 'styleguide.html' };
  // One same-origin document per character (SP7).
  if (pathname === '/play.html') return { kind: 'page', file: 'play.html' };
  if (pathname === '/api/health') return { kind: 'health' };
  if (pathname === '/api/pair') return { kind: 'pair', sub: 'mint' };
  if (pathname === '/connect') return { kind: 'pair', sub: 'guide' };
  const pairFetch = pathname.match(/^\/pair\/([A-Za-z0-9_-]+)$/);
  if (pairFetch) return { kind: 'pair', sub: 'fetch', token: pairFetch[1] };
  const exchangeMatch = pathname.match(/^\/api\/pair\/([A-Za-z0-9_-]+)\/exchange$/);
  if (exchangeMatch) return { kind: 'pair', sub: 'exchange', token: exchangeMatch[1] };
  const revokeMatch = pathname.match(/^\/api\/agent-tokens\/([A-Za-z0-9_-]+)\/revoke$/);
  if (revokeMatch) return { kind: 'pair', sub: 'revoke', id: revokeMatch[1] };
  if (pathname === '/api/bank') return { kind: 'bank', sub: 'get' };
  if (pathname === '/api/bank/ops') return { kind: 'bank', sub: 'ops' };
  // SSE. The engine's change hook is fire and forget with no delivery guarantee, so this is an
  // accelerator over the browser's own polling, never the only path a change takes.
  if (pathname === '/api/bank/events') return { kind: 'bank', sub: 'events' };
  // The engine posts here after every bank version change; authorised by loopback + the
  // management secret, never by a Firebase identity.
  if (pathname === '/internal/bank-changed') return { kind: 'bankHook' };
  if (pathname === '/api/characters') return { kind: 'characters', sub: 'list' };
  if (pathname === '/api/characters/check') return { kind: 'characters', sub: 'check' };
  const charSession = pathname.match(/^\/api\/characters\/([^/]+)\/session$/);
  if (charSession) return CHAR_ID.test(charSession[1]) ? { kind: 'characters', sub: 'session', id: charSession[1] } : { kind: 'notfound' };
  const charOne = pathname.match(/^\/api\/characters\/([^/]+)$/);
  if (charOne) return CHAR_ID.test(charOne[1]) ? { kind: 'characters', sub: 'delete', id: charOne[1] } : { kind: 'notfound' };
  if (pathname.endsWith('.mid') || CACHE_PREFIXES.some(p => pathname.startsWith(p))) return { kind: 'cache' };
  if (pathname === '/wiki' || pathname.startsWith('/wiki/')) return { kind: 'wiki', path: pathname };
  if (pathname.startsWith('/api/wiki/') || pathname === '/api/wiki') return { kind: 'wikiApi', path: pathname };
  if (pathname.startsWith('/client/')) {
    const file = safeSegments(pathname.slice('/client/'.length));
    return file && !file.includes('/') ? { kind: 'client', file } : { kind: 'notfound' };
  }
  if (pathname.startsWith('/assets/')) {
    const file = safeSegments(pathname.slice('/assets/'.length));
    return file ? { kind: 'static', file: `assets/${file}` } : { kind: 'notfound' };
  }
  return { kind: 'notfound' };
}

export function principalRule(route: Route): PrincipalRule {
  switch (route.kind) {
    case 'characters': return 'human';
    case 'bank': return 'human';       // SP8: the shared bank is human-only; SP9 revisits agent reads
    case 'bankHook': return 'none';    // loopback + shared secret, no Firebase identity
    case 'pair': return route.sub === 'mint' || route.sub === 'revoke' ? 'human' : 'none';
    // SPW: the wiki reader and query API are public and answer ahead of this check, so they need
    // no Firebase principal here.
    case 'wiki':
    case 'wikiApi': return 'none';
    default: return 'none';
  }
}
