// One structured line per request. Audit C07: the front server had exactly one console.log, the
// startup line, so box/logs.sh during a live incident showed a boot message and nothing else.
//
// Static assets and the index are excluded WHEN THEY SUCCEED, because a client boot fetches enough
// of them to bury everything else; a failing one is the incident and is logged. One line of JSON so
// the shape is parseable and so a multi-line body can never be mistaken for several entries.

export interface RequestLog {
  method: string;
  path: string;
  status: number;
  ms: number;
  kind: string;
}

// Read off server/src/router.ts's classify(), not guessed: 'static' is /assets/* (:68-71), 'index'
// is / (:33), 'page' is /play.html and /styleguide (:34-36), 'client' is /client/* (:64-67), and
// 'cache' is every .mid plus every CACHE_PREFIXES path, /crc /title /config /interface /media
// /versionlist /textures /wordenc (:61, server/src/types.ts:4). One client boot is hundreds of
// 'client' and 'cache' requests; excluding only 'static' and 'index' would log exactly the flood
// this set exists to prevent, and the log would be turned off again within a week. A failure is
// still logged whatever its kind, so a 404 storm on /client/* stays visible.
const QUIET_KINDS = new Set(['static', 'index', 'page', 'client', 'cache']);

export function shouldLog(kind: string, status: number): boolean {
  if (status >= 400) return true;
  return !QUIET_KINDS.has(kind);
}

// The pairing token travels IN THE PATH, not in a query string: server/src/router.ts:41-44 reads it
// out of /pair/<token> and /api/pair/<token>/exchange, and it is the 32-character single-use secret
// minted by server/src/pair/store.ts, which persists only its hash. Kind 'pair' is not quiet, so
// without this the log would be the one place the plaintext token survives, readable through
// deploy/lightsail/box/logs.sh for the whole 15-minute TTL and enough on its own to mint an agent
// token (the fetch does not spend it). Audit F22 asked for this log as "never the bearer".
//
// The rules are ordered: the exchange keeps its useful suffix, and the two prefix rules below it
// catch every other shape under those prefixes, because a truncated or extended URL still carries a
// live token even when classify() calls it 'notfound'. /api/pair itself (mint) has no token in it
// and is left alone, and so is /api/agent-tokens/<id>/revoke, whose id is a document id rather than
// the 40-character agent secret.
const SECRET_PATHS: ReadonlyArray<{ match: RegExp; safe: string }> = [
  { match: /^\/api\/pair\/[^/]+\/exchange$/, safe: '/api/pair/<redacted>/exchange' },
  { match: /^\/api\/pair\/.+/, safe: '/api/pair/<redacted>' },
  { match: /^\/pair\/.+/, safe: '/pair/<redacted>' }
];

function safePath(pathname: string): string {
  for (const rule of SECRET_PATHS) if (rule.match.test(pathname)) return rule.safe;
  return pathname;
}

export function requestLine(entry: RequestLog): string {
  // Two scrubs, and they are not the same scrub. The query string goes first: no route this server
  // serves carries a secret there today (the one production caller passes a URL pathname, which
  // cannot contain a '?'), but a caller is free to pass a full URL and a later route is free to
  // take a query parameter, so it stays. Then the pairing token, which really is in the path.
  const path = safePath(entry.path.split('?')[0] ?? entry.path);
  return JSON.stringify({ t: 'req', method: entry.method, path, status: entry.status, ms: entry.ms, kind: entry.kind });
}

/**
 * Times one request and emits at most one line for it. The decision, the timing and the path the
 * line is built from live here rather than inline in Bun.serve's fetch handler, where nothing can
 * reach them: server/src/index.ts initialises Firebase and opens a port at module scope, so a test
 * cannot import it.
 *
 * `run` returning undefined is the websocket upgrade: Bun has taken the socket over, there is no
 * status to record, and returning a Response in its place would drop the connection. It is passed
 * through untouched and nothing is logged.
 */
export async function withAccessLog(
  req: Request,
  kind: string,
  emit: (line: string) => void,
  run: () => Promise<Response | undefined>
): Promise<Response | undefined> {
  const started = Date.now();
  const res = await run();
  if (res && shouldLog(kind, res.status)) {
    const entry = { method: req.method, path: new URL(req.url).pathname, status: res.status, ms: Date.now() - started, kind };
    emit(requestLine(entry));
  }
  return res;
}
