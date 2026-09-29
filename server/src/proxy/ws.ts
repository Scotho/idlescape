import type { ServerWebSocket, WebSocketHandler } from 'bun';
import { WebSocket as EngineSocket } from 'ws';
import type { RawData as EngineRawData } from 'ws';
import { OWNER_ASSERTION_MAX_ENTRIES, OWNER_COOKIE, splitOwnerCookie } from '../auth/ownerAssertion';
import { readCookie } from '../cookies';

/** Upgrade header the engine overlay reads (engine-custom/src/web.ts). */
export const OWNER_HEADER = 'x-idlescape-owner';
const OWNER_HEADER_MAX_BYTES = 4000;
/** Only the alphabet signOwnerAssertion can emit, plus the '~' entry separator. */
const OWNER_HEADER_RE = /^[A-Za-z0-9_.~-]+$/;

/**
 * The value to relay upstream for this WebSocket upgrade, or null. The relay does NOT verify
 * the signature -- it has no reason to and the engine must check it anyway, against the name
 * it decrypts from the login block. It only guarantees the value is header-safe.
 */
export function ownerHeaderFor(req: Request): string | null {
  const raw = readCookie(req, OWNER_COOKIE);
  if (!raw || raw.length > OWNER_HEADER_MAX_BYTES) return null;
  if (!OWNER_HEADER_RE.test(raw)) return null;
  const entries = splitOwnerCookie(raw);
  if (entries.length === 0 || entries.length > OWNER_ASSERTION_MAX_ENTRIES) return null;
  return raw;
}

export interface RelayData {
  upstream: EngineSocket;
  pending: ArrayBuffer[];
  early: ArrayBuffer[];
}

const OPEN_TIMEOUT_MS = 5000;

export function safeCloseCode(code: number): number {
  if (code === 1000) return 1000;
  if (code >= 3000 && code <= 4999) return code;
  return 1011;
}

export interface UpstreamHandle {
  upstream: EngineSocket;
  early: ArrayBuffer[];
}

export interface OpenUpstreamOptions {
  // The Origin header to present on the upstream handshake so a 274 engine configured
  // with web.allowedOrigin accepts the relayed connection. Callers pass the front
  // server's own stable public origin (env.publicOrigin) here, NOT the browser's Origin
  // header -- see server/src/index.ts's ws route for why. Bun's built-in WebSocket
  // client cannot set this header at all, which is why this module uses the `ws`
  // package (header-capable) for the upstream leg instead.
  origin?: string;
  /**
   * Extra handshake headers. Used for X-Idlescape-Owner: the 274 client cannot put anything
   * on its own upgrade, so the browser carries the assertion in a cookie and the relay
   * promotes it to a header here.
   */
  headers?: Record<string, string>;
}

function toBytes(msg: string | Buffer | ArrayBuffer | Uint8Array | Buffer[]): Uint8Array {
  if (typeof msg === 'string') return new TextEncoder().encode(msg);
  if (Array.isArray(msg)) return Buffer.concat(msg);
  if (msg instanceof ArrayBuffer) return new Uint8Array(msg);
  return new Uint8Array(msg.buffer, msg.byteOffset, msg.byteLength);
}

