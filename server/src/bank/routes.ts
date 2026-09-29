import { timingSafeEqual } from 'node:crypto';

import type { Principal } from '../auth/principal';
import type { ManagementClient } from '../engine/managementClient';
import type { Route } from '../router';
import { BANK_LAYOUT_OPS, type BankOp } from '../types';

type BankRoute = Route & { kind: 'bank' };

export interface BankRoutes {
  handle(req: Request, route: BankRoute, principal: Principal): Promise<Response>;
  handleHook(req: Request, ip: string): Promise<Response>;
  versionOf(ownerKey: string): number | null;
  /** Open SSE subscribers for an owner. Diagnostics and tests only. */
  streamCount(ownerKey: string): number;
}

export const MAX_STREAMS_PER_OWNER = 4;
const DEFAULT_HEARTBEAT_MS = 15_000;
const ENCODER = new TextEncoder();

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MAX_OPS = 200;

/**
 * The engine posts the change hook from loopback in a local stack and from the compose bridge
 * (172.16/12) in a deployed one, so the source has to be "same host or same private network".
 * The shared secret is the real authentication; this is defence in depth, keeping the hook off
 * the public internet even if the secret ever leaks.
 */
export function isTrustedHookSource(ip: string): boolean {
  if (LOOPBACK.has(ip)) return true;
  // ::ffff:10.0.0.4 and friends: an IPv4 source arriving on a dual-stack socket.
  const v4 = ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
  const octets = v4.split('.');
  if (octets.length === 4 && octets.every(o => /^\d{1,3}$/.test(o) && Number(o) <= 255)) {
    const [a, b] = [Number(octets[0]), Number(octets[1])];
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
    if (a === 192 && b === 168) return true;             // 192.168.0.0/16
    return false;
  }
  // fc00::/7 -- IPv6 unique local addresses (fc.. and fd..).
  const head = ip.toLowerCase().split(':')[0];
  return /^f[cd][0-9a-f]{0,2}$/.test(head);
}

function sameSecret(a: string | null, b: string): boolean {
  if (!a || b.length === 0) return false;
  // Byte length, not code-point length: a non-ASCII header must be a clean 401, never a
  // timingSafeEqual throw turned into a 500.
  const got = Buffer.from(a, 'utf8');
  const want = Buffer.from(b, 'utf8');
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}

function isInt(v: unknown): v is number { return typeof v === 'number' && Number.isInteger(v); }

/** Shape-checks an op and refuses anything that would change what the bank contains. */
function layoutOp(raw: unknown): BankOp | 'not_layout' | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.op === 'delta' || (r.op === undefined && r.obj !== undefined)) return 'not_layout';
  if (typeof r.op !== 'string' || !(BANK_LAYOUT_OPS as readonly string[]).includes(r.op)) return null;
  switch (r.op) {
    case 'swap': return isInt(r.a) && isInt(r.b) ? { op: 'swap', a: r.a, b: r.b } : null;
    case 'insert': return isInt(r.from) && isInt(r.to) ? { op: 'insert', from: r.from, to: r.to } : null;
    case 'moveToTab': return isInt(r.slot) && isInt(r.tab) ? { op: 'moveToTab', slot: r.slot, tab: r.tab } : null;
    case 'setTabs': return Array.isArray(r.sizes) && r.sizes.every(isInt) ? { op: 'setTabs', sizes: r.sizes as number[] } : null;
    case 'sort': return isInt(r.tab) && (r.by === 'value' || r.by === 'name' || r.by === 'id') ? { op: 'sort', tab: r.tab, by: r.by } : null;
    default: return null;
  }
}

