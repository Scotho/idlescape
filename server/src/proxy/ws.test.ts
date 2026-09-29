import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { IncomingMessage } from 'http';
import { WebSocketServer } from 'ws';
import { OWNER_HEADER, openUpstream, relayHandlers, safeCloseCode, type RelayData } from './ws';

type VerifyClientInfo = { origin: string; secure: boolean; req: IncomingMessage };

let upstream: ReturnType<typeof Bun.serve>;
let front: ReturnType<typeof Bun.serve<RelayData>>;

beforeAll(() => {
  // Fake engine: greets with 8 bytes on open (like the login seed), echoes binary frames, closes with 4321 on "bye".
  upstream = Bun.serve<undefined>({
    port: 0,
    fetch(req, srv) {
      if (srv.upgrade(req, { headers: { 'sec-websocket-protocol': 'binary' } })) return undefined;
      return new Response('nf', { status: 404 });
    },
    websocket: {
      open(ws) { ws.send(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])); },
      message(ws, msg) {
        const bytes = typeof msg === 'string' ? new TextEncoder().encode(msg) : new Uint8Array(msg);
        if (bytes.length === 3 && bytes[0] === 98 && bytes[1] === 121 && bytes[2] === 101) { ws.close(4321, 'bye'); return; }
        ws.send(bytes);
      }
    }
  });
  const engineWs = `ws://127.0.0.1:${upstream.port}`;
  front = Bun.serve<RelayData>({
    port: 0,
    async fetch(req, srv) {
      const { upstream: up, early } = await openUpstream(engineWs);
      if (srv.upgrade(req, { data: { upstream: up, pending: [], early }, headers: { 'sec-websocket-protocol': 'binary' } })) return undefined;
      up.close();
      return new Response('nf', { status: 404 });
    },
    websocket: relayHandlers
  });
});
afterAll(() => { front.stop(true); upstream.stop(true); });