// Copies a view's bytes into a freshly-allocated, independent ArrayBuffer. `ws` may hand
// back Buffers backed by Node's shared pool, so we can't just re-use `.buffer` as-is (it
// could alias other data once the pool slot is reused) -- this always yields a safe copy.
function toOwnedArrayBuffer(msg: EngineRawData): ArrayBuffer {
  const bytes = toBytes(msg);
  // bytes.buffer is typed ArrayBufferLike (ArrayBuffer | SharedArrayBuffer) by lib.dom's
  // resizable-ArrayBuffer typings, but toBytes() only ever produces views over a plain
  // ArrayBuffer (TextEncoder, Buffer.concat, or a Buffer/Uint8Array from `ws`), never a
  // SharedArrayBuffer -- the cast just recovers that fact for the type checker.
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function openUpstream(engineWs: string, opts: OpenUpstreamOptions = {}): Promise<UpstreamHandle> {
  return new Promise((resolve, reject) => {
    // Bun ships its own native drop-in for the `ws` package (a `BunWebSocket` shim, not
    // the actual npm JS implementation) that does NOT honor the `ws` API's `origin`
    // client option -- it only forwards an explicit `headers` map onto the handshake.
    // So the Origin header has to be set via `headers.Origin`, not `{ origin }`.
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.origin) headers.Origin = opts.origin;
    const ws = new EngineSocket(engineWs, 'binary', Object.keys(headers).length > 0 ? { headers } : undefined);
    const early: ArrayBuffer[] = [];
    let settled = false;

    // Capture any frame that arrives between upstream-open and the front socket's own
    // open() handler taking over the message listener, so nothing (e.g. the engine's
    // login greeting) is silently dropped while relayHandlers.open() has not run yet.
    // This listener MUST stay attached past resolve() -- the caller still has to await
    // openUpstream, then call srv.upgrade(), before relayHandlers.open() runs and takes
    // over (via removeAllListeners('message') + its own live listener); frames can and
    // do arrive in that gap.
    const captureEarly = (data: EngineRawData): void => { early.push(toOwnedArrayBuffer(data)); };
    ws.on('message', captureEarly);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.terminate();
      reject(new Error('upstream open timeout'));
    }, OPEN_TIMEOUT_MS);

    ws.once('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ upstream: ws, early });
    });

    // Kept as a persistent (not `.once`) listener: an error can fire in the gap between
    // resolve() above and relayHandlers.open() attaching its own 'error' listener (the
    // caller awaits openUpstream, then still has to call srv.upgrade()). EventEmitter
    // throws if an 'error' event has zero listeners, so this also guards that window;
    // after settlement it just swallows, deferring to relayHandlers.open's own handler.
    ws.on('error', (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

export const relayHandlers: WebSocketHandler<RelayData> = {
  open(ws: ServerWebSocket<RelayData>) {
    const up = ws.data.upstream;
    // Drain frames buffered by openUpstream's temporary listener BEFORE attaching the
    // live 'message' handler below. This runs synchronously to completion (no await in
    // between), so no upstream frame can slip in between the drain and the attach:
    // anything that arrived earlier is in `early` (sent here, in order), and anything
    // arriving after this function returns goes through the live handler.
    for (const buf of ws.data.early) {
      if (ws.readyState === 1) ws.send(new Uint8Array(buf), true);
    }
    ws.data.early = [];
    // Drop openUpstream's temporary early-capture listener before attaching the live one
    // below -- equivalent to the plain-callback version's `up.onmessage = liveHandler`
    // reassignment, just spelled out for an EventEmitter-based client.
    up.removeAllListeners('message');
    up.on('message', (data: EngineRawData) => {
      const bytes = toBytes(data);
      if (ws.readyState === 1) ws.send(bytes, true);
    });
    up.on('close', (code: number, reason: Buffer) => {
      if (ws.readyState === 1) ws.close(safeCloseCode(code), reason.toString('utf8').slice(0, 120));
    });
    up.on('error', () => {
      if (ws.readyState === 1) ws.close(1011, 'upstream error');
    });
    for (const buf of ws.data.pending) up.send(buf);
    ws.data.pending = [];
  },
  message(ws, msg) {
    const up = ws.data.upstream;
    const bytes = toBytes(msg);
    if (up.readyState === EngineSocket.OPEN) up.send(bytes);
    else if (up.readyState === EngineSocket.CONNECTING) ws.data.pending.push(bytes.slice().buffer);
  },
  close(ws, code, reason) {
    const up = ws.data.upstream;
    if (up.readyState === EngineSocket.OPEN || up.readyState === EngineSocket.CONNECTING) up.close(safeCloseCode(code), reason);
  }
};