export function createBankRoutes(deps: { client: ManagementClient; secret: string; heartbeatMs?: number }): BankRoutes {
  // Last version the engine reported per owner. SP8b turns this into an SSE stream; SP8 keeps
  // it as the record that proves the hook arrived.
  const versions = new Map<string, number>();

  // One entry per open SSE response. Keyed by owner so a hook fans out to exactly the account
  // it names and to nobody else.
  const streams = new Map<string, Set<(frame: string) => void>>();

  /**
   * Records the version the engine now holds and, when it actually moved, tells every open
   * stream for that owner. Every path that learns a version goes through here: the GET, a
   * successful apply, a 409 (which carries the CURRENT version), and the change hook. The
   * "actually moved" check is exact-duplicate suppression, nothing more: the hook is fire and
   * forget and can repeat a version a browser already holds, and there is no reason to wake it
   * for that. It deliberately does not clamp to increasing versions - the engine is the source
   * of truth and may legitimately report a lower one after a restart, so a 7 arriving after a 9
   * is stored and fanned out.
   */
  function record(ownerKey: string, version: number): void {
    if (versions.get(ownerKey) === version) return;
    versions.set(ownerKey, version);
    for (const send of streams.get(ownerKey) ?? []) send(`event: version\ndata: ${JSON.stringify({ version })}\n\n`);
  }

  return {
    async handle(req, route, principal) {
      const ownerKey = principal.uid;
      // SP8 is human-only end to end: the router's principal rule already refuses an agent
      // bearer, and this second check keeps the module honest on its own. SP9 revisits
      // whether an agent may read a bank.
      if (principal.kind !== 'human') return Response.json({ error: 'human_only' }, { status: 403 });

      if (route.sub === 'events') {
        if (req.method !== 'GET') return new Response(null, { status: 405 });
        const open = streams.get(ownerKey) ?? new Set<(frame: string) => void>();
        // A browser opens one stream per bank window. A cap keeps a reload loop or a wedged
        // tab from accumulating subscribers for the life of the process.
        if (open.size >= MAX_STREAMS_PER_OWNER) return Response.json({ error: 'too_many_streams' }, { status: 429 });
        streams.set(ownerKey, open);

        let send: (frame: string) => void = () => {};
        let heartbeat: ReturnType<typeof setInterval> | null = null;
        /**
         * cancel and abort both fire on a dropped connection, and not always in the same tick, so
         * this runs twice for one closed socket and every line of it has to be idempotent on its
         * own. There used to be a `released` early-return in front as well; it made the identity
         * check below unreachable (a second call never got that far), so the two guarded the same
         * thing and no test could tell them apart. One owner each now:
         *
         * - `heartbeat = null` is what stops the timer being cleared twice. Nothing observable
         *   goes wrong if it is, but the null is also what says the timer is gone.
         * - `streams.get(ownerKey) === open` is what stops a LATE release evicting a live
         *   subscriber: by the second call the browser may already have reconnected under a new
         *   Set, and a blind streams.delete(ownerKey) would throw that reconnection away.
         */
        const release = (): void => {
          if (heartbeat) clearInterval(heartbeat);
          heartbeat = null;
          open.delete(send);
          if (open.size === 0 && streams.get(ownerKey) === open) streams.delete(ownerKey);
        };

        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            send = frame => {
              // A closed or errored controller throws on enqueue; that is the browser having
              // gone away between the hook and this write, so drop the subscriber quietly.
              try { controller.enqueue(ENCODER.encode(frame)); } catch { release(); }
            };
            open.add(send);
            // `retry` tells the browser's own reconnect policy; the comment keeps proxies from
            // buffering the first bytes. No version is replayed: the store subscribes BEFORE it
            // does its first GET, so it cannot miss a change in between.
            send(': open\nretry: 3000\n\n');
            heartbeat = setInterval(() => send(': ping\n\n'), deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);
          },
          cancel: release
        });

        // The abort fires when the socket drops without the reader cancelling. `once` lets the
        // signal drop the closure as soon as it has run; release() is idempotent regardless.
        req.signal.addEventListener('abort', release, { once: true });
        // addEventListener no-ops on a signal that has ALREADY fired, which would leave a
        // subscriber registered with only the cancel path left to free it.
        if (req.signal.aborted) release();

        return new Response(body, {
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
            // nginx and friends buffer text/event-stream by default, which turns a live stream
            // into one long-poll that only flushes at the end.
            'x-accel-buffering': 'no'
          }
        });
      }

      if (route.sub === 'get') {
        if (req.method !== 'GET') return new Response(null, { status: 405 });
        const snapshot = await deps.client.getBank(ownerKey);
        if (!snapshot) return Response.json({ error: 'unavailable' }, { status: 503 });
        record(ownerKey, snapshot.version);
        return Response.json(snapshot);
      }

      // Reordering is a human action from the bank window; item movement is Contracts' job
      // and goes through the management client server-side, never through a browser request.
      if (req.method !== 'POST') return new Response(null, { status: 405 });

      let body: { expectedVersion?: unknown; ops?: unknown };
      try { body = (await req.json()) as typeof body; } catch { return Response.json({ error: 'bad_body' }, { status: 400 }); }
      if (!isInt(body.expectedVersion) || body.expectedVersion < 0) return Response.json({ error: 'bad_version' }, { status: 400 });
      if (!Array.isArray(body.ops) || body.ops.length > MAX_OPS) return Response.json({ error: 'bad_ops' }, { status: 400 });

      const ops: BankOp[] = [];
      for (const raw of body.ops) {
        const op = layoutOp(raw);
        if (op === 'not_layout') return Response.json({ error: 'layout_only' }, { status: 403 });
        if (!op) return Response.json({ error: 'bad_ops' }, { status: 400 });
        ops.push(op);
      }

      const result = await deps.client.applyBank(ownerKey, body.expectedVersion, ops);
      if (result.ok) {
        record(ownerKey, result.version);
        return Response.json({ version: result.version });
      }
      if (result.kind === 'conflict') {
        record(ownerKey, result.version);
        return Response.json({ error: 'version', version: result.version }, { status: 409 });
      }
      if (result.kind === 'rejected') return Response.json({ error: result.error }, { status: 422 });
      return Response.json({ error: 'unavailable' }, { status: 503 });
    },

    async handleHook(req, ip) {
      // The engine posts this from the same host or the same private network; nothing on the
      // public internet may. Source and secret are both checked before the body is touched.
      if (!isTrustedHookSource(ip)) return Response.json({ error: 'forbidden' }, { status: 403 });
      if (!sameSecret(req.headers.get('x-idlescape-mgmt'), deps.secret)) return Response.json({ error: 'unauthorized' }, { status: 401 });
      let body: { ownerKey?: unknown; version?: unknown };
      try { body = (await req.json()) as typeof body; } catch { return Response.json({ error: 'bad_body' }, { status: 400 }); }
      if (typeof body.ownerKey !== 'string' || !isInt(body.version)) return Response.json({ error: 'bad_body' }, { status: 400 });
      record(body.ownerKey, body.version);
      return new Response(null, { status: 204 });
    },

    versionOf(ownerKey) {
      return versions.get(ownerKey) ?? null;
    },

    streamCount(ownerKey) {
      return streams.get(ownerKey)?.size ?? 0;
    }
  };
}