function connectToPort(port: number | undefined): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`, 'binary');
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error('connect failed'));
  });
}

function connect(): Promise<WebSocket> {
  return connectToPort(front.port);
}

describe('ws relay', () => {
  test('delivers the upstream greeting and echoes binary frames', async () => {
    const ws = await connect();
    const frames: Uint8Array[] = [];
    const got = new Promise<void>(res => { ws.onmessage = e => { frames.push(new Uint8Array(e.data as ArrayBuffer)); if (frames.length === 2) res(); }; });
    ws.send(new Uint8Array([9, 9]));
    await got;
    expect(frames[0]).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(frames[1]).toEqual(new Uint8Array([9, 9]));
    ws.close();
  });

  test('mirrors the upstream close code', async () => {
    const ws = await connect();
    const closed = new Promise<number>(res => { ws.onclose = e => res(e.code); });
    ws.send(new TextEncoder().encode('bye'));
    expect(await closed).toBe(4321);
  });

  test('sanitises reserved close codes', () => {
    expect(safeCloseCode(1006)).toBe(1011);
    expect(safeCloseCode(1000)).toBe(1000);
    expect(safeCloseCode(4321)).toBe(4321);
    expect(safeCloseCode(5000)).toBe(1011);
  });

  test('rejects when the engine is unreachable', async () => {
    await expect(openUpstream('ws://127.0.0.1:1')).rejects.toThrow();
  });

  test('supports two concurrent sockets to / independently (274 OnDemand second socket)', async () => {
    // 274 opens a SECOND `/` socket on the same page (OnDemandWorker streams models/anims/maps/music
    // alongside the game socket). Each upgrade must create its own upstream + RelayData so the two
    // sockets never share state: distinct greetings, independent echoes, and closing one must not
    // touch the other.
    const [wsA, wsB] = await Promise.all([connect(), connect()]);
    const framesA: Uint8Array[] = [];
    const framesB: Uint8Array[] = [];
    const gotA = new Promise<void>(res => { wsA.onmessage = e => { framesA.push(new Uint8Array(e.data as ArrayBuffer)); if (framesA.length === 2) res(); }; });
    const gotB = new Promise<void>(res => { wsB.onmessage = e => { framesB.push(new Uint8Array(e.data as ArrayBuffer)); if (framesB.length === 2) res(); }; });
    wsA.send(new Uint8Array([11, 11]));
    wsB.send(new Uint8Array([22, 22]));
    await Promise.all([gotA, gotB]);

    expect(framesA[0]).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(framesA[1]).toEqual(new Uint8Array([11, 11]));
    expect(framesB[0]).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(framesB[1]).toEqual(new Uint8Array([22, 22]));

    const closedA = new Promise<number>(res => { wsA.onclose = e => res(e.code); });
    wsA.close();
    await closedA;

    const gotB2 = new Promise<void>(res => { wsB.onmessage = e => { framesB.push(new Uint8Array(e.data as ArrayBuffer)); res(); }; });
    wsB.send(new Uint8Array([33, 33]));
    await gotB2;
    expect(framesB[2]).toEqual(new Uint8Array([33, 33]));
    wsB.close();
  });

  test('preserves frame order when upstream sends a burst of frames before open() completes', async () => {
    const burstUpstream = Bun.serve<undefined>({
      port: 0,
      fetch(req, srv) {
        if (srv.upgrade(req, { headers: { 'sec-websocket-protocol': 'binary' } })) return undefined;
        return new Response('nf', { status: 404 });
      },
      websocket: {
        open(ws) {
          ws.send(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
          ws.send(new Uint8Array([9, 9]));
        },
        message() { /* not used in this test */ }
      }
    });
    const engineWs = `ws://127.0.0.1:${burstUpstream.port}`;
    const burstFront = Bun.serve<RelayData>({
      port: 0,
      async fetch(req, srv) {
        const { upstream, early } = await openUpstream(engineWs);
        if (srv.upgrade(req, { data: { upstream, pending: [], early }, headers: { 'sec-websocket-protocol': 'binary' } })) return undefined;
        upstream.close();
        return new Response('nf', { status: 404 });
      },
      websocket: relayHandlers
    });
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${burstFront.port}/`, 'binary');
      ws.binaryType = 'arraybuffer';
      const frames: Uint8Array[] = [];
      const got = new Promise<void>((resolve, reject) => {
        ws.onmessage = e => { frames.push(new Uint8Array(e.data as ArrayBuffer)); if (frames.length === 2) resolve(); };
        ws.onerror = () => reject(new Error('connect failed'));
      });
      await got;
      expect(frames[0]).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
      expect(frames[1]).toEqual(new Uint8Array([9, 9]));
      ws.close();
    } finally {
      burstFront.stop(true);
      burstUpstream.stop(true);
    }
  });
});

describe('ws relay Origin forwarding (274 web.allowedOrigin gate)', () => {
  test('forwards the front server\'s public origin (env.publicOrigin) so an allowedOrigin-gated engine accepts the relay', async () => {
    // Stand-in for env.publicOrigin, the front server's own stable identity -- NOT the
    // browser's Origin header. In dev this is the front server's port (8787) even though
    // the browser may be on vite's 5173; in prod it's the front server's public URL.
    const ALLOWED_ORIGIN = 'http://localhost:8787';

    // Fake engine that mimics 274's engine/src/web.ts verifyClient gate: rejects the
    // upgrade unless the connection's Origin header equals the configured allowedOrigin.
    const gatedUpstream = new WebSocketServer({
      port: 0,
      verifyClient: (info: VerifyClientInfo) => info.origin === ALLOWED_ORIGIN
    });
    await new Promise<void>(resolve => gatedUpstream.once('listening', resolve));
    gatedUpstream.on('connection', ws => {
      ws.send(new Uint8Array([42]));
      ws.on('message', data => ws.send(data));
    });

    const addr = gatedUpstream.address();
    if (addr === null || typeof addr === 'string') throw new Error('expected an AddressInfo');
    const engineWs = `ws://127.0.0.1:${addr.port}`;

    const originFront = Bun.serve<RelayData>({
      port: 0,
      async fetch(req, srv) {
        const { upstream: up, early } = await openUpstream(engineWs, { origin: ALLOWED_ORIGIN });
        if (srv.upgrade(req, { data: { upstream: up, pending: [], early }, headers: { 'sec-websocket-protocol': 'binary' } })) return undefined;
        up.close();
        return new Response('nf', { status: 404 });
      },
      websocket: relayHandlers
    });

    try {
      const ws = await connectToPort(originFront.port);
      const frames: Uint8Array[] = [];
      const got = new Promise<void>((resolve, reject) => {
        ws.onmessage = e => { frames.push(new Uint8Array(e.data as ArrayBuffer)); if (frames.length === 2) resolve(); };
        ws.onerror = () => reject(new Error('relay failed'));
      });
      ws.send(new Uint8Array([7]));
      await got;
      expect(frames[0]).toEqual(new Uint8Array([42]));
      expect(frames[1]).toEqual(new Uint8Array([7]));
      ws.close();
    } finally {
      originFront.stop(true);
      gatedUpstream.close();
    }
  });

  test('rejects when the forwarded origin does not match the engine allowedOrigin (sanity check on the fake gate)', async () => {
    const gatedUpstream = new WebSocketServer({
      port: 0,
      verifyClient: (info: VerifyClientInfo) => info.origin === 'http://localhost:8787'
    });
    await new Promise<void>(resolve => gatedUpstream.once('listening', resolve));
    const addr = gatedUpstream.address();
    if (addr === null || typeof addr === 'string') throw new Error('expected an AddressInfo');
    const engineWs = `ws://127.0.0.1:${addr.port}`;
    try {
      await expect(openUpstream(engineWs, { origin: 'http://evil.example' })).rejects.toThrow();
    } finally {
      gatedUpstream.close();
    }
  });
});

describe('upstream handshake headers', () => {
  async function listen(): Promise<{ wss: WebSocketServer; port: number; seen: Promise<IncomingMessage> }> {
    const wss = new WebSocketServer({ port: 0 });
    await new Promise<void>(resolve => wss.once('listening', resolve));
    const addr = wss.address();
    if (addr === null || typeof addr === 'string') throw new Error('expected an AddressInfo');
    const seen = new Promise<IncomingMessage>(resolve => { wss.on('connection', (_sock, req) => resolve(req)); });
    return { wss, port: addr.port, seen };
  }

  test('openUpstream puts Origin and the owner header on the handshake', async () => {
    const { wss, port, seen } = await listen();
    try {
      const handle = await openUpstream(`ws://127.0.0.1:${port}`, {
        origin: 'http://localhost:8787',
        headers: { [OWNER_HEADER]: 'u1.bob.99.sig' }
      });
      const req = await seen;
      expect(req.headers.origin).toBe('http://localhost:8787');
      expect(req.headers[OWNER_HEADER]).toBe('u1.bob.99.sig');
      handle.upstream.close();
    } finally {
      wss.close();
    }
  });

  test('omits the owner header entirely when there is no assertion to forward', async () => {
    const { wss, port, seen } = await listen();
    try {
      const handle = await openUpstream(`ws://127.0.0.1:${port}`, { origin: 'http://localhost:8787', headers: {} });
      const req = await seen;
      expect(req.headers.origin).toBe('http://localhost:8787');
      expect(req.headers[OWNER_HEADER]).toBeUndefined();
      handle.upstream.close();
    } finally {
      wss.close();
    }
  });
});
