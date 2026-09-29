# Idlescape Platform and Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public, gated, Firebase-authenticated Lost City (2004Scape) web client wrapped in a RuneLite-style frame at `https://osrs.scotho.com`, served by our own front server that reverse-proxies an unmodified engine.

**Architecture:** Three packages in one repo: `server/` (Bun front server: gate, game-account bridge, static, HTTP and WebSocket proxy), `web/` (Vite shell page with the RuneLite frame and Firebase auth), `client/` (thin fork of Client-TS 225 exposing a hooks module). The upstream engine and content are pinned clones under `engine/`, never edited. Cloudflare Tunnel exposes the front server from this Windows PC now; Docker Compose files target the Oracle VM later.

**Tech Stack:** Bun 1.4 (server, client build, engine), TypeScript strict, Vite 6, Firebase Web SDK v12 + firebase-admin v13, Firestore, `bun test` for Bun-runtime packages, Vitest + jsdom for `web/`, Playwright (Python already installed; TypeScript runner added in `web/`), cloudflared, Windows Task Scheduler.

**Spec:** `docs/superpowers/specs/2026-09-04-idlescape-platform-design.md`

## Global Constraints

- Firebase project id is `idlescape-osrs`. Public origin is `https://osrs.scotho.com`.
- Front server listens on `8787`; engine web on `8888`; engine TCP `43594` is never exposed.
- Gate password is `fiddlesticks`; gate cookie name is `cs_gate`; 30-day validity; disabled by `GATE_ENABLED=false`.
- Game names: 1 to 12 chars, `[a-z][a-z0-9_]*`; guests default to `guest_` plus 6 random chars.
- Game secret: 20 characters from `[A-Za-z0-9]`.
- Engine and content under `engine/` are upstream clones pinned in `scripts/upstream.lock`; no file inside them is edited by any task.
- Client changes live in `client/src/hooks/` plus minimal call sites in `client/src/client/Client.ts`.
- TypeScript strict everywhere; no new `as any`; files under 400 lines; conventional commits; each package has its own `types.ts` for shared shapes and its own `.env.example`.
- Bun-runtime packages (`server/`, `client/`) test with `bun test` because Bun.serve and Bun.build are unavailable under Node; `web/` tests with Vitest + jsdom. This is the one deliberate deviation from tron's Vitest-everywhere convention.
- Commits are made with `git commit` and the trailer lines the session requires; commands below omit the trailer for brevity but implementers must include them.
- Windows paths: run scripts from Git Bash or PowerShell as indicated; Bun lives at `%USERPROFILE%\.bun\bin\bun.exe`.

## File Structure

```
osrs_test/                       (repo "idlescape", folder name kept)
  package.json                   root scripts that delegate to packages
  scripts/
    upstream.lock                pinned commit shas for engine and content
    setup.ps1                    clone/checkout upstream at pinned shas, install deps, pack once
    start-stack.ps1              engine + server (+ vite dev) for local development
    build.ps1                    build client, build web, typecheck server
    verify.ps1                   unit tests in all packages + browser e2e
  engine/
    server/                      LostCityRS/Engine-TS @ 225 (moved from lostcity/engine)
    content/                     LostCityRS/Content   @ 225 (moved from lostcity/content)
  client/                        LostCityRS/Client-TS @ 225 fork (moved from lostcity/webclient)
    src/hooks/types.ts           ClientHooks, HookEvents, ClientState, LoginResult
    src/hooks/emitter.ts         typed event emitter
    src/hooks/diff.ts            pure xp/inventory diff helpers
    src/hooks/install.ts         builds window.idlescape.client from a HookBridge
    src/hooks/*.test.ts          bun tests for diff and emitter
  server/
    package.json, tsconfig.json, bunfig.toml, .env.example
    src/env.ts                   typed env loading and validation
    src/types.ts                 shared server shapes
    src/index.ts                 Bun.serve wiring
    src/router.ts                path classification (static/api/cache/ws/404)
    src/gate.ts                  cookie sign/verify, middleware, POST handler, cooldown
    src/health.ts                engine prober and /api/health
    src/static.ts                web dist and client bundle serving
    src/proxy/http.ts            cache endpoint proxy
    src/proxy/ws.ts              WebSocket relay
    src/firebaseAdmin.ts         admin SDK init (emulator aware)
    src/gameName.ts              normalise, validate, suffix
    src/bridge.ts                POST /api/bridge
    src/*.test.ts                bun tests
  web/
    package.json, tsconfig.json, vite.config.ts, vitest.config.ts, eslint.config.js, .env.example
    index.html                   partial includes
    src/partials/*.html          gate, signin, frame, panels
    src/styles/tokens.css        RuneLite palette in RGB-triplet tokens
    src/styles/frame.css, panels.css, auth.css, overlays.css
    src/main.ts                  boot
    src/state.ts                 app state machine
    src/firebase.ts, src/auth.ts
    src/api.ts                   gate/bridge/health client
    src/frame/*.ts               icon strip, panel controller, canvas sizing, overlays
    src/panels/*.ts              account, config, connect, claude, xp, loot
    src/stats/xp.ts, loot.ts     pure calculators
    src/clientHost.ts            loads client bundle, starts it, wires hooks
    src/**/*.test.ts             vitest
    e2e/gate-to-game.pw.test.ts  Playwright
  firebase/
    firebase.json, .firebaserc, firestore.rules, firestore.indexes.json
    rules.test.ts                rules unit tests against the emulator
  deploy/
    windows/register-tasks.ps1   Task Scheduler for engine + server
    windows/install-tunnel.ps1   cloudflared tunnel create/route/config/service
    cloudflared/config.yml.template
    docker/engine.Dockerfile, server.Dockerfile, docker-compose.yml
  docs/                          specs, plans, screenshots, verify script
```

---

### Task 1: Repository restructure and upstream pinning

**Files:**
- Create: `package.json`, `scripts/upstream.lock`, `scripts/setup.ps1`, `.editorconfig`
- Modify: `.gitignore`, `README.md`
- Delete: `start-server.ps1`, `build-client.ps1`, `update-source.ps1`, `lostcity/` (after moving its clones)

**Interfaces:**
- Produces: directory layout every later task assumes: `engine/server`, `engine/content`, `client/`.
- Produces: `scripts/setup.ps1` idempotent bootstrap used by `scripts/start-stack.ps1` (Task 15) and the deploy tasks.

- [ ] **Step 1: Move the clones and record pins**

Run in Git Bash from the repo root:

```bash
mkdir -p engine
mv lostcity/engine engine/server
mv lostcity/content engine/content
mv lostcity/webclient client
rm -rf lostcity start-server.ps1 build-client.ps1 update-source.ps1
printf 'engine/server %s\nengine/content %s\nclient %s\n' \
  "$(git -C engine/server rev-parse HEAD)" \
  "$(git -C engine/content rev-parse HEAD)" \
  "$(git -C client rev-parse HEAD)" > scripts/upstream.lock 2>/dev/null || { mkdir -p scripts; printf 'engine/server %s\nengine/content %s\nclient %s\n' "$(git -C engine/server rev-parse HEAD)" "$(git -C engine/content rev-parse HEAD)" "$(git -C client rev-parse HEAD)" > scripts/upstream.lock; }
cat scripts/upstream.lock
```

Expected: three lines, each a path and a 40-char sha. The engine's `data/pack` moved with it, so no repack is needed.

- [ ] **Step 2: Write `.gitignore`**

```
# upstream clones (pinned in scripts/upstream.lock, restored by scripts/setup.ps1)
engine/
# client is a fork we track ourselves, except its build and deps
client/node_modules/
client/out/
# packages
node_modules/
server/secrets/
server/.env
web/.env.local
web/dist/
web/test-results/
web/playwright-report/
logs/
.superpowers/
.env
*.log
```

Note: `client/` stays tracked as ordinary files in this repo (its own `.git` is kept so upstream can be pulled; git treats it as an embedded repo). Run `git rm -r --cached client 2>/dev/null; git add client` after adding a `client/.git` exclusion: append `client/.git/` to `.gitignore` is not honoured by git for nested repos, so instead convert the fork to a plain directory now and re-add the upstream remote later if needed:

```bash
mv client/.git client/.upstream-git
echo 'client/.upstream-git/' >> .gitignore
```

- [ ] **Step 3: Write `scripts/setup.ps1`**

```powershell
# Idempotent bootstrap: ensures upstream clones exist at pinned shas, installs deps, packs the cache once.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$bun = "$env:USERPROFILE\.bun\bin\bun.exe"
if (-not (Test-Path $bun)) { throw "Bun not found at $bun. Install: irm bun.sh/install.ps1 | iex" }

$repos = @{
  'engine/server'  = 'https://github.com/LostCityRS/Engine-TS'
  'engine/content' = 'https://github.com/LostCityRS/Content'
}
$lock = @{}
Get-Content "$root\scripts\upstream.lock" | ForEach-Object {
  $parts = $_ -split ' '
  if ($parts.Length -eq 2) { $lock[$parts[0]] = $parts[1] }
}

foreach ($rel in $repos.Keys) {
  $dir = Join-Path $root $rel
  if (-not (Test-Path "$dir\.git")) {
    Write-Host "== cloning $rel"
    git clone --single-branch -b 225 $repos[$rel] $dir
  }
  $sha = $lock[$rel]
  if ($sha) {
    Write-Host "== pinning $rel to $sha"
    git -C $dir fetch --depth 1 origin $sha 2>$null
    git -C $dir checkout -q $sha
  }
}

$engine = Join-Path $root 'engine\server'
if (-not (Test-Path "$engine\.env")) {
  Copy-Item "$engine\.env.example" "$engine\.env"
  Add-Content "$engine\.env" "`n## IDLESCAPE`nWEB_PORT=8888`nWEBSITE_REGISTRATION=false`n"
}
Push-Location $engine
& $bun install
Pop-Location

Push-Location (Join-Path $root 'client')
& $bun install
Pop-Location

Write-Host "setup complete"
```

- [ ] **Step 4: Root `package.json` and `.editorconfig`**

`package.json`:

```json
{
  "name": "idlescape",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "setup": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup.ps1",
    "dev": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-stack.ps1",
    "build": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1",
    "verify": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1"
  }
}
```

`.editorconfig`:

```
root = true
[*]
end_of_line = lf
insert_final_newline = true
charset = utf-8
indent_style = space
indent_size = 2
[*.ps1]
end_of_line = crlf
```

- [ ] **Step 5: Verify setup is idempotent and the engine still boots**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup.ps1
Set-Location engine\server; & "$env:USERPROFILE\.bun\bin\bun.exe" run src/app.ts
```

Expected: setup prints "setup complete" without cloning (dirs exist); the engine logs `World ready: Visit http://localhost:8888/rs2.cgi` within about a minute (no repack because `data/pack` moved with it). Stop it with Ctrl+C.

- [ ] **Step 6: Update README top section**

Replace the "Layout" and "Run" sections of `README.md` with the new layout from the File Structure above and the commands `npm run setup`, `npm run dev`, `npm run build`, `npm run verify`. Keep the validation and verification history sections.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: restructure into engine/, client/, scripts/ with pinned upstream"
```

---

### Task 2: Server scaffold, env, and health endpoint

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/bunfig.toml`, `server/.env.example`, `server/src/env.ts`, `server/src/types.ts`, `server/src/health.ts`, `server/src/index.ts`
- Test: `server/src/env.test.ts`, `server/src/health.test.ts`

**Interfaces:**
- Produces: `loadEnv(source?: Record<string, string | undefined>): Env` in `env.ts`.
- Produces: `createHealth(opts: { engineHttp: string; intervalMs: number; fetchImpl?: typeof fetch }): Health` with `Health.start()`, `Health.stop()`, `Health.snapshot(): HealthSnapshot`.
- Produces: `HealthSnapshot = { engine: 'up' | 'down'; engineUptimeMs: number; version: string }` in `types.ts`.

- [ ] **Step 1: Package files**

`server/package.json`:

```json
{
  "name": "@idlescape/server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "start": "bun run src/index.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "firebase-admin": "^13.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.9.0"
  }
}
```

`server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["bun-types"],
    "lib": ["ES2022"]
  },
  "include": ["src/**/*.ts"]
}
```

`server/bunfig.toml`:

```toml
[test]
timeout = 15000
```

`server/.env.example`:

```
PORT=8787
ENGINE_HTTP=http://127.0.0.1:8888
ENGINE_WS=ws://127.0.0.1:8888
GATE_ENABLED=true
GATE_PASSWORD=fiddlesticks
GATE_SECRET=change-me-32-random-chars
FIREBASE_PROJECT_ID=idlescape-osrs
GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json
FIREBASE_EMULATORS=false
PUBLIC_ORIGIN=https://osrs.scotho.com
WEB_DIST=../web/dist
CLIENT_OUT=../client/out
ENGINE_PUBLIC=../engine/server/public
```

Run `cd server && bun install`.

- [ ] **Step 2: Write the failing env test**

`server/src/env.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { loadEnv } from './env';

const base = {
  PORT: '8787',
  ENGINE_HTTP: 'http://127.0.0.1:8888',
  ENGINE_WS: 'ws://127.0.0.1:8888',
  GATE_ENABLED: 'true',
  GATE_PASSWORD: 'fiddlesticks',
  GATE_SECRET: 'x'.repeat(32),
  FIREBASE_PROJECT_ID: 'idlescape-osrs',
  GOOGLE_APPLICATION_CREDENTIALS: './secrets/firebase-admin.json',
  FIREBASE_EMULATORS: 'false',
  PUBLIC_ORIGIN: 'https://osrs.scotho.com',
  WEB_DIST: '../web/dist',
  CLIENT_OUT: '../client/out',
  ENGINE_PUBLIC: '../engine/server/public'
};

describe('loadEnv', () => {
  test('parses a complete environment', () => {
    const env = loadEnv(base);
    expect(env.port).toBe(8787);
    expect(env.gateEnabled).toBe(true);
    expect(env.firebaseEmulators).toBe(false);
    expect(env.engineHttp).toBe('http://127.0.0.1:8888');
  });

  test('rejects a missing gate secret when the gate is enabled', () => {
    expect(() => loadEnv({ ...base, GATE_SECRET: '' })).toThrow(/GATE_SECRET/);
  });

  test('allows an empty gate secret when the gate is disabled', () => {
    const env = loadEnv({ ...base, GATE_ENABLED: 'false', GATE_SECRET: '' });
    expect(env.gateEnabled).toBe(false);
  });

  test('rejects a non-numeric port', () => {
    expect(() => loadEnv({ ...base, PORT: 'abc' })).toThrow(/PORT/);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd server && bun test src/env.test.ts`
Expected: FAIL, cannot find module `./env`.

- [ ] **Step 4: Implement `types.ts` and `env.ts`**

`server/src/types.ts`:

```ts
export interface Env {
  port: number;
  engineHttp: string;
  engineWs: string;
  gateEnabled: boolean;
  gatePassword: string;
  gateSecret: string;
  firebaseProjectId: string;
  googleCredentialsPath: string;
  firebaseEmulators: boolean;
  publicOrigin: string;
  webDist: string;
  clientOut: string;
  enginePublic: string;
}

export interface HealthSnapshot {
  engine: 'up' | 'down';
  engineUptimeMs: number;
  version: string;
}

export interface BridgeResponse {
  gameName: string;
  secret: string;
}

export interface GameAccountDoc {
  gameName: string;
  secret: string;
  createdAt: number;
}
```

`server/src/env.ts`:

```ts
import type { Env } from './types';

function str(src: Record<string, string | undefined>, key: string, fallback?: string): string {
  const v = src[key];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`${key} is required`);
  }
  return v;
}

function bool(src: Record<string, string | undefined>, key: string, fallback: boolean): boolean {
  const v = src[key];
  if (v === undefined || v === '') return fallback;
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new Error(`${key} must be true or false`);
}

function int(src: Record<string, string | undefined>, key: string, fallback: number): number {
  const v = src[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${key} must be a positive integer`);
  return n;
}

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const gateEnabled = bool(source, 'GATE_ENABLED', true);
  const gateSecret = source.GATE_SECRET ?? '';
  if (gateEnabled && gateSecret.length < 16) {
    throw new Error('GATE_SECRET must be at least 16 characters when GATE_ENABLED=true');
  }
  return {
    port: int(source, 'PORT', 8787),
    engineHttp: str(source, 'ENGINE_HTTP', 'http://127.0.0.1:8888'),
    engineWs: str(source, 'ENGINE_WS', 'ws://127.0.0.1:8888'),
    gateEnabled,
    gatePassword: str(source, 'GATE_PASSWORD', 'fiddlesticks'),
    gateSecret,
    firebaseProjectId: str(source, 'FIREBASE_PROJECT_ID', 'idlescape-osrs'),
    googleCredentialsPath: str(source, 'GOOGLE_APPLICATION_CREDENTIALS', './secrets/firebase-admin.json'),
    firebaseEmulators: bool(source, 'FIREBASE_EMULATORS', false),
    publicOrigin: str(source, 'PUBLIC_ORIGIN', 'http://localhost:8787'),
    webDist: str(source, 'WEB_DIST', '../web/dist'),
    clientOut: str(source, 'CLIENT_OUT', '../client/out'),
    enginePublic: str(source, 'ENGINE_PUBLIC', '../engine/server/public')
  };
}
```

- [ ] **Step 5: Run env tests**

Run: `cd server && bun test src/env.test.ts`
Expected: 4 pass.

- [ ] **Step 6: Write the failing health test**

`server/src/health.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { createHealth } from './health';

function fakeFetch(status: number | 'throw'): typeof fetch {
  return (async () => {
    if (status === 'throw') throw new Error('ECONNREFUSED');
    return new Response(null, { status });
  }) as unknown as typeof fetch;
}

describe('health', () => {
  test('starts down, goes up after a successful probe', async () => {
    const h = createHealth({ engineHttp: 'http://engine', intervalMs: 60_000, fetchImpl: fakeFetch(200) });
    expect(h.snapshot().engine).toBe('down');
    await h.probe();
    expect(h.snapshot().engine).toBe('up');
    expect(h.snapshot().engineUptimeMs).toBeGreaterThanOrEqual(0);
  });

  test('goes down when the probe throws and resets uptime', async () => {
    const h = createHealth({ engineHttp: 'http://engine', intervalMs: 60_000, fetchImpl: fakeFetch(200) });
    await h.probe();
    h.setFetch(fakeFetch('throw'));
    await h.probe();
    expect(h.snapshot().engine).toBe('down');
    expect(h.snapshot().engineUptimeMs).toBe(0);
  });

  test('treats non-2xx as down', async () => {
    const h = createHealth({ engineHttp: 'http://engine', intervalMs: 60_000, fetchImpl: fakeFetch(503) });
    await h.probe();
    expect(h.snapshot().engine).toBe('down');
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd server && bun test src/health.test.ts`
Expected: FAIL, cannot find module `./health`.

- [ ] **Step 8: Implement `health.ts`**

```ts
import type { HealthSnapshot } from './types';

export const SERVER_VERSION = '0.1.0';

export interface Health {
  start(): void;
  stop(): void;
  probe(): Promise<void>;
  setFetch(f: typeof fetch): void;
  snapshot(): HealthSnapshot;
}

export function createHealth(opts: { engineHttp: string; intervalMs: number; fetchImpl?: typeof fetch }): Health {
  let fetchImpl: typeof fetch = opts.fetchImpl ?? fetch;
  let up = false;
  let upSince = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  async function probe(): Promise<void> {
    let ok = false;
    try {
      const res = await fetchImpl(`${opts.engineHttp}/rs2.cgi`, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
      ok = res.status >= 200 && res.status < 300;
    } catch {
      ok = false;
    }
    if (ok && !up) upSince = Date.now();
    if (!ok) upSince = 0;
    up = ok;
  }

  return {
    start() {
      if (timer) return;
      void probe();
      timer = setInterval(() => void probe(), opts.intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    probe,
    setFetch(f) { fetchImpl = f; },
    snapshot() {
      return { engine: up ? 'up' : 'down', engineUptimeMs: up ? Date.now() - upSince : 0, version: SERVER_VERSION };
    }
  };
}
```

- [ ] **Step 9: Run health tests**

Run: `cd server && bun test src/health.test.ts`
Expected: 3 pass.

- [ ] **Step 10: Minimal `index.ts` serving `/api/health`**

```ts
import { loadEnv } from './env';
import { createHealth } from './health';

const env = loadEnv();
const health = createHealth({ engineHttp: env.engineHttp, intervalMs: 10_000 });
health.start();

const server = Bun.serve({
  port: env.port,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/api/health' && req.method === 'GET') {
      return Response.json(health.snapshot());
    }
    return new Response('Not found', { status: 404 });
  }
});

console.log(`[idlescape] front server on http://localhost:${server.port} -> engine ${env.engineHttp}`);
```

Run: `cd server && cp .env.example .env && bun run src/index.ts` in one terminal, then `curl -s http://localhost:8787/api/health` in another.
Expected: `{"engine":"down"...}` if the engine is stopped, `"up"` if it is running. Stop the server.

- [ ] **Step 11: Commit**

```bash
git add server
git commit -m "feat(server): scaffold with typed env and engine health probe"
```

---

### Task 3: Gate cookie, middleware, and POST /api/gate

**Files:**
- Create: `server/src/gate.ts`
- Modify: `server/src/index.ts`
- Test: `server/src/gate.test.ts`

**Interfaces:**
- Produces: `signGate(secret: string, expMs: number): string`, `verifyGate(secret: string, cookieValue: string, nowMs?: number): boolean`.
- Produces: `createGate(env: Env): Gate` with `Gate.isOpen(req: Request): boolean` (true when the gate is disabled or the cookie verifies), `Gate.handlePost(req: Request, ip: string): Promise<Response>`, `Gate.deny(): Response` (401 JSON).
- Consumes: `Env` from Task 2.

- [ ] **Step 1: Write the failing tests**

`server/src/gate.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { createGate, signGate, verifyGate } from './gate';
import { loadEnv } from './env';

const secret = 's'.repeat(32);
const env = loadEnv({ GATE_ENABLED: 'true', GATE_PASSWORD: 'fiddlesticks', GATE_SECRET: secret });

describe('gate cookie', () => {
  test('round-trips a signed value', () => {
    const v = signGate(secret, Date.now() + 1000);
    expect(verifyGate(secret, v)).toBe(true);
  });
  test('rejects a tampered signature', () => {
    const v = signGate(secret, Date.now() + 1000);
    expect(verifyGate(secret, v.slice(0, -2) + 'zz')).toBe(false);
  });
  test('rejects an expired value', () => {
    const v = signGate(secret, Date.now() - 1);
    expect(verifyGate(secret, v)).toBe(false);
  });
  test('rejects garbage', () => {
    expect(verifyGate(secret, 'nope')).toBe(false);
    expect(verifyGate(secret, '')).toBe(false);
  });
});

describe('gate middleware', () => {
  test('isOpen is false without a cookie and true with a valid one', () => {
    const gate = createGate(env);
    expect(gate.isOpen(new Request('http://x/'))).toBe(false);
    const v = signGate(secret, Date.now() + 1000);
    expect(gate.isOpen(new Request('http://x/', { headers: { cookie: `cs_gate=${v}; other=1` } }))).toBe(true);
  });
  test('isOpen is always true when disabled', () => {
    const gate = createGate(loadEnv({ GATE_ENABLED: 'false' }));
    expect(gate.isOpen(new Request('http://x/'))).toBe(true);
  });
  test('handlePost sets a cookie on the right password', async () => {
    const gate = createGate(env);
    const res = await gate.handlePost(new Request('http://x/api/gate', { method: 'POST', body: JSON.stringify({ password: 'fiddlesticks' }), headers: { 'content-type': 'application/json' } }), '1.1.1.1');
    expect(res.status).toBe(204);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('cs_gate=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });
  test('handlePost rejects the wrong password and cools down the ip', async () => {
    const gate = createGate(env);
    const bad = () => gate.handlePost(new Request('http://x/api/gate', { method: 'POST', body: JSON.stringify({ password: 'no' }), headers: { 'content-type': 'application/json' } }), '2.2.2.2');
    expect((await bad()).status).toBe(401);
    const second = await bad();
    expect(second.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && bun test src/gate.test.ts`
Expected: FAIL, cannot find module `./gate`.

- [ ] **Step 3: Implement `gate.ts`**

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Env } from './types';

export const GATE_COOKIE = 'cs_gate';
const GATE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 3000;

function hmac(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function signGate(secret: string, expMs: number): string {
  const exp = String(expMs);
  return `${exp}.${hmac(secret, exp)}`;
}

export function verifyGate(secret: string, cookieValue: string, nowMs: number = Date.now()): boolean {
  const dot = cookieValue.indexOf('.');
  if (dot <= 0) return false;
  const exp = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  const expected = hmac(secret, exp);
  if (sig.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  const expMs = Number(exp);
  return Number.isFinite(expMs) && expMs > nowMs;
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

export interface Gate {
  isOpen(req: Request): boolean;
  handlePost(req: Request, ip: string): Promise<Response>;
  deny(): Response;
}

export function createGate(env: Env): Gate {
  const cooldownUntil = new Map<string, number>();
  return {
    isOpen(req) {
      if (!env.gateEnabled) return true;
      const value = readCookie(req, GATE_COOKIE);
      return value !== null && verifyGate(env.gateSecret, value);
    },
    async handlePost(req, ip) {
      const now = Date.now();
      const until = cooldownUntil.get(ip) ?? 0;
      if (until > now) return Response.json({ error: 'cooldown' }, { status: 429 });
      let password = '';
      try {
        const body = (await req.json()) as { password?: unknown };
        password = typeof body.password === 'string' ? body.password : '';
      } catch {
        password = '';
      }
      if (password !== env.gatePassword) {
        cooldownUntil.set(ip, now + COOLDOWN_MS);
        return Response.json({ error: 'wrong password' }, { status: 401 });
      }
      const value = signGate(env.gateSecret, now + GATE_TTL_MS);
      const secure = env.publicOrigin.startsWith('https:') ? '; Secure' : '';
      return new Response(null, {
        status: 204,
        headers: { 'set-cookie': `${GATE_COOKIE}=${value}; Path=/; Max-Age=${GATE_TTL_MS / 1000}; HttpOnly; SameSite=Lax${secure}` }
      });
    },
    deny() {
      return Response.json({ error: 'gate' }, { status: 401 });
    }
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd server && bun test src/gate.test.ts`
Expected: 8 pass.

- [ ] **Step 5: Wire into `index.ts`**

Replace the fetch handler body:

```ts
import { loadEnv } from './env';
import { createHealth } from './health';
import { createGate } from './gate';

const env = loadEnv();
const health = createHealth({ engineHttp: env.engineHttp, intervalMs: 10_000 });
health.start();
const gate = createGate(env);

function clientIp(req: Request, server: { requestIP(req: Request): { address: string } | null }): string {
  return req.headers.get('cf-connecting-ip') ?? server.requestIP(req)?.address ?? '0.0.0.0';
}

const server = Bun.serve({
  port: env.port,
  async fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === '/api/health' && req.method === 'GET') return Response.json(health.snapshot());
    if (url.pathname === '/api/gate' && req.method === 'POST') return gate.handlePost(req, clientIp(req, srv));
    if (!gate.isOpen(req)) return gate.deny();
    return new Response('Not found', { status: 404 });
  }
});

console.log(`[idlescape] front server on http://localhost:${server.port} -> engine ${env.engineHttp}`);
```

Manual check: `curl -i -X POST localhost:8787/api/gate -H 'content-type: application/json' -d '{"password":"fiddlesticks"}'` returns 204 with `set-cookie`; a GET to `/anything` without the cookie returns 401 JSON.

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat(server): signed gate cookie with cooldown"
```

---

### Task 4: Router, static serving, and cache proxy

**Files:**
- Create: `server/src/router.ts`, `server/src/static.ts`, `server/src/proxy/http.ts`
- Modify: `server/src/index.ts`
- Test: `server/src/router.test.ts`, `server/src/proxy/http.test.ts`

**Interfaces:**
- Produces: `classify(pathname: string, isUpgrade: boolean): Route` where `Route = { kind: 'health' } | { kind: 'gate' } | { kind: 'bridge' } | { kind: 'ws' } | { kind: 'cache' } | { kind: 'client'; file: string } | { kind: 'static'; file: string } | { kind: 'index' } | { kind: 'notfound' }`.
- Produces: `serveStatic(env: Env, route: Route): Promise<Response>` for `index`, `static`, `client`.
- Produces: `proxyHttp(env: Env, req: Request): Promise<Response>` for `cache`.

- [ ] **Step 1: Write the failing router test**

`server/src/router.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { classify } from './router';

describe('classify', () => {
  test('api routes', () => {
    expect(classify('/api/health', false)).toEqual({ kind: 'health' });
    expect(classify('/api/gate', false)).toEqual({ kind: 'gate' });
    expect(classify('/api/bridge', false)).toEqual({ kind: 'bridge' });
  });
  test('websocket upgrade at root', () => {
    expect(classify('/', true)).toEqual({ kind: 'ws' });
  });
  test('index at root without upgrade', () => {
    expect(classify('/', false)).toEqual({ kind: 'index' });
  });
  test('engine cache endpoints', () => {
    for (const p of ['/crc', '/title', '/config', '/interface', '/media', '/models', '/textures', '/wordenc', '/sounds', '/scape_main_12345678.mid']) {
      expect(classify(p, false)).toEqual({ kind: 'cache' });
    }
  });
  test('client bundle files', () => {
    expect(classify('/client/client.js', false)).toEqual({ kind: 'client', file: 'client.js' });
    expect(classify('/client/bzip2.wasm', false)).toEqual({ kind: 'client', file: 'bzip2.wasm' });
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
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && bun test src/router.test.ts`
Expected: FAIL, cannot find module `./router`.

- [ ] **Step 3: Implement `router.ts`**

```ts
export type Route =
  | { kind: 'health' }
  | { kind: 'gate' }
  | { kind: 'bridge' }
  | { kind: 'ws' }
  | { kind: 'cache' }
  | { kind: 'client'; file: string }
  | { kind: 'static'; file: string }
  | { kind: 'index' }
  | { kind: 'notfound' };

const CACHE_PREFIXES = ['/crc', '/title', '/config', '/interface', '/media', '/models', '/textures', '/wordenc', '/sounds'];
const SAFE_FILE = /^[A-Za-z0-9._-]+$/;

function safeSegments(rest: string): string | null {
  if (rest.includes('%')) return null;
  const parts = rest.split('/');
  if (parts.some(p => p === '' || p === '.' || p === '..' || !SAFE_FILE.test(p))) return null;
  return parts.join('/');
}

export function classify(pathname: string, isUpgrade: boolean): Route {
  if (pathname === '/') return isUpgrade ? { kind: 'ws' } : { kind: 'index' };
  if (pathname === '/api/health') return { kind: 'health' };
  if (pathname === '/api/gate') return { kind: 'gate' };
  if (pathname === '/api/bridge') return { kind: 'bridge' };
  if (pathname.endsWith('.mid') || CACHE_PREFIXES.some(p => pathname.startsWith(p))) return { kind: 'cache' };
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
```

- [ ] **Step 4: Run router tests**

Run: `cd server && bun test src/router.test.ts`
Expected: 8 pass.

- [ ] **Step 5: Implement `static.ts`**

```ts
import path from 'node:path';
import type { Env } from './types';
import type { Route } from './router';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.sf2': 'application/octet-stream'
};

function mime(file: string): string {
  return MIME[path.extname(file)] ?? 'application/octet-stream';
}

async function fileResponse(abs: string, cache: string): Promise<Response | null> {
  const f = Bun.file(abs);
  if (!(await f.exists())) return null;
  return new Response(f, { headers: { 'content-type': mime(abs), 'cache-control': cache } });
}

export async function serveStatic(env: Env, route: Route): Promise<Response> {
  if (route.kind === 'index') {
    const res = await fileResponse(path.join(env.webDist, 'index.html'), 'no-cache');
    return res ?? new Response('web build missing: run scripts/build.ps1', { status: 503 });
  }
  if (route.kind === 'static') {
    const res = await fileResponse(path.join(env.webDist, route.file), 'public, max-age=31536000, immutable');
    return res ?? new Response('Not found', { status: 404 });
  }
  if (route.kind === 'client') {
    // Prefer our client build; fall back to the engine's shipped companions (deps.js, soundfont).
    const ours = await fileResponse(path.join(env.clientOut, route.file), 'no-cache');
    if (ours) return ours;
    const theirs = await fileResponse(path.join(env.enginePublic, 'client', route.file), 'public, max-age=86400');
    return theirs ?? new Response('Not found', { status: 404 });
  }
  return new Response('Not found', { status: 404 });
}
```

- [ ] **Step 6: Write the failing proxy test**

`server/src/proxy/http.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { proxyHttp } from './http';
import { loadEnv } from '../env';

let upstream: ReturnType<typeof Bun.serve>;
let env: ReturnType<typeof loadEnv>;

beforeAll(() => {
  upstream = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/crc') return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'application/octet-stream' } });
      if (url.pathname === '/boom') return new Response('x', { status: 500 });
      return new Response('nf', { status: 404 });
    }
  });
  env = loadEnv({ GATE_ENABLED: 'false', ENGINE_HTTP: `http://127.0.0.1:${upstream.port}` });
});
afterAll(() => upstream.stop(true));

describe('proxyHttp', () => {
  test('forwards path, status, body and content type', async () => {
    const res = await proxyHttp(env, new Request('http://front/crc'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
  test('passes upstream errors through', async () => {
    expect((await proxyHttp(env, new Request('http://front/boom'))).status).toBe(500);
  });
  test('returns 502 when upstream is unreachable', async () => {
    const dead = loadEnv({ GATE_ENABLED: 'false', ENGINE_HTTP: 'http://127.0.0.1:1' });
    expect((await proxyHttp(dead, new Request('http://front/crc'))).status).toBe(502);
  });
});
```

- [ ] **Step 7: Run to verify failure**

Run: `cd server && bun test src/proxy/http.test.ts`
Expected: FAIL, cannot find module `./http`.

- [ ] **Step 8: Implement `proxy/http.ts`**

```ts
import type { Env } from '../types';

export async function proxyHttp(env: Env, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const target = `${env.engineHttp}${url.pathname}${url.search}`;
  try {
    const upstream = await fetch(target, { method: 'GET', signal: AbortSignal.timeout(30_000) });
    const headers = new Headers();
    const ct = upstream.headers.get('content-type');
    if (ct) headers.set('content-type', ct);
    headers.set('cache-control', 'public, max-age=3600');
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return new Response('engine unreachable', { status: 502 });
  }
}
```

- [ ] **Step 9: Run proxy tests**

Run: `cd server && bun test src/proxy/http.test.ts`
Expected: 3 pass.

- [ ] **Step 10: Wire router, static, and proxy into `index.ts`**

Replace the fetch handler:

```ts
import { loadEnv } from './env';
import { createHealth } from './health';
import { createGate } from './gate';
import { classify } from './router';
import { serveStatic } from './static';
import { proxyHttp } from './proxy/http';

const env = loadEnv();
const health = createHealth({ engineHttp: env.engineHttp, intervalMs: 10_000 });
health.start();
const gate = createGate(env);

function clientIp(req: Request, server: { requestIP(req: Request): { address: string } | null }): string {
  return req.headers.get('cf-connecting-ip') ?? server.requestIP(req)?.address ?? '0.0.0.0';
}

const server = Bun.serve({
  port: env.port,
  async fetch(req, srv) {
    const url = new URL(req.url);
    const isUpgrade = req.headers.get('upgrade')?.toLowerCase() === 'websocket';
    const route = classify(url.pathname, isUpgrade);
    switch (route.kind) {
      case 'health': return Response.json(health.snapshot());
      case 'gate': return req.method === 'POST' ? gate.handlePost(req, clientIp(req, srv)) : new Response(null, { status: 405 });
      case 'index':
      case 'static':
        return serveStatic(env, route);
      default: break;
    }
    if (!gate.isOpen(req)) return gate.deny();
    switch (route.kind) {
      case 'client': return serveStatic(env, route);
      case 'cache': return health.snapshot().engine === 'up' ? proxyHttp(env, req) : new Response('world offline', { status: 503 });
      case 'ws': return new Response('websocket proxy not implemented yet', { status: 501 });
      case 'bridge': return new Response('bridge not implemented yet', { status: 501 });
      default: return new Response('Not found', { status: 404 });
    }
  }
});

console.log(`[idlescape] front server on http://localhost:${server.port} -> engine ${env.engineHttp}`);
```

Index and `/assets/*` are served before the gate check so the gate page itself can load; `/client/*` and cache stay behind it.

- [ ] **Step 11: Manual check against the running engine**

With the engine running: `curl -s -o /dev/null -w "%{http_code} %{content_type}\n" -b "cs_gate=$(curl -s -i -X POST localhost:8787/api/gate -H 'content-type: application/json' -d '{"password":"fiddlesticks"}' | grep -o 'cs_gate=[^;]*' | cut -d= -f2)" localhost:8787/crc`
Expected: `200 application/octet-stream`. Without the cookie: `401`.

- [ ] **Step 12: Commit**

```bash
git add server
git commit -m "feat(server): route classification, static serving, engine cache proxy"
```

---

### Task 5: WebSocket relay to the engine

**Files:**
- Create: `server/src/proxy/ws.ts`
- Modify: `server/src/index.ts`
- Test: `server/src/proxy/ws.test.ts`

**Interfaces:**
- Produces: `openUpstream(engineWs: string): Promise<WebSocket>` (resolves on open, rejects on error/timeout).
- Produces: `RelayData = { upstream: WebSocket; pending: ArrayBuffer[] }` stored as Bun's per-socket `data`.
- Produces: `relayHandlers: WebSocketHandler<RelayData>` for `Bun.serve({ websocket })`, and `safeCloseCode(code: number): number`.

- [ ] **Step 1: Write the failing test**

`server/src/proxy/ws.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { openUpstream, relayHandlers, safeCloseCode, type RelayData } from './ws';

let upstream: ReturnType<typeof Bun.serve>;
let front: ReturnType<typeof Bun.serve<RelayData>>;

beforeAll(() => {
  // Fake engine: greets with 8 bytes on open (like the login seed), echoes binary frames, closes with 4321 on "bye".
  upstream = Bun.serve({
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
      const up = await openUpstream(engineWs);
      if (srv.upgrade(req, { data: { upstream: up, pending: [] }, headers: { 'sec-websocket-protocol': 'binary' } })) return undefined;
      up.close();
      return new Response('nf', { status: 404 });
    },
    websocket: relayHandlers
  });
});
afterAll(() => { front.stop(true); upstream.stop(true); });

function connect(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${front.port}/`, 'binary');
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error('connect failed'));
  });
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
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && bun test src/proxy/ws.test.ts`
Expected: FAIL, cannot find module `./ws`.

- [ ] **Step 3: Implement `proxy/ws.ts`**

```ts
import type { ServerWebSocket, WebSocketHandler } from 'bun';

export interface RelayData {
  upstream: WebSocket;
  pending: ArrayBuffer[];
}

const OPEN_TIMEOUT_MS = 5000;

export function safeCloseCode(code: number): number {
  if (code === 1000) return 1000;
  if (code >= 3000 && code <= 4999) return code;
  return 1011;
}

export function openUpstream(engineWs: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(engineWs, 'binary');
    ws.binaryType = 'arraybuffer';
    const timer = setTimeout(() => { ws.close(); reject(new Error('upstream open timeout')); }, OPEN_TIMEOUT_MS);
    ws.onopen = () => { clearTimeout(timer); resolve(ws); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('upstream error')); };
  });
}

function toBytes(msg: string | Buffer | ArrayBuffer | Uint8Array): Uint8Array {
  if (typeof msg === 'string') return new TextEncoder().encode(msg);
  if (msg instanceof ArrayBuffer) return new Uint8Array(msg);
  return new Uint8Array(msg.buffer, msg.byteOffset, msg.byteLength);
}

export const relayHandlers: WebSocketHandler<RelayData> = {
  open(ws: ServerWebSocket<RelayData>) {
    const up = ws.data.upstream;
    up.onmessage = e => {
      const bytes = toBytes(e.data as ArrayBuffer | string);
      if (ws.readyState === 1) ws.send(bytes, true);
    };
    up.onclose = e => {
      if (ws.readyState === 1) ws.close(safeCloseCode(e.code), e.reason.slice(0, 120));
    };
    up.onerror = () => {
      if (ws.readyState === 1) ws.close(1011, 'upstream error');
    };
    for (const buf of ws.data.pending) up.send(buf);
    ws.data.pending = [];
  },
  message(ws, msg) {
    const up = ws.data.upstream;
    const bytes = toBytes(msg);
    if (up.readyState === WebSocket.OPEN) up.send(bytes);
    else if (up.readyState === WebSocket.CONNECTING) ws.data.pending.push(bytes.slice().buffer);
  },
  close(ws, code, reason) {
    const up = ws.data.upstream;
    if (up.readyState === WebSocket.OPEN || up.readyState === WebSocket.CONNECTING) up.close(safeCloseCode(code), reason);
  }
};
```

- [ ] **Step 4: Run tests**

Run: `cd server && bun test src/proxy/ws.test.ts`
Expected: 4 pass. If the greeting test flakes because upstream frames arrive before the browser-side `open` handler is registered, the fix is already in place: the upstream `onmessage` is set in `open`, and Bun invokes `open` before delivering any frames. If it still flakes, buffer upstream frames in `openUpstream` until `onmessage` is assigned.

- [ ] **Step 5: Wire into `index.ts`**

Add the import and replace the `ws` case and the `Bun.serve` generic:

```ts
import { openUpstream, relayHandlers, type RelayData } from './proxy/ws';
// ...
const server = Bun.serve<RelayData>({
  port: env.port,
  async fetch(req, srv) {
    // ... unchanged up to the gated switch ...
      case 'ws': {
        if (health.snapshot().engine !== 'up') return new Response('world offline', { status: 503 });
        let up: WebSocket;
        try { up = await openUpstream(env.engineWs); } catch { return new Response('engine unreachable', { status: 502 }); }
        const ok = srv.upgrade(req, { data: { upstream: up, pending: [] }, headers: { 'sec-websocket-protocol': 'binary' } });
        if (ok) return undefined;
        up.close();
        return new Response('upgrade failed', { status: 400 });
      }
  },
  websocket: relayHandlers
});
```

- [ ] **Step 6: Integration check with the real client**

Temporarily copy the engine's `view/client.ejs` rendering into a static `server/dev-index.html` is unnecessary: instead run the existing Playwright verifier against the front server by pointing it at `http://localhost:8787/rs2.cgi`? No: `/rs2.cgi` is not served by the front server. Do this instead: with engine and front server running, open `http://localhost:8888/rs2.cgi` in the browser dev tools console and run

```js
const ws = new WebSocket('ws://localhost:8787/', 'binary'); ws.binaryType='arraybuffer';
ws.onmessage = e => console.log('greeting bytes', e.data.byteLength); ws.onclose = e => console.log('closed', e.code);
```

after first calling `fetch('http://localhost:8787/api/gate', {method:'POST', credentials:'include', headers:{'content-type':'application/json'}, body:'{"password":"fiddlesticks"}'})` from a tab on `localhost:8787` (open `http://localhost:8787/api/health` for that). Expected: `greeting bytes 8`. The full browser flow is verified end to end in Task 14 once the shell exists.

- [ ] **Step 7: Commit**

```bash
git add server
git commit -m "feat(server): binary websocket relay to the engine with mirrored close codes"
```

---

### Task 6: Firebase project resources, rules, and emulators

**Files:**
- Create: `firebase/firebase.json`, `firebase/.firebaserc`, `firebase/firestore.rules`, `firebase/firestore.indexes.json`, `firebase/package.json`, `firebase/rules.test.ts`, `server/secrets/.gitkeep`
- Modify: `README.md` (Firebase section)

**Interfaces:**
- Produces: Firestore collections `users/{uid}`, `gameAccounts/{uid}`, `gameNames/{name}` with the rules below; emulator ports Auth `9099`, Firestore `8080`.
- Produces: the service-account key at `server/secrets/firebase-admin.json` (git-ignored) and the web app config values for Task 11.

- [ ] **Step 1: Create cloud resources with gcloud (one time)**

```bash
gcloud config set project idlescape-osrs
gcloud services enable firestore.googleapis.com identitytoolkit.googleapis.com
gcloud firestore databases create --database="(default)" --location=nam5 --type=firestore-native
gcloud iam service-accounts create idlescape-server --display-name "Idlescape front server"
gcloud projects add-iam-policy-binding idlescape-osrs \
  --member "serviceAccount:idlescape-server@idlescape-osrs.iam.gserviceaccount.com" \
  --role roles/firebase.sdkAdminServiceAgent
mkdir -p server/secrets
gcloud iam service-accounts keys create server/secrets/firebase-admin.json \
  --iam-account idlescape-server@idlescape-osrs.iam.gserviceaccount.com
firebase apps:create web idlescape-web --project idlescape-osrs
firebase apps:sdkconfig web --project idlescape-osrs
```

Expected: each command succeeds; the last prints `apiKey`, `authDomain`, `projectId`, `appId`, `messagingSenderId`. Save those five values for Task 11's `web/.env.example`.

- [ ] **Step 2: Firebase config files**

`firebase/.firebaserc`:

```json
{ "projects": { "default": "idlescape-osrs" } }
```

`firebase/firebase.json`:

```json
{
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": false },
    "singleProjectMode": true
  }
}
```

`firebase/firestore.indexes.json`:

```json
{ "indexes": [], "fieldOverrides": [] }
```

`firebase/firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Public profile. gameName is server-owned: clients may not set or change it.
    match /users/{uid} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == uid
                    && request.resource.data.displayName is string
                    && request.resource.data.displayName.size() >= 1
                    && request.resource.data.displayName.size() <= 20
                    && !('gameName' in request.resource.data);
      allow update: if request.auth != null && request.auth.uid == uid
                    && (!('gameName' in request.resource.data)
                        || request.resource.data.gameName == resource.data.gameName)
                    && (!('createdAt' in request.resource.data)
                        || request.resource.data.createdAt == resource.data.createdAt);
      allow delete: if false;
    }
    // Server-only: game credentials and the name uniqueness index.
    match /gameAccounts/{uid} { allow read, write: if false; }
    match /gameNames/{name}   { allow read: if true; allow write: if false; }
  }
}
```

- [ ] **Step 3: Write the failing rules test**

`firebase/package.json`:

```json
{
  "name": "@idlescape/firebase",
  "private": true,
  "type": "module",
  "scripts": {
    "emulators": "firebase emulators:start --only auth,firestore",
    "test": "firebase emulators:exec --only firestore \"vitest run\"",
    "deploy:rules": "firebase deploy --only firestore"
  },
  "devDependencies": {
    "@firebase/rules-unit-testing": "^4.0.0",
    "firebase": "^12.0.0",
    "vitest": "^3.0.0"
  }
}
```

`firebase/rules.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'idlescape-osrs',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 }
  });
});
beforeEach(() => env.clearFirestore());
afterAll(() => env.cleanup());

describe('users', () => {
  test('owner can create a profile without gameName', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/u1'), { displayName: 'Bob', createdAt: 1 }));
  });
  test('client cannot set gameName', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertFails(setDoc(doc(db, 'users/u1'), { displayName: 'Bob', gameName: 'bob' }));
  });
  test('client cannot change a server-written gameName', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'users/u1'), { displayName: 'Bob', gameName: 'bob', createdAt: 1 });
    });
    const db = env.authenticatedContext('u1').firestore();
    await assertFails(updateDoc(doc(db, 'users/u1'), { gameName: 'other' }));
    await assertSucceeds(updateDoc(doc(db, 'users/u1'), { displayName: 'Robert' }));
  });
  test('other users can read but not write', async () => {
    const db = env.authenticatedContext('u2').firestore();
    await assertSucceeds(getDoc(doc(db, 'users/u1')));
    await assertFails(setDoc(doc(db, 'users/u1'), { displayName: 'x' }));
  });
});

describe('server-only collections', () => {
  test('gameAccounts is unreadable and unwritable by clients', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertFails(getDoc(doc(db, 'gameAccounts/u1')));
    await assertFails(setDoc(doc(db, 'gameAccounts/u1'), { secret: 'x' }));
  });
  test('gameNames is readable but not writable', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'gameNames/bob')));
    await assertFails(setDoc(doc(db, 'gameNames/bob'), { uid: 'u1' }));
  });
});
```

- [ ] **Step 4: Run the rules tests**

Run: `cd firebase && npm install && npm test`
Expected: the emulator starts, 6 tests pass, the emulator stops. (First failure mode to expect: Java is required by the Firestore emulator; Java 21 is installed on this machine.)

- [ ] **Step 5: Deploy rules to the real project**

```bash
cd firebase && npm run deploy:rules
```

Expected: `Deploy complete!`.

- [ ] **Step 6: Document in README**

Add a "Firebase" section to `README.md`: project id, where the key lives, the three collections, `npm run emulators` in `firebase/`, and that Anonymous and Email/Password providers plus the `osrs.scotho.com` authorised domain were enabled in the console on 2026-09-04.

- [ ] **Step 7: Commit**

```bash
git add firebase README.md server/secrets/.gitkeep .gitignore
git commit -m "feat(firebase): project config, firestore rules with emulator tests"
```

---

### Task 7: Admin SDK init and game name rules

**Files:**
- Create: `server/src/firebaseAdmin.ts`, `server/src/gameName.ts`
- Test: `server/src/gameName.test.ts`

**Interfaces:**
- Produces: `initAdmin(env: Env): { auth: Auth; db: Firestore }` (firebase-admin types), emulator-aware.
- Produces: `normaliseGameName(input: string): string | null`, `randomGuestName(rand?: () => number): string`, `withSuffix(base: string, attempt: number): string`, `randomSecret(len?: number): string`.

- [ ] **Step 1: Write the failing test**

`server/src/gameName.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { normaliseGameName, randomGuestName, randomSecret, withSuffix } from './gameName';

describe('normaliseGameName', () => {
  test('lowercases and keeps valid names', () => {
    expect(normaliseGameName('Bob_7')).toBe('bob_7');
  });
  test('replaces spaces and hyphens with underscores', () => {
    expect(normaliseGameName('Old Man-Jenkins')).toBe('old_man_jenk');
  });
  test('strips invalid characters', () => {
    expect(normaliseGameName('b0b!!@#')).toBe('b0b');
  });
  test('truncates to 12', () => {
    expect(normaliseGameName('abcdefghijklmnop')).toBe('abcdefghijkl');
  });
  test('rejects names not starting with a letter or empty after cleaning', () => {
    expect(normaliseGameName('123abc')).toBeNull();
    expect(normaliseGameName('___')).toBeNull();
    expect(normaliseGameName('')).toBeNull();
  });
});

describe('withSuffix', () => {
  test('keeps total length within 12', () => {
    expect(withSuffix('abcdefghijkl', 7)).toBe('abcdefghijk7');
    expect(withSuffix('bob', 42)).toBe('bob42');
  });
});

describe('randomGuestName', () => {
  test('is guest_ plus six lowercase alphanumerics', () => {
    expect(randomGuestName()).toMatch(/^guest_[a-z0-9]{6}$/);
  });
});

describe('randomSecret', () => {
  test('is 20 alphanumerics by default and differs between calls', () => {
    const a = randomSecret();
    expect(a).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(randomSecret()).not.toBe(a);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && bun test src/gameName.test.ts`
Expected: FAIL, cannot find module `./gameName`.

- [ ] **Step 3: Implement `gameName.ts`**

```ts
import { randomInt } from 'node:crypto';

export const GAME_NAME_MAX = 12;
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const LOWER_ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function normaliseGameName(input: string): string | null {
  const cleaned = input
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, GAME_NAME_MAX);
  if (!/^[a-z][a-z0-9_]*$/.test(cleaned)) return null;
  return cleaned;
}

export function withSuffix(base: string, attempt: number): string {
  const suffix = String(attempt);
  return base.slice(0, GAME_NAME_MAX - suffix.length) + suffix;
}

function pick(alphabet: string, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

export function randomGuestName(): string {
  return `guest_${pick(LOWER_ALNUM, 6)}`;
}

export function randomSecret(len: number = 20): string {
  return pick(ALNUM, len);
}
```

- [ ] **Step 4: Run tests**

Run: `cd server && bun test src/gameName.test.ts`
Expected: 9 pass.

- [ ] **Step 5: Implement `firebaseAdmin.ts`**

```ts
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import type { Env } from './types';

export interface Admin { app: App; auth: Auth; db: Firestore }

export function initAdmin(env: Env): Admin {
  if (env.firebaseEmulators) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  }
  const existing = getApps()[0];
  const app = existing ?? (env.firebaseEmulators
    ? initializeApp({ projectId: env.firebaseProjectId })
    : initializeApp({ credential: cert(JSON.parse(readFileSync(env.googleCredentialsPath, 'utf8'))), projectId: env.firebaseProjectId }));
  return { app, auth: getAuth(app), db: getFirestore(app) };
}
```

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat(server): game name rules and emulator-aware admin sdk init"
```

---

### Task 8: Game account bridge endpoint

**Files:**
- Create: `server/src/bridge.ts`
- Modify: `server/src/index.ts`
- Test: `server/src/bridge.test.ts`

**Interfaces:**
- Consumes: `initAdmin`, `normaliseGameName`, `randomGuestName`, `withSuffix`, `randomSecret` (Task 7); `GameAccountDoc`, `BridgeResponse` (Task 2).
- Produces: `createBridge(admin: Admin): Bridge` with `Bridge.handle(req: Request): Promise<Response>` and `Bridge.resolve(uid: string, isAnonymous: boolean, desiredName: string | null): Promise<BridgeResponse>`.

- [ ] **Step 1: Write the failing test (runs against emulators)**

`server/src/bridge.test.ts`:

```ts
import { beforeAll, describe, expect, test } from 'bun:test';
import { createBridge } from './bridge';
import { initAdmin } from './firebaseAdmin';
import { loadEnv } from './env';

// Requires: cd firebase && npm run emulators (auth 9099, firestore 8080).
const env = loadEnv({ GATE_ENABLED: 'false', FIREBASE_EMULATORS: 'true', FIREBASE_PROJECT_ID: 'idlescape-osrs' });
const admin = initAdmin(env);
const bridge = createBridge(admin);

async function idTokenFor(uid: string): Promise<string> {
  const custom = await admin.auth.createCustomToken(uid);
  const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: custom, returnSecureToken: true })
  });
  const json = (await res.json()) as { idToken: string };
  return json.idToken;
}

beforeAll(async () => {
  await fetch('http://127.0.0.1:8080/emulator/v1/projects/idlescape-osrs/databases/(default)/documents', { method: 'DELETE' });
});

describe('bridge.resolve', () => {
  test('creates an account with the desired name and returns the same pair next time', async () => {
    const first = await bridge.resolve('uid-a', false, 'Bob The Great');
    expect(first.gameName).toBe('bob_the_grea');
    expect(first.secret).toMatch(/^[A-Za-z0-9]{20}$/);
    const again = await bridge.resolve('uid-a', false, 'ignored');
    expect(again).toEqual(first);
    const idx = await admin.db.doc('gameNames/bob_the_grea').get();
    expect(idx.data()).toEqual({ uid: 'uid-a' });
    const user = await admin.db.doc('users/uid-a').get();
    expect(user.data()?.gameName).toBe('bob_the_grea');
  });
  test('suffixes on collision', async () => {
    const b = await bridge.resolve('uid-b', false, 'bob the great');
    expect(b.gameName).toBe('bob_the_gre2');
  });
  test('guests get a guest_ name when none is desired', async () => {
    const g = await bridge.resolve('uid-c', true, null);
    expect(g.gameName).toMatch(/^guest_[a-z0-9]{6}$/);
  });
  test('invalid desired names fall back to guest naming', async () => {
    const g = await bridge.resolve('uid-d', false, '!!!');
    expect(g.gameName).toMatch(/^guest_[a-z0-9]{6}$/);
  });
});

describe('bridge.handle', () => {
  test('401 without a bearer token', async () => {
    const res = await bridge.handle(new Request('http://x/api/bridge', { method: 'POST' }));
    expect(res.status).toBe(401);
  });
  test('200 with a valid token', async () => {
    const token = await idTokenFor('uid-e');
    const res = await bridge.handle(new Request('http://x/api/bridge', {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ desiredName: 'Eve' })
    }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { gameName: string; secret: string };
    expect(body.gameName).toBe('eve');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (emulators running in another terminal via `cd firebase && npm run emulators`): `cd server && bun test src/bridge.test.ts`
Expected: FAIL, cannot find module `./bridge`.

- [ ] **Step 3: Implement `bridge.ts`**

```ts
import type { Admin } from './firebaseAdmin';
import { normaliseGameName, randomGuestName, randomSecret, withSuffix } from './gameName';
import type { BridgeResponse, GameAccountDoc } from './types';

export interface Bridge {
  handle(req: Request): Promise<Response>;
  resolve(uid: string, isAnonymous: boolean, desiredName: string | null): Promise<BridgeResponse>;
}

const MAX_ATTEMPTS = 20;

export function createBridge(admin: Admin): Bridge {
  const { auth, db } = admin;

  async function resolve(uid: string, isAnonymous: boolean, desiredName: string | null): Promise<BridgeResponse> {
    const accountRef = db.doc(`gameAccounts/${uid}`);
    const existing = await accountRef.get();
    if (existing.exists) {
      const d = existing.data() as GameAccountDoc;
      return { gameName: d.gameName, secret: d.secret };
    }
    const base = (desiredName && !isAnonymous ? normaliseGameName(desiredName) : null) ?? randomGuestName();
    const secret = randomSecret();
    return db.runTransaction(async tx => {
      let candidate = base;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const idx = await tx.get(db.doc(`gameNames/${candidate}`));
        if (!idx.exists) {
          const doc: GameAccountDoc = { gameName: candidate, secret, createdAt: Date.now() };
          tx.set(accountRef, doc);
          tx.set(db.doc(`gameNames/${candidate}`), { uid });
          tx.set(db.doc(`users/${uid}`), { gameName: candidate }, { merge: true });
          return { gameName: candidate, secret };
        }
        candidate = withSuffix(base, attempt + 1);
      }
      throw new Error('could not allocate a game name');
    });
  }

  async function handle(req: Request): Promise<Response> {
    const header = req.headers.get('authorization') ?? '';
    if (!header.startsWith('Bearer ')) return Response.json({ error: 'missing token' }, { status: 401 });
    let uid: string;
    let isAnonymous: boolean;
    try {
      const decoded = await auth.verifyIdToken(header.slice(7));
      uid = decoded.uid;
      isAnonymous = decoded.firebase.sign_in_provider === 'anonymous';
    } catch {
      return Response.json({ error: 'invalid token' }, { status: 401 });
    }
    let desiredName: string | null = null;
    try {
      const body = (await req.json()) as { desiredName?: unknown };
      if (typeof body.desiredName === 'string') desiredName = body.desiredName;
    } catch { /* no body */ }
    try {
      return Response.json(await resolve(uid, isAnonymous, desiredName));
    } catch (err) {
      console.error('[bridge]', err);
      return Response.json({ error: 'bridge failed' }, { status: 500 });
    }
  }

  return { handle, resolve };
}
```

- [ ] **Step 4: Run tests**

Run: `cd server && bun test src/bridge.test.ts`
Expected: 6 pass.

- [ ] **Step 5: Wire into `index.ts`**

```ts
import { initAdmin } from './firebaseAdmin';
import { createBridge } from './bridge';
// after env:
const bridge = createBridge(initAdmin(env));
// in the gated switch:
      case 'bridge': return req.method === 'POST' ? bridge.handle(req) : new Response(null, { status: 405 });
```

Run the whole suite: `cd server && bun test` with emulators up. Expected: all pass. Run `bun run typecheck`. Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server
git commit -m "feat(server): firebase-backed game account bridge"
```

---

### Task 9: Client hooks module (types, emitter, diff, install)

**Files:**
- Create: `client/src/hooks/types.ts`, `client/src/hooks/emitter.ts`, `client/src/hooks/diff.ts`, `client/src/hooks/install.ts`
- Test: `client/src/hooks/emitter.test.ts`, `client/src/hooks/diff.test.ts`

**Interfaces:**
- Produces (public, on `window.idlescape.client`): `ClientHooks` exactly as in the spec section 7.
- Produces (internal): `HookBridge` the client class fills with closures, and `installHooks(bridge: HookBridge): ClientHooks`.
- Produces: `diffXp(prev: number[], next: number[], levels: number[]): XpEvent[]`, `diffInventory(prevIds: number[], prevCounts: number[], nextIds: number[], nextCounts: number[]): InventoryEvent`.

- [ ] **Step 1: `types.ts`**

```ts
export type LoginResult = { ok: true } | { ok: false; code: number; reason: string };
export type ChatColour = 'orange' | 'white' | 'green' | 'red';

export interface ClientState {
  loggedIn: boolean;
  gameName: string | null;
  skills: { xp: number[]; level: number[] };
  inventory: { id: number; count: number }[];
  fps: number;
  rttMs: number | null;
}

export interface XpEvent { skill: number; xp: number; level: number; delta: number }
export interface InventoryEvent {
  added: { id: number; count: number }[];
  removed: { id: number; count: number }[];
}

export interface HookEvents {
  login: { gameName: string };
  logout: Record<string, never>;
  disconnect: { code: number };
  xp: XpEvent;
  inventory: InventoryEvent;
  chat: { kind: 'game' | 'public' | 'private'; sender: string | null; text: string };
  tick: { cycle: number };
}

export interface ClientHooks {
  login(gameName: string, secret: string): Promise<LoginResult>;
  logout(): void;
  echoChat(text: string, colour?: ChatColour): void;
  getState(): ClientState;
  getObjName(id: number): string | null;
  on<E extends keyof HookEvents>(event: E, handler: (payload: HookEvents[E]) => void): () => void;
}

/** Closures the Client class provides; keeps its private fields private. */
export interface HookBridge {
  login(gameName: string, secret: string): Promise<LoginResult>;
  logout(): void;
  addChat(type: number, text: string, sender: string): void;
  getState(): ClientState;
  getObjName(id: number): string | null;
}

export const CHAT_COLOUR_TAG: Record<ChatColour, string> = {
  orange: '@or1@',
  white: '@whi@',
  green: '@gre@',
  red: '@red@'
};

/** Interface component id of the player inventory (content pack: 3214 = inventory:inv). */
export const INVENTORY_COM_ID = 3214;
```

- [ ] **Step 2: Write the failing emitter and diff tests**

`client/src/hooks/emitter.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { createEmitter } from './emitter';
import type { HookEvents } from './types';

describe('emitter', () => {
  test('delivers to subscribers and supports unsubscribe', () => {
    const em = createEmitter<HookEvents>();
    const seen: number[] = [];
    const off = em.on('xp', p => seen.push(p.delta));
    em.emit('xp', { skill: 1, xp: 10, level: 1, delta: 10 });
    off();
    em.emit('xp', { skill: 1, xp: 20, level: 1, delta: 10 });
    expect(seen).toEqual([10]);
  });
  test('a throwing handler does not stop the others', () => {
    const em = createEmitter<HookEvents>();
    let hit = false;
    em.on('tick', () => { throw new Error('boom'); });
    em.on('tick', () => { hit = true; });
    em.emit('tick', { cycle: 1 });
    expect(hit).toBe(true);
  });
});
```

`client/src/hooks/diff.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { diffInventory, diffXp } from './diff';

describe('diffXp', () => {
  test('emits one event per changed skill with delta', () => {
    const prev = [0, 100, 50];
    const next = [0, 130, 50];
    const levels = [1, 2, 1];
    expect(diffXp(prev, next, levels)).toEqual([{ skill: 1, xp: 130, level: 2, delta: 30 }]);
  });
  test('first sync (prev empty) emits nothing', () => {
    expect(diffXp([], [10, 20], [1, 1])).toEqual([]);
  });
});

describe('diffInventory', () => {
  test('reports added and removed by id with count deltas', () => {
    const ev = diffInventory([335, 314, 0], [1, 5, 0], [335, 314, 1511], [3, 2, 1]);
    expect(ev.added).toEqual([{ id: 335, count: 2 }, { id: 1511, count: 1 }]);
    expect(ev.removed).toEqual([{ id: 314, count: 3 }]);
  });
  test('slot moves are not changes', () => {
    const ev = diffInventory([335, 314], [1, 1], [314, 335], [1, 1]);
    expect(ev.added).toEqual([]);
    expect(ev.removed).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd client && bun test src/hooks`
Expected: FAIL, cannot find modules `./emitter` and `./diff`.

- [ ] **Step 4: Implement `emitter.ts` and `diff.ts`**

`client/src/hooks/emitter.ts`:

```ts
export interface Emitter<Events extends Record<string, unknown>> {
  on<E extends keyof Events>(event: E, handler: (payload: Events[E]) => void): () => void;
  emit<E extends keyof Events>(event: E, payload: Events[E]): void;
}

export function createEmitter<Events extends Record<string, unknown>>(): Emitter<Events> {
  const handlers = new Map<keyof Events, Set<(payload: never) => void>>();
  return {
    on(event, handler) {
      let set = handlers.get(event);
      if (!set) { set = new Set(); handlers.set(event, set); }
      set.add(handler as (payload: never) => void);
      return () => { set?.delete(handler as (payload: never) => void); };
    },
    emit(event, payload) {
      const set = handlers.get(event);
      if (!set) return;
      for (const h of Array.from(set)) {
        try { (h as (p: Events[typeof event]) => void)(payload); } catch (err) { console.error('[hooks]', String(event), err); }
      }
    }
  };
}
```

`client/src/hooks/diff.ts`:

```ts
import type { InventoryEvent, XpEvent } from './types';

export function diffXp(prev: number[], next: number[], levels: number[]): XpEvent[] {
  if (prev.length === 0) return [];
  const out: XpEvent[] = [];
  for (let i = 0; i < next.length; i++) {
    const before = prev[i] ?? 0;
    if (next[i] !== before) out.push({ skill: i, xp: next[i], level: levels[i] ?? 1, delta: next[i] - before });
  }
  return out;
}

function tally(ids: number[], counts: number[]): Map<number, number> {
  const m = new Map<number, number>();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (id > 0 && counts[i] > 0) m.set(id, (m.get(id) ?? 0) + counts[i]);
  }
  return m;
}

export function diffInventory(prevIds: number[], prevCounts: number[], nextIds: number[], nextCounts: number[]): InventoryEvent {
  const before = tally(prevIds, prevCounts);
  const after = tally(nextIds, nextCounts);
  const added: InventoryEvent['added'] = [];
  const removed: InventoryEvent['removed'] = [];
  for (const [id, count] of after) {
    const b = before.get(id) ?? 0;
    if (count > b) added.push({ id, count: count - b });
  }
  for (const [id, count] of before) {
    const a = after.get(id) ?? 0;
    if (a < count) removed.push({ id, count: count - a });
  }
  return { added, removed };
}
```

- [ ] **Step 5: Run tests**

Run: `cd client && bun test src/hooks`
Expected: 6 pass.

- [ ] **Step 6: Implement `install.ts`**

```ts
import { createEmitter, type Emitter } from './emitter';
import { CHAT_COLOUR_TAG, type ChatColour, type ClientHooks, type HookBridge, type HookEvents } from './types';

declare global {
  interface Window { idlescape?: { client?: ClientHooks } }
}

export interface Installed { hooks: ClientHooks; emitter: Emitter<HookEvents> }

export function installHooks(bridge: HookBridge): Installed {
  const emitter = createEmitter<HookEvents>();
  const hooks: ClientHooks = {
    login: (gameName, secret) => bridge.login(gameName, secret),
    logout: () => bridge.logout(),
    echoChat(text, colour: ChatColour = 'orange') {
      bridge.addChat(0, `${CHAT_COLOUR_TAG[colour]}${text}`, '');
    },
    getState: () => bridge.getState(),
    getObjName: id => bridge.getObjName(id),
    on: (event, handler) => emitter.on(event, handler)
  };
  window.idlescape = { ...(window.idlescape ?? {}), client: hooks };
  window.dispatchEvent(new CustomEvent('idlescape:client-ready'));
  return { hooks, emitter };
}
```

- [ ] **Step 7: Commit**

```bash
git add client/src/hooks
git commit -m "feat(client): hooks module with typed emitter and xp/inventory diffs"
```

---

### Task 10: Client call sites for login, events, and headless title

**Files:**
- Modify: `client/src/client/Client.ts` (call sites listed per step; line numbers are from the pinned commit and may drift by a few lines)
- Modify: `client/bundle.ts` (no change needed unless `hooks/` is excluded; verify it bundles)
- Test: manual in browser via Task 14; unit coverage is in Task 9

**Interfaces:**
- Consumes: `installHooks`, `HookBridge`, `diffXp`, `diffInventory`, `INVENTORY_COM_ID`, `LoginResult` (Task 9).
- Produces: at runtime, `window.idlescape.client` populated after `new Client(...)`, and `idlescape:client-ready` dispatched.

- [ ] **Step 1: Add fields and install in the constructor**

Near the other private fields (around line 130 where `private ingame` is declared) add:

```ts
    private hooksEmitter: import('../hooks/emitter').Emitter<import('../hooks/types').HookEvents> | null = null;
    private loginResolver: ((r: import('../hooks/types').LoginResult) => void) | null = null;
    private headlessTitle: boolean = false;
    private prevStatXP: number[] = [];
    private prevInvIds: number[] = [];
    private prevInvCounts: number[] = [];
    private hookCycle: number = 0;
```

At the top imports add:

```ts
import { installHooks } from '../hooks/install';
import { diffInventory, diffXp } from '../hooks/diff';
import { INVENTORY_COM_ID, type ClientState, type LoginResult } from '../hooks/types';
import ObjType from '../config/ObjType';
```

(`ObjType` is probably already imported; do not duplicate.)

At the end of the constructor (line ~545 `constructor(nodeid: number, lowmem: boolean, members: boolean)`), append:

```ts
        const installed = installHooks({
            login: (gameName, secret) => new Promise<LoginResult>(resolve => {
                this.loginResolver = resolve;
                this.loginUser = gameName;
                this.loginPass = secret;
                this.headlessTitle = true;
                void this.login(gameName, secret, false);
            }),
            logout: () => { void this.logout(); },
            addChat: (type, text, sender) => this.addChat(type, text, sender),
            getState: () => this.hookState(),
            getObjName: id => ObjType.list(id)?.name ?? null
        });
        this.hooksEmitter = installed.emitter;
```

and add the helper method next to `addChat`:

```ts
    private hookState(): ClientState {
        const inv = IfType.list[INVENTORY_COM_ID];
        const inventory: { id: number; count: number }[] = [];
        if (inv?.linkObjType && inv.linkObjNumber) {
            for (let i = 0; i < inv.linkObjType.length; i++) {
                if (inv.linkObjType[i] > 0) inventory.push({ id: inv.linkObjType[i] - 1, count: inv.linkObjNumber[i] });
            }
        }
        return {
            loggedIn: this.ingame,
            gameName: this.ingame ? this.loginUser : null,
            skills: { xp: this.statXP.slice(), level: this.statBaseLevel.slice() },
            inventory,
            fps: this.fps,
            rttMs: null
        };
    }
```

Note the `- 1`: the client stores inventory object ids offset by one (0 means empty). Verify against `UPDATE_INV_FULL` usage in the sidebar draw code (`inv.linkObjType[i] - 1` appears where sprites are drawn); if the draw code does not subtract, remove the `- 1` here and in the diff call below.

- [ ] **Step 2: Resolve login results**

In `login()` (line ~1702) inside the `try`, after `const response: number = await this.stream.read();`:

- In the `response === 2 || response === 18` branch, after `this.ingame = true;` add:

```ts
                this.prevStatXP = [];
                this.prevInvIds = [];
                this.prevInvCounts = [];
                this.loginResolver?.({ ok: true });
                this.loginResolver = null;
                this.hooksEmitter?.emit('login', { gameName: username });
```

- After the long `else if (response === N)` chain ends (the final `else` that sets a generic message), add once, after the chain:

```ts
            if (response !== 1 && response !== 2 && response !== 18 && this.loginResolver) {
                this.loginResolver({ ok: false, code: response, reason: `${this.loginMes1} ${this.loginMes2}`.trim() });
                this.loginResolver = null;
            }
```

- In the `catch` block of `login()`, add before its existing handling:

```ts
            if (this.loginResolver) {
                this.loginResolver({ ok: false, code: -1, reason: 'Unable to connect to the world.' });
                this.loginResolver = null;
            }
```

- [ ] **Step 3: Headless title screen**

In `titleScreenLoop()` (line ~1080) add as the first statement:

```ts
        if (this.headlessTitle) return;
```

In `titleScreenDraw()` (line ~1187), in the `if (this.loginscreen === 0)` branch, wrap the two buttons: when `this.headlessTitle` is true draw only `this.b12?.centreStringTag(w / 2, (h / 2 | 0) + 20, 'Waiting for idlescape...', Colour.WHITE, true);` and skip the button sprites. In the `loginscreen === 2` branch, when `this.headlessTitle` is true, draw only `loginMes1` and `loginMes2` and skip the username, password, Login, and Cancel drawing.

- [ ] **Step 4: XP and inventory events**

In the `UPDATE_STAT` handler (line ~6376), after `this.statBaseLevel[stat] = ...` loop completes and before `this.ptype = -1;`:

```ts
                for (const ev of diffXp(this.prevStatXP, this.statXP, this.statBaseLevel)) this.hooksEmitter?.emit('xp', ev);
                this.prevStatXP = this.statXP.slice();
```

In the `UPDATE_INV_FULL` handler (line ~5972) and the `UPDATE_INV_PARTIAL` handler (line ~6003), before `this.ptype = -1;`:

```ts
                this.emitInventoryDiff(comId);
```

Add the method next to `hookState()`:

```ts
    private emitInventoryDiff(comId: number): void {
        if (comId !== INVENTORY_COM_ID || !this.hooksEmitter) return;
        const inv = IfType.list[comId];
        if (!inv?.linkObjType || !inv.linkObjNumber) return;
        const ids = Array.from(inv.linkObjType, id => (id > 0 ? id - 1 : 0));
        const counts = Array.from(inv.linkObjNumber);
        if (this.prevInvIds.length > 0) {
            const ev = diffInventory(this.prevInvIds, this.prevInvCounts, ids, counts);
            if (ev.added.length || ev.removed.length) this.hooksEmitter.emit('inventory', ev);
        }
        this.prevInvIds = ids;
        this.prevInvCounts = counts;
    }
```

- [ ] **Step 5: Chat, logout, disconnect, tick events**

In `addChat(type, text, sender)` (line ~10897) at the end:

```ts
        this.hooksEmitter?.emit('chat', { kind: type === 0 ? 'game' : type === 2 ? 'public' : 'private', sender: sender || null, text });
```

(Confirm the type numbers against the `chatType` usage in `drawChat()`; in the 225 client 0 is game message, 2 is public chat, 3 and 6 are private. Adjust the mapping if the draw code says otherwise.)

In `logout()` (line ~2283, the method that sets `this.ingame = false; this.loginscreen = 0;`) at the end: `this.hooksEmitter?.emit('logout', {});`

In the reconnect path (line ~2329, where `this.ingame = false; await this.login(this.loginUser, this.loginPass, true);`) before the `login` call: `this.hooksEmitter?.emit('disconnect', { code: 0 });`

In `mainloop()` (the method GameShell calls each cycle; find `override async mainloop()`), as the first statement:

```ts
        this.hookCycle++;
        if (this.ingame) this.hooksEmitter?.emit('tick', { cycle: this.hookCycle });
```

- [ ] **Step 6: Build and smoke**

```bash
cd client && bun run build && ls -la out/
```

Expected: `out/client.js` rebuilt; no type errors printed by the bundler. Then run `cd client && bunx tsc --noEmit -p tsconfig.json`. Expected: no errors (fix any `possibly undefined` on `IfType.list[...]` by the optional chaining shown).

Temporary browser smoke without the shell: copy `out/client.js`, `out/bzip2.wasm`, `out/tinymidipcm.wasm` into `engine/server/public/client/` (the engine still serves its own page at `/rs2.cgi`), open `http://localhost:8888/rs2.cgi`, and in the console run `window.idlescape.client.login('hooktest','hooktest').then(console.log)`. Expected: the title shows "Waiting for idlescape..." then "Connecting to server...", the promise resolves `{ok:true}`, the player is in game, and `window.idlescape.client.getState().skills.xp.length` is 21. Run `window.idlescape.client.echoChat('hello from hooks')`: an orange line appears in the chatbox. Restore the engine's three prebuilt files afterwards (`git -C engine/server checkout public/client`).

- [ ] **Step 7: Commit**

```bash
git add client
git commit -m "feat(client): programmatic login, headless title, xp/inventory/chat/tick hook events"
```

---

### Task 11: Web scaffold, state machine, Firebase auth, API client

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/vitest.config.ts`, `web/eslint.config.js`, `web/.env.example`, `web/index.html`, `web/src/main.ts`, `web/src/types.ts`, `web/src/state.ts`, `web/src/dom.ts`, `web/src/firebase.ts`, `web/src/auth.ts`, `web/src/api.ts`, `web/src/partials/gate.html`, `web/src/partials/signin.html`, `web/src/styles/tokens.css`, `web/src/styles/auth.css`, `web/src/test/setupDom.ts`
- Test: `web/src/state.test.ts`, `web/src/api.test.ts`

**Interfaces:**
- Produces: `AppState = 'gate' | 'signin' | 'playing' | 'offline'`, `createAppState(): { get(): AppState; set(s: AppState): void; onChange(fn: (s: AppState) => void): () => void }`.
- Produces: `api.postGate(password): Promise<'ok' | 'wrong' | 'cooldown'>`, `api.bridge(idToken, desiredName?): Promise<BridgeResponse>`, `api.health(): Promise<HealthSnapshot>`.
- Produces: `auth.signInGuest()`, `auth.signUpEmail(email, password, displayName)`, `auth.signInEmail(email, password)`, `auth.resetPassword(email)`, `auth.attachEmail(email, password)`, `auth.signOutUser()`, `auth.onUser(fn)`, `auth.currentIdToken()`.

- [ ] **Step 1: Package and config files**

`web/package.json`:

```json
{
  "name": "@idlescape/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "firebase": "^12.0.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "@playwright/test": "^1.50.0",
    "eslint": "^9.0.0",
    "globals": "^16.0.0",
    "jsdom": "^26.0.0",
    "typescript": "^5.9.0",
    "typescript-eslint": "^8.0.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

`web/tsconfig.json` copies tron's (`target ES2022`, `strict`, `noEmit`, `moduleResolution bundler`, `types: ["vite/client"]`, `include: ["src/**/*.ts"]`, `exclude: ["src/**/*.test.ts", "e2e/**"]`).

`web/vite.config.ts` copies tron's `htmlIncludePlugin` verbatim and sets:

```ts
export default defineConfig({
  plugins: [htmlIncludePlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/client': 'http://localhost:8787',
      '^/(crc|title|config|interface|media|models|textures|wordenc|sounds)': 'http://localhost:8787',
      '^/.*\\.mid$': 'http://localhost:8787',
      '/': { target: 'ws://localhost:8787', ws: true, bypass: req => (req.headers.upgrade === 'websocket' ? undefined : req.url) }
    }
  },
  build: { outDir: 'dist', emptyOutDir: true }
});
```

The dev proxy means the page at `localhost:5173` talks to the real front server for everything except its own HTML and modules, including the WebSocket at `/`.

`web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { globals: true, environment: 'jsdom', include: ['src/**/*.test.ts'], setupFiles: ['src/test/setupDom.ts'] }
});
```

`web/src/test/setupDom.ts`: `document.body.innerHTML = '';` (placeholder for DOM fixtures).

`web/eslint.config.js` copies tron's flat config verbatim.

`web/.env.example`:

```
VITE_FIREBASE_API_KEY=<from firebase apps:sdkconfig>
VITE_FIREBASE_AUTH_DOMAIN=idlescape-osrs.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=idlescape-osrs
VITE_FIREBASE_APP_ID=<from firebase apps:sdkconfig>
VITE_FIREBASE_MESSAGING_SENDER_ID=<from firebase apps:sdkconfig>
VITE_USE_FIREBASE_EMULATORS=false
```

Fill `web/.env.local` with the real values from Task 6 Step 1 and `VITE_USE_FIREBASE_EMULATORS=true` for development. The Firebase web API key is not a secret (it is shipped to browsers), so `.env.example` may carry the real key once known.

Run `cd web && npm install && npx playwright install chromium`.

- [ ] **Step 2: Write the failing state test**

`web/src/state.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { createAppState } from './state';

describe('app state', () => {
  test('starts at gate and notifies on change', () => {
    const s = createAppState();
    const seen: string[] = [];
    s.onChange(v => seen.push(v));
    s.set('signin');
    s.set('playing');
    expect(s.get()).toBe('playing');
    expect(seen).toEqual(['signin', 'playing']);
  });
  test('setting the same state does not notify', () => {
    const s = createAppState();
    let n = 0;
    s.onChange(() => n++);
    s.set('gate');
    expect(n).toBe(0);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd web && npx vitest run src/state.test.ts`
Expected: FAIL, cannot resolve `./state`.

- [ ] **Step 4: Implement `types.ts`, `state.ts`, `dom.ts`**

`web/src/types.ts`:

```ts
export type AppState = 'gate' | 'signin' | 'playing' | 'offline';
export interface BridgeResponse { gameName: string; secret: string }
export interface HealthSnapshot { engine: 'up' | 'down'; engineUptimeMs: number; version: string }
export type PanelId = 'claude' | 'xp' | 'loot' | 'connect' | 'account' | 'config';
export interface Identity { uid: string; isAnonymous: boolean; email: string | null; displayName: string | null }
```

`web/src/state.ts`:

```ts
import type { AppState } from './types';

export function createAppState() {
  let current: AppState = 'gate';
  const listeners = new Set<(s: AppState) => void>();
  return {
    get: () => current,
    set(s: AppState) {
      if (s === current) return;
      current = s;
      for (const fn of listeners) fn(s);
    },
    onChange(fn: (s: AppState) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}
```

`web/src/dom.ts`: copy `escapeHtml`, `show`, `hide`, `toggleVisible` from tron's `src/ui/dom.ts` (the first 35 lines), plus:

```ts
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}
```

- [ ] **Step 5: Run state tests**

Run: `cd web && npx vitest run src/state.test.ts`
Expected: 2 pass.

- [ ] **Step 6: Write the failing api test**

`web/src/api.test.ts`:

```ts
import { afterEach, describe, expect, test, vi } from 'vitest';
import { bridge, health, postGate } from './api';

function mockFetch(status: number, body: unknown = null) {
  const f = vi.fn(async () => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', f);
  return f;
}
afterEach(() => vi.unstubAllGlobals());

describe('api', () => {
  test('postGate maps statuses', async () => {
    mockFetch(204); expect(await postGate('x')).toBe('ok');
    mockFetch(401); expect(await postGate('x')).toBe('wrong');
    mockFetch(429); expect(await postGate('x')).toBe('cooldown');
  });
  test('bridge sends bearer token and desired name', async () => {
    const f = mockFetch(200, { gameName: 'bob', secret: 's' });
    const res = await bridge('tok', 'Bob');
    expect(res).toEqual({ gameName: 'bob', secret: 's' });
    const init = f.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(init.body).toBe(JSON.stringify({ desiredName: 'Bob' }));
  });
  test('bridge throws with the server error message', async () => {
    mockFetch(500, { error: 'bridge failed' });
    await expect(bridge('tok')).rejects.toThrow('bridge failed');
  });
  test('health parses', async () => {
    mockFetch(200, { engine: 'up', engineUptimeMs: 5, version: '0.1.0' });
    expect((await health()).engine).toBe('up');
  });
});
```

- [ ] **Step 7: Run to verify failure**

Run: `cd web && npx vitest run src/api.test.ts`
Expected: FAIL, cannot resolve `./api`.

- [ ] **Step 8: Implement `api.ts`**

```ts
import type { BridgeResponse, HealthSnapshot } from './types';

const JSON_HEADERS = { 'content-type': 'application/json' };

export async function postGate(password: string): Promise<'ok' | 'wrong' | 'cooldown'> {
  const res = await fetch('/api/gate', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ password }), credentials: 'same-origin' });
  if (res.status === 204) return 'ok';
  if (res.status === 429) return 'cooldown';
  return 'wrong';
}

export async function bridge(idToken: string, desiredName?: string): Promise<BridgeResponse> {
  const res = await fetch('/api/bridge', {
    method: 'POST',
    headers: { ...JSON_HEADERS, authorization: `Bearer ${idToken}` },
    body: JSON.stringify(desiredName ? { desiredName } : {}),
    credentials: 'same-origin'
  });
  if (!res.ok) {
    let message = `bridge ${res.status}`;
    try { message = ((await res.json()) as { error?: string }).error ?? message; } catch { /* keep default */ }
    throw new Error(message);
  }
  return (await res.json()) as BridgeResponse;
}

export async function health(): Promise<HealthSnapshot> {
  const res = await fetch('/api/health', { credentials: 'same-origin' });
  return (await res.json()) as HealthSnapshot;
}
```

- [ ] **Step 9: Run api tests**

Run: `cd web && npx vitest run src/api.test.ts`
Expected: 4 pass.

- [ ] **Step 10: `firebase.ts` and `auth.ts`**

`web/src/firebase.ts`:

```ts
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
});

export const auth = getAuth(app);
export const db = getFirestore(app);

if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
}
```

`web/src/auth.ts`:

```ts
import {
  EmailAuthProvider, createUserWithEmailAndPassword, linkWithCredential, onAuthStateChanged,
  sendPasswordResetEmail, signInAnonymously, signInWithEmailAndPassword, signOut, updateProfile, type User
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { Identity } from './types';

const FIREBASE_ERRORS: Record<string, string> = {
  'auth/email-already-in-use': 'That email is already registered. Try signing in.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/user-not-found': 'No account with that email.',
  'auth/wrong-password': 'Wrong password.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/too-many-requests': 'Too many attempts. Try again later.',
  'auth/credential-already-in-use': 'That email belongs to another account.'
};

export function friendlyAuthError(err: unknown): string {
  const code = (err as { code?: string }).code ?? '';
  return FIREBASE_ERRORS[code] ?? 'Something went wrong. Try again.';
}

function toIdentity(u: User): Identity {
  return { uid: u.uid, isAnonymous: u.isAnonymous, email: u.email, displayName: u.displayName };
}

async function ensureProfile(u: User, displayName: string): Promise<void> {
  await setDoc(doc(db, 'users', u.uid), { displayName, createdAt: serverTimestamp(), provider: u.isAnonymous ? 'anonymous' : 'password' }, { merge: true });
}

export async function signInGuest(): Promise<Identity> {
  const { user } = await signInAnonymously(auth);
  await ensureProfile(user, 'Guest');
  return toIdentity(user);
}

export async function signUpEmail(email: string, password: string, displayName: string): Promise<Identity> {
  const name = displayName.trim();
  if (name.length < 1 || name.length > 20) throw new Error('Display name must be 1 to 20 characters.');
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(user, { displayName: name });
  await ensureProfile(user, name);
  return toIdentity(user);
}

export async function signInEmail(email: string, password: string): Promise<Identity> {
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  return toIdentity(user);
}

export function resetPassword(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}

export async function attachEmail(email: string, password: string): Promise<Identity> {
  const u = auth.currentUser;
  if (!u || !u.isAnonymous) throw new Error('Only guest accounts can attach an email.');
  const { user } = await linkWithCredential(u, EmailAuthProvider.credential(email, password));
  await setDoc(doc(db, 'users', user.uid), { provider: 'password' }, { merge: true });
  return toIdentity(user);
}

export function signOutUser(): Promise<void> {
  return signOut(auth);
}

export function onUser(fn: (identity: Identity | null) => void): () => void {
  return onAuthStateChanged(auth, u => fn(u ? toIdentity(u) : null));
}

export async function currentIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error('not signed in');
  return u.getIdToken();
}
```

- [ ] **Step 11: Gate and sign-in partials, tokens, and `main.ts` for those two states**

`web/src/styles/tokens.css`:

```css
:root {
  /* RuneLite palette as RGB triplets (use rgb(var(--x)) / rgba(var(--x), a)) */
  --rl-window: 27, 27, 27;
  --rl-darker: 30, 30, 30;
  --rl-panel: 40, 40, 40;
  --rl-border: 17, 17, 17;
  --rl-hover: 50, 50, 50;
  --rl-muted: 128, 128, 128;
  --rl-text: 160, 160, 160;
  --rl-strong: 224, 224, 224;
  --rl-orange: 255, 152, 31;
  --rl-ok: 67, 160, 71;
  --rl-error: 229, 57, 53;
  --font-ui: system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-pixel: "Pixelify Sans", "Press Start 2P", monospace;
  --panel-w: 210px;
  --strip-w: 32px;
  --title-h: 22px;
  --foot-h: 16px;
  --radius: 2px;
}
html, body { margin: 0; background: rgb(var(--rl-window)); color: rgb(var(--rl-text)); font: 13px/1.4 var(--font-ui); }
.hidden { display: none !important; }
```

`web/src/partials/gate.html`:

```html
<section id="screen-gate" class="card-screen hidden">
  <form id="gate-form" class="card" autocomplete="off">
    <h1 class="card-title">idlescape</h1>
    <p class="card-sub">Private preview. Enter the gate password.</p>
    <input id="gate-password" class="input" type="password" placeholder="password" aria-label="Gate password" required>
    <p id="gate-error" class="error hidden" aria-live="polite"></p>
    <button class="btn btn-primary" type="submit">Enter</button>
  </form>
</section>
```

`web/src/partials/signin.html`:

```html
<section id="screen-signin" class="card-screen hidden">
  <div class="card">
    <h1 class="card-title">idlescape</h1>
    <button id="btn-guest" class="btn btn-primary" type="button">Play as guest</button>
    <div class="divider">or</div>
    <form id="signin-form" class="stack">
      <input id="signin-email" class="input" type="email" placeholder="email" autocomplete="email" required>
      <input id="signin-password" class="input" type="password" placeholder="password" autocomplete="current-password" required>
      <p id="signin-error" class="error hidden" aria-live="polite"></p>
      <button class="btn" type="submit">Sign in</button>
      <button id="btn-forgot" class="link" type="button">Forgot password?</button>
      <button id="btn-show-signup" class="link" type="button">Create an account</button>
    </form>
    <form id="signup-form" class="stack hidden">
      <input id="signup-name" class="input" type="text" placeholder="display name (1-20)" maxlength="20" required>
      <input id="signup-email" class="input" type="email" placeholder="email" autocomplete="email" required>
      <input id="signup-password" class="input" type="password" placeholder="password (6+)" autocomplete="new-password" required>
      <p id="signup-error" class="error hidden" aria-live="polite"></p>
      <button class="btn" type="submit">Create account</button>
      <button id="btn-show-signin" class="link" type="button">Back to sign in</button>
    </form>
    <p id="signin-notice" class="notice hidden" aria-live="polite"></p>
  </div>
</section>
```

`web/src/styles/auth.css`: `.card-screen` centres a `.card` (max-width 360px, `rgb(var(--rl-panel))` background, 1px `rgb(var(--rl-border))` border, 20px padding); `.input` dark field with orange focus ring; `.btn` grey, `.btn-primary` orange with dark text; `.link` borderless orange text; `.error` in `rgb(var(--rl-error))`; `.notice` in `rgb(var(--rl-ok))`; `.divider` muted centred text with lines.

`web/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>idlescape</title>
  <link rel="stylesheet" href="/src/styles/tokens.css">
  <link rel="stylesheet" href="/src/styles/auth.css">
  <link rel="stylesheet" href="/src/styles/frame.css">
  <link rel="stylesheet" href="/src/styles/panels.css">
  <link rel="stylesheet" href="/src/styles/overlays.css">
</head>
<body>
<!-- @include "src/partials/gate.html" -->
<!-- @include "src/partials/signin.html" -->
<!-- @include "src/partials/frame.html" -->
<script type="module" src="/src/main.ts"></script>
</body>
</html>
```

(`frame.html`, `frame.css`, `panels.css`, `overlays.css` are created in Task 12; create them as empty files now so Vite resolves them.)

`web/src/main.ts` (first version, gate and sign-in only):

```ts
import { byId, hide, show } from './dom';
import { createAppState } from './state';
import { health, postGate } from './api';
import { attachEmail, friendlyAuthError, onUser, resetPassword, signInEmail, signInGuest, signUpEmail } from './auth';
import type { AppState } from './types';

const state = createAppState();
const screens: Record<AppState, string> = { gate: 'screen-gate', signin: 'screen-signin', playing: 'screen-frame', offline: 'screen-frame' };

state.onChange(s => {
  for (const id of Object.values(screens)) hide(id);
  show(screens[s]);
});

function setError(id: string, message: string | null): void {
  const el = byId(id);
  el.textContent = message ?? '';
  el.classList.toggle('hidden', message === null);
}

async function isGateOpen(): Promise<boolean> {
  // The health endpoint is always public; a gated 401 on /client/deps.js tells us the cookie is missing.
  const res = await fetch('/client/deps.js', { method: 'HEAD', credentials: 'same-origin' });
  return res.status !== 401;
}

function wireGate(): void {
  byId<HTMLFormElement>('gate-form').addEventListener('submit', async e => {
    e.preventDefault();
    const result = await postGate(byId<HTMLInputElement>('gate-password').value);
    if (result === 'ok') { setError('gate-error', null); state.set('signin'); return; }
    setError('gate-error', result === 'cooldown' ? 'Slow down and try again.' : 'Wrong password.');
  });
}

function wireSignin(): void {
  byId('btn-guest').addEventListener('click', async () => {
    try { await signInGuest(); } catch (err) { setError('signin-error', friendlyAuthError(err)); }
  });
  byId<HTMLFormElement>('signin-form').addEventListener('submit', async e => {
    e.preventDefault();
    try { await signInEmail(byId<HTMLInputElement>('signin-email').value, byId<HTMLInputElement>('signin-password').value); }
    catch (err) { setError('signin-error', friendlyAuthError(err)); }
  });
  byId<HTMLFormElement>('signup-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await signUpEmail(byId<HTMLInputElement>('signup-email').value, byId<HTMLInputElement>('signup-password').value, byId<HTMLInputElement>('signup-name').value);
    } catch (err) { setError('signup-error', (err as Error).message.startsWith('Display') ? (err as Error).message : friendlyAuthError(err)); }
  });
  byId('btn-forgot').addEventListener('click', async () => {
    const email = byId<HTMLInputElement>('signin-email').value;
    if (!email) { setError('signin-error', 'Enter your email first.'); return; }
    try { await resetPassword(email); const n = byId('signin-notice'); n.textContent = 'Check your email for a reset link.'; show(n); }
    catch (err) { setError('signin-error', friendlyAuthError(err)); }
  });
  byId('btn-show-signup').addEventListener('click', () => { hide('signin-form'); show('signup-form'); });
  byId('btn-show-signin').addEventListener('click', () => { hide('signup-form'); show('signin-form'); });
}

async function boot(): Promise<void> {
  wireGate();
  wireSignin();
  if (!(await isGateOpen())) { state.set('gate'); show('screen-gate'); return; }
  onUser(identity => {
    if (!identity) { state.set('signin'); show('screen-signin'); return; }
    state.set('playing'); // Task 14 replaces this with the bridge + client start
  });
}

void boot();
export { attachEmail, health }; // consumed by panels in Task 13
```

- [ ] **Step 12: Run everything and check in a browser**

```bash
cd web && npm run typecheck && npm run lint && npm test
```

Expected: no type or lint errors; 6 tests pass. Then with emulators, engine, and front server running, `npm run dev` and open `http://localhost:5173`: the gate card appears; `fiddlesticks` moves to the sign-in card; "Play as guest" signs in (the emulator's Auth tab shows the anonymous user) and the page switches to the still-empty frame section.

- [ ] **Step 13: Commit**

```bash
git add web
git commit -m "feat(web): vite scaffold, app state, firebase auth flows, api client, gate and sign-in screens"
```

---

### Task 12: RuneLite frame: layout, icon strip, panel controller, canvas sizing, overlays

**Files:**
- Create: `web/src/partials/frame.html`, `web/src/styles/frame.css`, `web/src/styles/panels.css`, `web/src/styles/overlays.css`, `web/src/frame/panels.ts`, `web/src/frame/canvasSize.ts`, `web/src/frame/overlays.ts`
- Test: `web/src/frame/panels.test.ts`, `web/src/frame/canvasSize.test.ts`

**Interfaces:**
- Produces: `createPanelController(opts: { strip: HTMLElement; panel: HTMLElement; title: HTMLElement; body: HTMLElement; onChange?: (open: PanelId | null) => void }): { open(id: PanelId): void; close(): void; toggle(id: PanelId): void; current(): PanelId | null; register(id: PanelId, view: PanelView): void }` with `PanelView = { title: string; mount(body: HTMLElement): void; unmount?(): void }`.
- Produces: `computeCanvasSize(opts: { available: number; mode: '1' | '2' | '3' | 'auto' }): { width: number; height: number }`, `applyCanvasSize(canvas: HTMLCanvasElement, size: { width: number; height: number }, filter: 'auto' | 'pixelated'): void`.
- Produces: `createOverlays(root: HTMLElement): { setXpLine(text: string | null): void; setStatus(text: string, tone: 'ok' | 'muted' | 'error'): void; setInfoBoxes(items: { label: string; value: string }[]): void; setHidden(hidden: boolean): void }`.

- [ ] **Step 1: `frame.html`**

```html
<section id="screen-frame" class="frame hidden">
  <header class="frame-title">
    <span class="brand">idlescape</span>
    <span id="title-centre" class="title-centre"></span>
    <span class="title-glyphs" aria-hidden="true">— ▢ ✕</span>
  </header>
  <div class="frame-body">
    <div id="stage" class="stage">
      <div id="canvas-wrap" class="canvas-wrap">
        <canvas id="canvas" width="789" height="532">Your browser cannot run the web client.</canvas>
        <div id="overlays" class="overlays"></div>
        <div id="offline-card" class="offline hidden">
          <h2>World offline</h2>
          <p>Retrying in <span id="offline-count">10</span>s</p>
        </div>
      </div>
      <aside id="side-panel" class="side-panel hidden" aria-live="polite">
        <div class="panel-header">
          <span id="panel-icon" class="panel-icon"></span>
          <b id="panel-title"></b>
          <button id="panel-back" class="panel-back" type="button" aria-label="Close panel">‹</button>
        </div>
        <div id="panel-body" class="panel-body"></div>
      </aside>
      <nav id="icon-strip" class="icon-strip" aria-label="Plugins">
        <button class="strip-btn" data-panel="claude" title="Claude">✦</button>
        <button class="strip-btn" data-panel="xp" title="XP Tracker">xp</button>
        <button class="strip-btn" data-panel="loot" title="Loot Tracker">⚔</button>
        <button class="strip-btn" data-panel="connect" title="Connect">⛓</button>
        <button class="strip-btn" data-panel="account" title="Account">☺</button>
        <button class="strip-btn strip-gear" data-panel="config" title="Configuration">⚙</button>
      </nav>
    </div>
  </div>
  <footer class="frame-foot">
    <span id="foot-left"></span>
    <span id="foot-right"></span>
  </footer>
</section>
```

- [ ] **Step 2: `frame.css`, `panels.css`, `overlays.css`**

`frame.css` essentials:

```css
.frame { display: flex; flex-direction: column; min-height: 100vh; }
.frame-title { height: var(--title-h); display: flex; align-items: center; justify-content: space-between; padding: 0 8px; background: rgb(var(--rl-panel)); border-bottom: 1px solid rgb(var(--rl-border)); font-size: 12px; }
.brand { color: rgb(var(--rl-orange)); font-weight: 700; letter-spacing: .04em; }
.title-centre, .title-glyphs { color: rgb(var(--rl-muted)); }
.frame-body { flex: 1; display: flex; justify-content: center; align-items: flex-start; padding: 8px; }
.stage { display: flex; align-items: stretch; width: 100%; max-width: 1600px; }
.canvas-wrap { position: relative; flex: 1; display: flex; justify-content: center; align-items: flex-start; }
#canvas { display: block; image-rendering: auto; background: #000; user-select: none; outline: none; -webkit-tap-highlight-color: transparent; }
.side-panel { width: var(--panel-w); background: rgb(var(--rl-panel)); border-left: 1px solid rgb(var(--rl-border)); display: flex; flex-direction: column; }
.panel-header { display: flex; align-items: center; gap: 6px; padding: 6px 8px; background: rgb(var(--rl-darker)); border-bottom: 1px solid rgb(var(--rl-border)); color: rgb(var(--rl-strong)); }
.panel-icon { color: rgb(var(--rl-orange)); }
.panel-back { margin-left: auto; background: none; border: 0; color: rgb(var(--rl-muted)); font-size: 16px; cursor: pointer; }
.panel-body { flex: 1; overflow: auto; padding: 8px; }
.icon-strip { width: var(--strip-w); background: rgb(var(--rl-darker)); border-left: 1px solid rgb(var(--rl-border)); display: flex; flex-direction: column; align-items: center; padding-top: 4px; gap: 6px; }
.strip-btn { width: 24px; height: 24px; border: 0; border-radius: var(--radius); background: rgb(var(--rl-hover)); color: rgb(var(--rl-text)); font-size: 11px; cursor: pointer; }
.strip-btn.active { background: rgb(var(--rl-orange)); color: rgb(var(--rl-border)); }
.strip-gear { margin-top: auto; margin-bottom: 6px; }
.frame-foot { height: var(--foot-h); display: flex; justify-content: space-between; align-items: center; padding: 0 8px; background: rgb(var(--rl-darker)); border-top: 1px solid rgb(var(--rl-border)); font-size: 10px; color: rgb(var(--rl-muted)); }
.offline { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgb(var(--rl-window)); color: rgb(var(--rl-strong)); }
@media (max-width: 1100px) { .stage { flex-wrap: wrap; } .canvas-wrap { flex-basis: 100%; } .side-panel { flex: 1; border-left: 0; border-top: 1px solid rgb(var(--rl-border)); } }
@media (max-width: 700px) { .icon-strip { flex-direction: row; width: 100%; padding: 4px; } .strip-gear { margin: 0 0 0 auto; } }
```

`panels.css`: `.p-row` (flex, space-between, 4px 0), `.p-label` (muted uppercase 10px), `.p-value` (strong), `.p-msg` (dark box with orange left border), `.p-msg.me` (grey border), `.p-btn` (small grey button), `.p-btn-primary` (orange), `.p-input` (dark input), `.p-error`, `.p-ok`, `.p-empty` (muted italic), `.p-table` (two-column grid).

`overlays.css`:

```css
.overlays { position: absolute; inset: 0; pointer-events: none; }
.overlays.hidden { display: none; }
.ov { position: absolute; background: rgba(0,0,0,.55); color: rgb(var(--rl-orange)); border: 1px solid rgba(var(--rl-orange), .35); padding: 2px 6px; font: 11px var(--font-pixel); white-space: nowrap; }
.ov-xp { top: 6px; left: 6px; }
.ov-status { top: 6px; right: 6px; }
.ov-status.ok { color: rgb(var(--rl-ok)); } .ov-status.error { color: rgb(var(--rl-error)); } .ov-status.muted { color: rgb(var(--rl-muted)); }
.ov-boxes { top: 30px; left: 6px; display: flex; flex-direction: column; gap: 4px; }
.ov-box { display: flex; justify-content: space-between; gap: 8px; min-width: 96px; }
```

- [ ] **Step 3: Write the failing panel controller and canvas size tests**

`web/src/frame/panels.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'vitest';
import { createPanelController } from './panels';

function fixture() {
  document.body.innerHTML = `
    <nav id="strip"><button class="strip-btn" data-panel="claude"></button><button class="strip-btn" data-panel="xp"></button></nav>
    <aside id="panel" class="hidden"><b id="title"></b><div id="body"></div></aside>`;
  return {
    strip: document.getElementById('strip')!, panel: document.getElementById('panel')!,
    title: document.getElementById('title')!, body: document.getElementById('body')!
  };
}

describe('panel controller', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  test('opens a registered panel, marks the icon active, mounts the view', () => {
    const els = fixture();
    const pc = createPanelController(els);
    pc.register('claude', { title: 'Claude', mount: body => { body.textContent = 'hello'; } });
    pc.open('claude');
    expect(els.panel.classList.contains('hidden')).toBe(false);
    expect(els.title.textContent).toBe('Claude');
    expect(els.body.textContent).toBe('hello');
    expect(els.strip.querySelector('[data-panel="claude"]')!.classList.contains('active')).toBe(true);
  });
  test('toggle on the open panel closes it and unmounts', () => {
    const els = fixture();
    const pc = createPanelController(els);
    let unmounted = false;
    pc.register('claude', { title: 'Claude', mount: () => {}, unmount: () => { unmounted = true; } });
    pc.toggle('claude'); pc.toggle('claude');
    expect(pc.current()).toBeNull();
    expect(els.panel.classList.contains('hidden')).toBe(true);
    expect(unmounted).toBe(true);
  });
  test('clicking a strip button opens that panel', () => {
    const els = fixture();
    const pc = createPanelController(els);
    pc.register('xp', { title: 'XP', mount: () => {} });
    (els.strip.querySelector('[data-panel="xp"]') as HTMLButtonElement).click();
    expect(pc.current()).toBe('xp');
  });
  test('remembers the last open panel in localStorage', () => {
    const els = fixture();
    const pc = createPanelController(els);
    pc.register('xp', { title: 'XP', mount: () => {} });
    pc.open('xp');
    expect(localStorage.getItem('cs.panel')).toBe('xp');
  });
});
```

`web/src/frame/canvasSize.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { computeCanvasSize } from './canvasSize';

describe('computeCanvasSize', () => {
  test('fixed multiples ignore available width', () => {
    expect(computeCanvasSize({ available: 400, mode: '1' })).toEqual({ width: 789, height: 532 });
    expect(computeCanvasSize({ available: 400, mode: '2' })).toEqual({ width: 1578, height: 1064 });
  });
  test('auto fills available width and keeps the ratio', () => {
    const s = computeCanvasSize({ available: 1000, mode: 'auto' });
    expect(s.width).toBe(1000);
    expect(s.height).toBe(Math.round(1000 * 532 / 789));
  });
  test('auto never goes below 1x on tiny widths? no: it shrinks, min 320', () => {
    expect(computeCanvasSize({ available: 100, mode: 'auto' }).width).toBe(320);
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `cd web && npx vitest run src/frame`
Expected: FAIL, cannot resolve `./panels` and `./canvasSize`.

- [ ] **Step 5: Implement `panels.ts`, `canvasSize.ts`, `overlays.ts`**

`web/src/frame/panels.ts`:

```ts
import type { PanelId } from '../types';

export interface PanelView { title: string; mount(body: HTMLElement): void; unmount?(): void }
const STORAGE_KEY = 'cs.panel';

export function createPanelController(opts: { strip: HTMLElement; panel: HTMLElement; title: HTMLElement; body: HTMLElement; onChange?: (open: PanelId | null) => void }) {
  const views = new Map<PanelId, PanelView>();
  let current: PanelId | null = null;

  function setActive(id: PanelId | null): void {
    for (const btn of Array.from(opts.strip.querySelectorAll<HTMLElement>('[data-panel]'))) {
      btn.classList.toggle('active', btn.dataset.panel === id);
    }
  }

  function close(): void {
    if (current) views.get(current)?.unmount?.();
    current = null;
    opts.body.replaceChildren();
    opts.panel.classList.add('hidden');
    setActive(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage blocked */ }
    opts.onChange?.(null);
  }

  function open(id: PanelId): void {
    const view = views.get(id);
    if (!view) return;
    if (current) views.get(current)?.unmount?.();
    current = id;
    opts.body.replaceChildren();
    opts.title.textContent = view.title;
    view.mount(opts.body);
    opts.panel.classList.remove('hidden');
    setActive(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* storage blocked */ }
    opts.onChange?.(id);
  }

  opts.strip.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-panel]');
    if (btn?.dataset.panel) toggle(btn.dataset.panel as PanelId);
  });

  function toggle(id: PanelId): void { current === id ? close() : open(id); }

  return {
    open, close, toggle,
    current: () => current,
    register(id: PanelId, view: PanelView) { views.set(id, view); },
    restore() {
      let saved: string | null = null;
      try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* storage blocked */ }
      if (saved && views.has(saved as PanelId)) open(saved as PanelId);
    }
  };
}
```

`web/src/frame/canvasSize.ts`:

```ts
export const CANVAS_W = 789;
export const CANVAS_H = 532;
const MIN_AUTO_W = 320;
export type SizeMode = '1' | '2' | '3' | 'auto';

export function computeCanvasSize(opts: { available: number; mode: SizeMode }): { width: number; height: number } {
  if (opts.mode !== 'auto') {
    const m = Number(opts.mode);
    return { width: CANVAS_W * m, height: CANVAS_H * m };
  }
  const width = Math.max(MIN_AUTO_W, Math.floor(opts.available));
  return { width, height: Math.round(width * CANVAS_H / CANVAS_W) };
}

export function applyCanvasSize(canvas: HTMLCanvasElement, size: { width: number; height: number }, filter: 'auto' | 'pixelated'): void {
  canvas.style.width = `${size.width}px`;
  canvas.style.height = `${size.height}px`;
  canvas.style.imageRendering = filter;
}
```

`web/src/frame/overlays.ts`:

```ts
export function createOverlays(root: HTMLElement) {
  root.innerHTML = '<div class="ov ov-xp hidden"></div><div class="ov ov-status muted"></div><div class="ov ov-boxes"></div>';
  const xp = root.querySelector<HTMLElement>('.ov-xp')!;
  const status = root.querySelector<HTMLElement>('.ov-status')!;
  const boxes = root.querySelector<HTMLElement>('.ov-boxes')!;
  return {
    setXpLine(text: string | null) { xp.textContent = text ?? ''; xp.classList.toggle('hidden', text === null); },
    setStatus(text: string, tone: 'ok' | 'muted' | 'error') { status.textContent = text; status.className = `ov ov-status ${tone}`; },
    setInfoBoxes(items: { label: string; value: string }[]) {
      boxes.replaceChildren(...items.map(i => { const d = document.createElement('div'); d.className = 'ov ov-box'; d.innerHTML = `<span>${i.label}</span><span>${i.value}</span>`; return d; }));
    },
    setHidden(hidden: boolean) { root.classList.toggle('hidden', hidden); }
  };
}
```

Labels and values passed to `setInfoBoxes` are program-generated strings, never user input; keep it that way or switch to `textContent` per span.

- [ ] **Step 6: Run tests**

Run: `cd web && npx vitest run src/frame`
Expected: 7 pass.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "feat(web): runelite frame markup, panel controller, canvas sizing, overlays"
```

---

### Task 13: Panels: Account, Configuration, Connect, Claude, XP Tracker, Loot Tracker

**Files:**
- Create: `web/src/panels/account.ts`, `web/src/panels/config.ts`, `web/src/panels/connect.ts`, `web/src/panels/claude.ts`, `web/src/panels/xp.ts`, `web/src/panels/loot.ts`, `web/src/stats/xp.ts`, `web/src/stats/loot.ts`, `web/src/stats/skills.ts`
- Test: `web/src/stats/xp.test.ts`, `web/src/stats/loot.test.ts`

**Interfaces:**
- Consumes: `PanelView` (Task 12), `Identity`, `attachEmail`, `signOutUser` (Task 11), `ClientHooks` types (Task 9, imported via a local copy `web/src/clientTypes.ts` that re-declares `ClientHooks`, `HookEvents`, `ClientState`, `LoginResult` exactly as in `client/src/hooks/types.ts`; keep the two files identical).
- Produces: `createXpTracker(): { onXp(ev: { skill: number; xp: number; delta: number; level: number }, now: number): void; rows(now: number): XpRow[]; reset(): void }` with `XpRow = { skill: number; name: string; gained: number; perHour: number; level: number; toNext: number | null }`.
- Produces: `createLootLog(): { onInventory(ev: { added: { id: number; count: number }[] }, now: number): void; entries(): LootEntry[]; reset(): void }` with `LootEntry = { id: number; count: number; firstSeen: number }`.
- Produces: `SKILL_NAMES: string[]` (21 entries in engine order) and `xpForLevel(level: number): number`.

- [ ] **Step 1: Write the failing stats tests**

`web/src/stats/xp.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { createXpTracker } from './xp';
import { xpForLevel } from './skills';

describe('xpForLevel', () => {
  test('matches the classic table', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(83);
    expect(xpForLevel(10)).toBe(1154);
    expect(xpForLevel(99)).toBe(13034431);
  });
});

describe('xp tracker', () => {
  test('first event sets a baseline and reports no gain', () => {
    const t = createXpTracker();
    t.onXp({ skill: 10, xp: 1000, delta: 1000, level: 9 }, 0);
    expect(t.rows(0)).toEqual([]);
  });
  test('subsequent events accumulate and compute per hour', () => {
    const t = createXpTracker();
    t.onXp({ skill: 10, xp: 1000, delta: 1000, level: 9 }, 0);
    t.onXp({ skill: 10, xp: 1300, delta: 300, level: 10 }, 30 * 60 * 1000);
    const [row] = t.rows(30 * 60 * 1000);
    expect(row.skill).toBe(10);
    expect(row.name).toBe('Fishing');
    expect(row.gained).toBe(300);
    expect(row.perHour).toBe(600);
    expect(row.level).toBe(10);
    expect(row.toNext).toBe(xpForLevel(11) - 1300);
  });
});
```

`web/src/stats/loot.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { createLootLog } from './loot';

describe('loot log', () => {
  test('aggregates added items by id and keeps first seen', () => {
    const l = createLootLog();
    l.onInventory({ added: [{ id: 335, count: 1 }] }, 100);
    l.onInventory({ added: [{ id: 335, count: 2 }, { id: 1511, count: 1 }] }, 200);
    expect(l.entries()).toEqual([{ id: 335, count: 3, firstSeen: 100 }, { id: 1511, count: 1, firstSeen: 200 }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/stats`
Expected: FAIL, modules missing.

- [ ] **Step 3: Implement `skills.ts`, `xp.ts`, `loot.ts`**

`web/src/stats/skills.ts`:

```ts
export const SKILL_NAMES = ['Attack', 'Defence', 'Strength', 'Hitpoints', 'Ranged', 'Prayer', 'Magic', 'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking', 'Crafting', 'Smithing', 'Mining', 'Herblore', 'Agility', 'Thieving', 'Slayer', 'Farming', 'Runecraft'];

const table: number[] = [0];
let points = 0;
for (let lvl = 1; lvl < 99; lvl++) {
  points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
  table.push(Math.floor(points / 4));
}

export function xpForLevel(level: number): number {
  return table[Math.min(Math.max(level, 1), 99) - 1];
}
```

`web/src/stats/xp.ts`:

```ts
import { SKILL_NAMES, xpForLevel } from './skills';

export interface XpRow { skill: number; name: string; gained: number; perHour: number; level: number; toNext: number | null }
interface Track { baseline: number; latest: number; level: number; firstAt: number }

export function createXpTracker() {
  const tracks = new Map<number, Track>();
  return {
    onXp(ev: { skill: number; xp: number; delta: number; level: number }, now: number) {
      const t = tracks.get(ev.skill);
      if (!t) { tracks.set(ev.skill, { baseline: ev.xp, latest: ev.xp, level: ev.level, firstAt: now }); return; }
      t.latest = ev.xp; t.level = ev.level;
    },
    rows(now: number): XpRow[] {
      const out: XpRow[] = [];
      for (const [skill, t] of tracks) {
        const gained = t.latest - t.baseline;
        if (gained <= 0) continue;
        const hours = Math.max(now - t.firstAt, 1) / 3_600_000;
        out.push({ skill, name: SKILL_NAMES[skill] ?? `Skill ${skill}`, gained, perHour: Math.round(gained / hours), level: t.level, toNext: t.level >= 99 ? null : xpForLevel(t.level + 1) - t.latest });
      }
      return out.sort((a, b) => b.gained - a.gained);
    },
    reset() { tracks.clear(); }
  };
}
```

`web/src/stats/loot.ts`:

```ts
export interface LootEntry { id: number; count: number; firstSeen: number }

export function createLootLog() {
  const entries = new Map<number, LootEntry>();
  return {
    onInventory(ev: { added: { id: number; count: number }[] }, now: number) {
      for (const a of ev.added) {
        const e = entries.get(a.id);
        if (e) e.count += a.count; else entries.set(a.id, { id: a.id, count: a.count, firstSeen: now });
      }
    },
    entries: () => Array.from(entries.values()),
    reset() { entries.clear(); }
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run src/stats`
Expected: 4 pass.

- [ ] **Step 5: Panel views**

Each panel exports `createXPanel(deps): PanelView`. Shared context object passed from `main.ts` (defined in Task 14 as `PanelDeps`): `{ identity: () => Identity | null; gameName: () => string | null; hooks: () => ClientHooks | null; xp: ReturnType<typeof createXpTracker>; loot: ReturnType<typeof createLootLog>; signOut: () => Promise<void>; attachEmail: (email: string, password: string) => Promise<unknown>; setSize: (mode: SizeMode) => void; setFilter: (f: 'auto' | 'pixelated') => void; getSize: () => SizeMode; getFilter: () => 'auto' | 'pixelated'; toggleOverlays: () => boolean; fullscreen: () => void }`.

`account.ts`: renders identity rows (`Signed in as`, `Game name`, `Account type` guest/email), an "Attach email" form shown only for guests (email + password inputs, submit calls `deps.attachEmail`, shows `friendlyAuthError` on failure and re-renders on success), a `Sign out` button calling `deps.signOut`, and an `#account-error` line the client host writes login rejections into (export `setAccountError(message: string | null)` that finds `#account-error` if mounted).

`config.ts`: a select for size (`1`, `2`, `3`, `auto`, default `auto`), a select for filter (`auto`, `pixelated`), a `Fullscreen` button (`deps.fullscreen`), and a `Hide overlays` checkbox (`deps.toggleOverlays`). Persist size and filter in `localStorage` under `cs.size` and `cs.filter` inside `main.ts`'s setters.

`connect.ts`: a `.p-msg` explaining pairing, a read-only input with `${location.origin}/pair/<token>` where the token is the literal `pending`, a `Copy` button (clipboard), and a status row `gateway not deployed yet`. No tokens are minted.

`claude.ts`: a `.p-empty` "Pair Claude to start" with a button that opens the Connect panel (`deps` gets `openPanel: (id: PanelId) => void`).

`xp.ts`: renders `deps.xp.rows(Date.now())` as `.p-table` rows: name, `+gained`, `perHour/h`, `lvl level`, `toNext to next`. Re-render every 5 seconds while mounted (store the interval, clear in `unmount`). Empty state: "Gain some experience to start tracking."

`loot.ts`: renders `deps.loot.entries()` sorted by `firstSeen` descending: `deps.hooks()?.getObjName(id) ?? #id`, `x count`. Re-render on a 2-second interval while mounted. Empty state: "Items you pick up will appear here."

- [ ] **Step 6: Typecheck and lint**

Run: `cd web && npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add web
git commit -m "feat(web): account, config, connect, claude, xp and loot panels with stat calculators"
```

---

### Task 14: Client host, boot integration, and end-to-end browser test

**Files:**
- Create: `web/src/clientHost.ts`, `web/src/clientTypes.ts`, `web/e2e/gate-to-game.pw.test.ts`, `web/playwright.config.ts`
- Modify: `web/src/main.ts`
- Test: `web/e2e/gate-to-game.pw.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 11 to 13; `window.idlescape.client` and the `idlescape:client-ready` event (Task 9).
- Produces: `loadClient(): Promise<ClientHooks>` (injects `/client/client.js` as a module, constructs `Client`, resolves when hooks are ready) and `startSession(deps): Promise<void>` (bridge, login, wire events).

- [ ] **Step 1: `clientTypes.ts`**

Copy `client/src/hooks/types.ts` verbatim minus `HookBridge`, `CHAT_COLOUR_TAG`, `INVENTORY_COM_ID`. Add a comment: "Mirror of client/src/hooks/types.ts; keep identical."

- [ ] **Step 2: `clientHost.ts`**

```ts
import type { ClientHooks } from './clientTypes';

declare global {
  interface Window { idlescape?: { client?: ClientHooks } }
}

let loading: Promise<ClientHooks> | null = null;

export function loadClient(nodeId: number = 10, members: boolean = true): Promise<ClientHooks> {
  if (loading) return loading;
  loading = new Promise<ClientHooks>((resolve, reject) => {
    const onReady = () => {
      const hooks = window.idlescape?.client;
      if (hooks) resolve(hooks); else reject(new Error('client hooks missing'));
    };
    window.addEventListener('idlescape:client-ready', onReady, { once: true });
    // The upstream bundle is an ES module exporting Client; the page constructs it exactly as the engine's rs2.cgi did.
    import(/* @vite-ignore */ '/client/client.js')
      .then((mod: { Client: new (nodeid: number, lowmem: number, members: boolean) => unknown }) => { new mod.Client(nodeId, 0, members); })
      .catch(reject);
    setTimeout(() => reject(new Error('client did not signal ready in 30s')), 30_000);
  });
  return loading;
}
```

Vite must not try to bundle `/client/client.js`; the `@vite-ignore` comment plus the absolute path keeps it a runtime import served by the front server (through the dev proxy in development).

- [ ] **Step 3: Extend `main.ts` for the playing state**

Add to `main.ts`:

```ts
import { bridge as bridgeApi } from './api';
import { currentIdToken, signOutUser } from './auth';
import { loadClient } from './clientHost';
import { applyCanvasSize, computeCanvasSize, type SizeMode } from './frame/canvasSize';
import { createOverlays } from './frame/overlays';
import { createPanelController } from './frame/panels';
import { createXpTracker } from './stats/xp';
import { createLootLog } from './stats/loot';
import { createAccountPanel, setAccountError } from './panels/account';
import { createConfigPanel } from './panels/config';
import { createConnectPanel } from './panels/connect';
import { createClaudePanel } from './panels/claude';
import { createXpPanel } from './panels/xp';
import { createLootPanel } from './panels/loot';
import type { ClientHooks } from './clientTypes';
import type { Identity, PanelId } from './types';

let identity: Identity | null = null;
let hooks: ClientHooks | null = null;
let gameName: string | null = null;
const xp = createXpTracker();
const loot = createLootLog();
let sizeMode: SizeMode = (localStorage.getItem('cs.size') as SizeMode | null) ?? 'auto';
let filter: 'auto' | 'pixelated' = (localStorage.getItem('cs.filter') as 'auto' | 'pixelated' | null) ?? 'auto';

const overlays = createOverlays(byId('overlays'));
const panels = createPanelController({ strip: byId('icon-strip'), panel: byId('side-panel'), title: byId('panel-title'), body: byId('panel-body'), onChange: () => layout() });

function layout(): void {
  const stage = byId('stage');
  const panelOpen = !byId('side-panel').classList.contains('hidden');
  const reserved = 32 + (panelOpen && stage.clientWidth > 1100 ? 210 : 0) + 16;
  applyCanvasSize(byId<HTMLCanvasElement>('canvas'), computeCanvasSize({ available: stage.clientWidth - reserved, mode: sizeMode }), filter);
}
window.addEventListener('resize', layout);

const deps = {
  identity: () => identity, gameName: () => gameName, hooks: () => hooks, xp, loot,
  signOut: async () => { hooks?.logout(); await signOutUser(); },
  attachEmail, openPanel: (id: PanelId) => panels.open(id),
  setSize: (m: SizeMode) => { sizeMode = m; localStorage.setItem('cs.size', m); layout(); },
  setFilter: (f: 'auto' | 'pixelated') => { filter = f; localStorage.setItem('cs.filter', f); layout(); },
  getSize: () => sizeMode, getFilter: () => filter,
  toggleOverlays: () => { const o = byId('overlays'); o.classList.toggle('hidden'); return o.classList.contains('hidden'); },
  fullscreen: () => { void byId('canvas').requestFullscreen?.(); }
};
panels.register('claude', createClaudePanel(deps));
panels.register('xp', createXpPanel(deps));
panels.register('loot', createLootPanel(deps));
panels.register('connect', createConnectPanel(deps));
panels.register('account', createAccountPanel(deps));
panels.register('config', createConfigPanel(deps));

function wireHooks(h: ClientHooks): void {
  h.on('xp', ev => { xp.onXp(ev, Date.now()); const [top] = xp.rows(Date.now()); overlays.setXpLine(top ? `${top.name} · ${top.perHour.toLocaleString()} xp/h` : null); });
  h.on('inventory', ev => loot.onInventory(ev, Date.now()));
  h.on('logout', () => { overlays.setStatus('logged out', 'muted'); byId('title-centre').textContent = ''; });
  h.on('disconnect', () => overlays.setStatus('reconnecting…', 'error'));
  h.on('login', ev => { overlays.setStatus('● not paired', 'muted'); byId('title-centre').textContent = `osrs.scotho.com · world 1 · ${ev.gameName}`; });
  setInterval(() => { const s = h.getState(); byId('foot-right').textContent = `fps ${s.fps}${env.gateOn ? ' · gate: fiddlesticks' : ''}`; }, 1000);
}

async function startSession(): Promise<void> {
  state.set('playing');
  layout();
  overlays.setStatus('connecting…', 'muted');
  try {
    const h = hooks ?? (hooks = await loadClient());
    if (!hooks.__wired) { wireHooks(h); (hooks as ClientHooks & { __wired?: boolean }).__wired = true; }
    const token = await currentIdToken();
    const desired = identity?.isAnonymous ? undefined : identity?.displayName ?? undefined;
    const creds = await bridgeApi(token, desired);
    gameName = creds.gameName;
    const result = await h.login(creds.gameName, creds.secret);
    if (!result.ok) { setAccountError(result.reason); overlays.setStatus(`login failed (${result.code})`, 'error'); panels.open('account'); return; }
    setAccountError(null);
    byId('foot-left').textContent = identity?.isAnonymous ? 'guest · attach an email to keep this character' : identity?.email ?? '';
    panels.restore();
  } catch (err) {
    setAccountError((err as Error).message);
    overlays.setStatus('bridge failed', 'error');
    panels.open('account');
  }
}

async function watchHealth(): Promise<void> {
  const card = byId('offline-card');
  const count = byId('offline-count');
  let secs = 10;
  setInterval(async () => {
    const h = await health().catch(() => ({ engine: 'down' as const }));
    const down = h.engine === 'down';
    card.classList.toggle('hidden', !down);
    if (down) { secs = secs <= 1 ? 10 : secs - 1; count.textContent = String(secs); }
  }, 1000);
}
```

Replace the `onUser` block in `boot()` with:

```ts
  onUser(id => {
    identity = id;
    if (!id) { state.set('signin'); show('screen-signin'); return; }
    void startSession();
  });
  void watchHealth();
```

`env.gateOn` is a small helper reading a `<meta name="cs-gate">` the server injects? Simpler: the front server exposes `gateEnabled` in `/api/health`; add it to `HealthSnapshot` in both `server/src/types.ts` and `web/src/types.ts` and to `health.ts`'s `snapshot()` by passing `env.gateEnabled` into `createHealth` opts. Update the Task 2 health test expectation to include `gateEnabled: true`.

Remove the `hooks.__wired` hack by keeping a module-level `let wired = false;` instead. (Written here as the intended final form: use the boolean.)

- [ ] **Step 4: Playwright config and the e2e test**

`web/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  workers: 1,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8787', screenshot: 'only-on-failure', viewport: { width: 1280, height: 800 } }
});
```

`web/e2e/gate-to-game.pw.test.ts`:

```ts
import { expect, test } from '@playwright/test';

// Requires: firebase emulators, engine, front server (serving web/dist) all running. See scripts/verify.ps1.
test('gate -> guest -> in game with hooks', async ({ page }) => {
  const frames: number[] = [];
  page.on('websocket', ws => ws.on('framereceived', f => frames.push(f.payload.length)));
  await page.goto('/');
  await page.getByPlaceholder('password').fill('fiddlesticks');
  await page.getByRole('button', { name: 'Enter' }).click();
  await page.getByRole('button', { name: 'Play as guest' }).click();
  await expect(page.locator('#screen-frame')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.idlescape?.client?.getState().loggedIn ?? false), { timeout: 90_000 }).toBe(true);
  const state = await page.evaluate(() => window.idlescape!.client!.getState());
  expect(state.gameName).toMatch(/^guest_[a-z0-9]{6}$/);
  expect(state.skills.xp.length).toBeGreaterThan(20);
  expect(frames.length).toBeGreaterThan(10);
  await page.evaluate(() => window.idlescape!.client!.echoChat('hello from e2e'));
  await page.locator('[data-panel="account"]').click();
  await expect(page.locator('#panel-title')).toHaveText('Account');
  await page.screenshot({ path: '../docs/screenshots/e2e-in-game.png' });
});
```

Add to `web/tsconfig.json` a `types` entry or a `declare global` in `e2e/global.d.ts` for `window.idlescape` (copy the declaration from `clientHost.ts`).

- [ ] **Step 5: Run the full flow**

Terminal 1: `cd firebase && npm run emulators`. Terminal 2: engine (`cd engine/server && bun run src/app.ts`). Terminal 3: `cd server && FIREBASE_EMULATORS=true bun run src/index.ts` (set `FIREBASE_EMULATORS=true` in `server/.env` for development). Terminal 4: `cd web && npm run build && npx playwright test`.

Expected: the test passes and `docs/screenshots/e2e-in-game.png` shows the RuneLite frame with the player on Tutorial Island and the Account panel open. Also open `http://localhost:8787` by hand and confirm: canvas auto-sizes with the window, the panel collapses on a second click of its icon, the orange chat line appeared, the XP panel updates after gaining xp on Tutorial Island, and Configuration's 1x/2x switch works.

- [ ] **Step 6: Commit**

```bash
git add web docs/screenshots/e2e-in-game.png server/src/types.ts server/src/health.ts server/src/health.test.ts server/src/index.ts
git commit -m "feat(web): client host with bridged login, session wiring, and gate-to-game e2e"
```

---

### Task 15: Build, start-stack, and verify scripts; README

**Files:**
- Create: `scripts/build.ps1`, `scripts/start-stack.ps1`, `scripts/verify.ps1`
- Modify: `README.md`, `.gitignore` (add `logs/` if missing)

**Interfaces:**
- Produces: `scripts/build.ps1` (client build, web build, server typecheck), `scripts/start-stack.ps1 [-Prod]` (emulators unless `-Prod`, engine, server, vite dev unless `-Prod`), `scripts/verify.ps1` (all unit tests, then e2e against a freshly built stack).

- [ ] **Step 1: `scripts/build.ps1`**

```powershell
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$bun = "$env:USERPROFILE\.bun\bin\bun.exe"
Push-Location "$root\client";  & $bun run build;       Pop-Location
Push-Location "$root\web";     npm run build;           Pop-Location
Push-Location "$root\server";  & $bun run typecheck;    Pop-Location
Write-Host "build complete: client/out, web/dist"
```

- [ ] **Step 2: `scripts/start-stack.ps1`**

```powershell
param([switch]$Prod)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$bun = "$env:USERPROFILE\.bun\bin\bun.exe"
New-Item -ItemType Directory -Force "$root\logs" | Out-Null
$procs = @()
if (-not $Prod) {
  $procs += Start-Process -PassThru -NoNewWindow -WorkingDirectory "$root\firebase" -FilePath "npm" -ArgumentList "run","emulators" -RedirectStandardOutput "$root\logs\emulators.log"
}
$procs += Start-Process -PassThru -NoNewWindow -WorkingDirectory "$root\engine\server" -FilePath $bun -ArgumentList "run","src/app.ts" -RedirectStandardOutput "$root\logs\engine.log"
$procs += Start-Process -PassThru -NoNewWindow -WorkingDirectory "$root\server" -FilePath $bun -ArgumentList "run","src/index.ts" -RedirectStandardOutput "$root\logs\server.log"
if (-not $Prod) {
  $procs += Start-Process -PassThru -NoNewWindow -WorkingDirectory "$root\web" -FilePath "npm" -ArgumentList "run","dev" -RedirectStandardOutput "$root\logs\web.log"
  Write-Host "dev: http://localhost:5173  (front server http://localhost:8787)"
} else {
  Write-Host "prod: http://localhost:8787"
}
Write-Host "logs in $root\logs. Ctrl+C stops everything."
try { Wait-Process -Id ($procs | ForEach-Object Id) } finally { $procs | ForEach-Object { try { Stop-Process -Id $_.Id -Force } catch {} } }
```

- [ ] **Step 3: `scripts/verify.ps1`**

```powershell
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$bun = "$env:USERPROFILE\.bun\bin\bun.exe"
Push-Location "$root\client"; & $bun test src/hooks; Pop-Location
Push-Location "$root\web";    npm run typecheck; npm run lint; npm test; Pop-Location
Push-Location "$root\firebase"; npm test; Pop-Location
& "$PSScriptRoot\build.ps1"
# Bridge tests and e2e need emulators + engine + server. Start them, run, stop.
$stack = Start-Process -PassThru -NoNewWindow -FilePath "powershell" -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File","$PSScriptRoot\start-stack.ps1","-Prod"
$emu = Start-Process -PassThru -NoNewWindow -WorkingDirectory "$root\firebase" -FilePath "npm" -ArgumentList "run","emulators"
try {
  $deadline = (Get-Date).AddMinutes(5)
  do { Start-Sleep 3; $ok = try { (Invoke-RestMethod http://localhost:8787/api/health).engine -eq 'up' } catch { $false } } until ($ok -or (Get-Date) -gt $deadline)
  if (-not $ok) { throw "stack did not come up" }
  Push-Location "$root\server"; $env:FIREBASE_EMULATORS='true'; & $bun test; Pop-Location
  Push-Location "$root\web"; npx playwright test; Pop-Location
} finally {
  foreach ($p in @($stack, $emu)) { try { Stop-Process -Id $p.Id -Force } catch {} }
  Get-Process bun, java -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*idlescape*" -or $_.Path -like "*osrs_test*" } | Stop-Process -Force -ErrorAction SilentlyContinue
}
Write-Host "verify passed"
```

The server `.env` must have `FIREBASE_EMULATORS=true` for the verify run; production uses a separate `.env` (Task 16 writes it).

- [ ] **Step 4: Run it**

Run: `npm run verify` from the repo root.
Expected: all suites pass and "verify passed". Fix anything that fails before moving on.

- [ ] **Step 5: README rewrite**

Rewrite `README.md` to cover: what idlescape is and the four sub-projects; layout; prerequisites; `npm run setup`, `npm run dev`, `npm run build`, `npm run verify`; the env files (`server/.env`, `web/.env.local`); Firebase notes; the deploy pointers to `deploy/windows` and `deploy/docker`; and keep the original validation history under a "Background" heading.

- [ ] **Step 6: Commit**

```bash
git add scripts README.md .gitignore
git commit -m "chore: build, start-stack, verify scripts and README"
```

---

### Task 16: Windows deployment: services and Cloudflare Tunnel to osrs.scotho.com

**Files:**
- Create: `deploy/windows/register-tasks.ps1`, `deploy/windows/unregister-tasks.ps1`, `deploy/windows/install-tunnel.ps1`, `deploy/cloudflared/config.yml.template`, `server/.env.production.example`
- Modify: `README.md` (Deploy section)

**Interfaces:**
- Consumes: built `web/dist` and `client/out` (Task 15), `server/.env` production values.
- Produces: scheduled tasks `idlescape-engine` and `idlescape-server`; Windows service `cloudflared` routing `osrs.scotho.com` to `http://localhost:8787`.

- [ ] **Step 1: Production env**

`server/.env.production.example` is `.env.example` with `FIREBASE_EMULATORS=false`, `PUBLIC_ORIGIN=https://osrs.scotho.com`, and a fresh `GATE_SECRET`. Generate the secret and write `server/.env`:

```powershell
$secret = -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
(Get-Content server\.env.production.example) -replace 'GATE_SECRET=.*', "GATE_SECRET=$secret" | Set-Content -Encoding utf8 server\.env
```

`web/.env.local` for the production build: real Firebase values, `VITE_USE_FIREBASE_EMULATORS=false`. Run `npm run build`.

- [ ] **Step 2: `register-tasks.ps1` (run as Administrator)**

```powershell
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$bun = "%USERPROFILE%\.bun\bin\bun.exe"
New-Item -ItemType Directory -Force "$root\logs" | Out-Null
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
$trigger = New-ScheduledTaskTrigger -AtStartup

$engineAction = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$bun run src/app.ts >> $root\logs\engine.log 2>&1`"" -WorkingDirectory "$root\engine\server"
Register-ScheduledTask -TaskName 'idlescape-engine' -Action $engineAction -Trigger $trigger -Principal $principal -Settings $settings -Force

$serverAction = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$bun run src/index.ts >> $root\logs\server.log 2>&1`"" -WorkingDirectory "$root\server"
Register-ScheduledTask -TaskName 'idlescape-server' -Action $serverAction -Trigger $trigger -Principal $principal -Settings $settings -Force

Start-ScheduledTask -TaskName 'idlescape-engine'
Start-Sleep 5
Start-ScheduledTask -TaskName 'idlescape-server'
Write-Host "tasks registered and started; logs in $root\logs"
```

`unregister-tasks.ps1` stops and unregisters both tasks (`Stop-ScheduledTask`, `Unregister-ScheduledTask -Confirm:$false`).

Also, once: disable sleep on AC and set active hours so Windows Update reboots land at night:

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
```

- [ ] **Step 3: Verify the tasks**

Run `deploy\windows\register-tasks.ps1` from an elevated PowerShell. Then `Get-ScheduledTask idlescape-* | Select TaskName, State` shows both `Running`; `curl http://localhost:8787/api/health` returns `engine: up` after the world loads; `Get-Content logs\server.log -Tail 3` shows the front server banner. Stop the earlier manual bun processes first so ports are free.

- [ ] **Step 4: `deploy/cloudflared/config.yml.template` and `install-tunnel.ps1`**

Template:

```yaml
tunnel: __TUNNEL_ID__
credentials-file: __CREDENTIALS__
ingress:
  - hostname: osrs.scotho.com
    service: http://localhost:8787
    originRequest:
      noTLSVerify: true
  - service: http_status:404
```

`install-tunnel.ps1` (run as Administrator; the zone cert already exists at `$env:USERPROFILE\.cloudflared\cert.pem` from `cloudflared tunnel login`):

```powershell
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$cf = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$name = 'idlescape'
$hostname = 'osrs.scotho.com'
$userDir = "$env:USERPROFILE\.cloudflared"
$sysDir = "C:\Windows\System32\config\systemprofile\.cloudflared"

$existing = (& $cf tunnel list --output json | ConvertFrom-Json) | Where-Object { $_.name -eq $name }
if (-not $existing) { & $cf tunnel create $name | Out-Null; $existing = (& $cf tunnel list --output json | ConvertFrom-Json) | Where-Object { $_.name -eq $name } }
$id = $existing.id
Write-Host "tunnel $name id $id"

& $cf tunnel route dns --overwrite-dns $name $hostname

New-Item -ItemType Directory -Force $sysDir | Out-Null
Copy-Item "$userDir\$id.json" "$sysDir\$id.json" -Force
Copy-Item "$userDir\cert.pem" "$sysDir\cert.pem" -Force
$config = (Get-Content "$PSScriptRoot\..\cloudflared\config.yml.template" -Raw).Replace('__TUNNEL_ID__', $id).Replace('__CREDENTIALS__', "$sysDir\$id.json")
Set-Content -Encoding ascii "$sysDir\config.yml" $config

if (Get-Service cloudflared -ErrorAction SilentlyContinue) { & $cf service uninstall; Start-Sleep 2 }
& $cf service install
Start-Service cloudflared
Start-Sleep 5
Get-Service cloudflared | Select-Object Status
Write-Host "https://$hostname should now reach the front server"
```

The service runs as SYSTEM and reads config from the systemprofile directory, which is why the credentials and config are copied there.

- [ ] **Step 5: Verify from outside**

```bash
curl -s https://osrs.scotho.com/api/health
curl -s -o /dev/null -w "%{http_code}\n" https://osrs.scotho.com/
```

Expected: the health JSON with `engine: up`; `200` for the page. Then run the e2e against production once: `cd web && E2E_BASE_URL=https://osrs.scotho.com npx playwright test` with `VITE_USE_FIREBASE_EMULATORS=false` built in. Expected: pass, creating a real guest account in the `idlescape-osrs` project. Finally, run an external probe as in the hosting spike: `curl -s -H "Accept: application/json" "https://check-host.net/check-http?host=https://osrs.scotho.com/api/health&max_nodes=2"` and fetch the result to confirm a non-local vantage point gets `200`.

- [ ] **Step 6: Document and commit**

Add a "Deploy (this PC)" section to `README.md`: elevated PowerShell, `deploy\windows\register-tasks.ps1`, `deploy\windows\install-tunnel.ps1`, where logs live, how to stop (`unregister-tasks.ps1`, `Stop-Service cloudflared`), and that the tunnel certificate and credentials live under the user and systemprofile `.cloudflared` directories and are never committed.

```bash
git add deploy server/.env.production.example README.md
git commit -m "feat(deploy): windows scheduled tasks and cloudflare tunnel for osrs.scotho.com"
```

---

### Task 17: Container deployment files for the Oracle VM

**Files:**
- Create: `deploy/docker/engine.Dockerfile`, `deploy/docker/server.Dockerfile`, `deploy/docker/docker-compose.yml`, `deploy/docker/README.md`

**Interfaces:**
- Consumes: `scripts/upstream.lock` pins (Task 1), the front server env (Task 2), the tunnel token model (Task 16 creates the tunnel; the VM uses the same tunnel via a token).
- Produces: a compose stack `engine` (unpublished), `server` (internal), `cloudflared` (token-based), verified only when the VM exists. Docker is not installed on this PC, so this task is authoring plus a syntax check with `docker compose config` on the VM.

- [ ] **Step 1: `engine.Dockerfile`**

```dockerfile
FROM oven/bun:1.4 AS base
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates openjdk-17-jre-headless && rm -rf /var/lib/apt/lists/*
WORKDIR /opt
ARG ENGINE_SHA
ARG CONTENT_SHA
RUN git clone --single-branch -b 225 https://github.com/LostCityRS/Engine-TS engine/server \
 && git -C engine/server checkout ${ENGINE_SHA} \
 && git clone --single-branch -b 225 https://github.com/LostCityRS/Content engine/content \
 && git -C engine/content checkout ${CONTENT_SHA}
WORKDIR /opt/engine/server
RUN bun install --frozen-lockfile || bun install
RUN cp .env.example .env && printf '\nWEB_PORT=8888\nWEBSITE_REGISTRATION=false\n' >> .env
# Pack the cache at build time so first boot is fast.
RUN bun run build
EXPOSE 8888
CMD ["bun", "run", "src/app.ts"]
```

- [ ] **Step 2: `server.Dockerfile`**

```dockerfile
FROM oven/bun:1.4 AS build
WORKDIR /app
COPY client/ client/
RUN cd client && bun install && bun run build
FROM node:22-slim AS web
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
RUN npm run build
FROM oven/bun:1.4
WORKDIR /app/server
COPY server/package.json server/bun.lock* ./
RUN bun install --production
COPY server/src ./src
COPY --from=build /app/client/out /app/client/out
COPY --from=web /app/web/dist /app/web/dist
ENV WEB_DIST=/app/web/dist CLIENT_OUT=/app/client/out ENGINE_PUBLIC=/app/engine-public
EXPOSE 8787
CMD ["bun", "run", "src/index.ts"]
```

The engine's `public/client` companions (`deps.js`, soundfont) are copied into the server image by compose's build context in the README step below, or served by mounting a volume from the engine image; the simplest is to `COPY engine/server/public/client /app/engine-public/client` in the server Dockerfile when building from the repo checkout that includes the engine clone.

- [ ] **Step 3: `docker-compose.yml`**

```yaml
services:
  engine:
    build:
      context: ../..
      dockerfile: deploy/docker/engine.Dockerfile
      args:
        ENGINE_SHA: ${ENGINE_SHA}
        CONTENT_SHA: ${CONTENT_SHA}
    restart: unless-stopped
    volumes:
      - engine-db:/opt/engine/server/db.sqlite
    networks: [internal]
  server:
    build:
      context: ../..
      dockerfile: deploy/docker/server.Dockerfile
      args:
        VITE_FIREBASE_API_KEY: ${VITE_FIREBASE_API_KEY}
        VITE_FIREBASE_AUTH_DOMAIN: ${VITE_FIREBASE_AUTH_DOMAIN}
        VITE_FIREBASE_PROJECT_ID: ${VITE_FIREBASE_PROJECT_ID}
        VITE_FIREBASE_APP_ID: ${VITE_FIREBASE_APP_ID}
        VITE_FIREBASE_MESSAGING_SENDER_ID: ${VITE_FIREBASE_MESSAGING_SENDER_ID}
    env_file: ../../server/.env
    environment:
      ENGINE_HTTP: http://engine:8888
      ENGINE_WS: ws://engine:8888
      GOOGLE_APPLICATION_CREDENTIALS: /run/secrets/firebase-admin.json
    secrets: [firebase-admin.json]
    depends_on: [engine]
    restart: unless-stopped
    networks: [internal]
  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    restart: unless-stopped
    depends_on: [server]
    networks: [internal]
secrets:
  firebase-admin.json:
    file: ../../server/secrets/firebase-admin.json
volumes:
  engine-db: {}
networks:
  internal: {}
```

No `ports:` on any service: only the tunnel reaches the internet. The tunnel token comes from the Cloudflare dashboard for the same `idlescape` tunnel (Zero Trust, Networks, Tunnels, the tunnel, Configure, token) with an ingress rule `osrs.scotho.com -> http://server:8787` added in the dashboard, which supersedes the local config on the PC when the tunnel moves.

- [ ] **Step 4: `deploy/docker/README.md`**

Document: install Docker on Ubuntu 24.04 aarch64, clone the repo, copy `server/.env` and `server/secrets/firebase-admin.json`, create `deploy/docker/.env` with the `ENGINE_SHA`, `CONTENT_SHA` (from `scripts/upstream.lock`), the five `VITE_FIREBASE_*` values, and `CLOUDFLARE_TUNNEL_TOKEN`; then `docker compose config` (syntax check), `docker compose build`, `docker compose up -d`, and `curl https://osrs.scotho.com/api/health`. Note the engine image build packs the cache and takes several minutes on ARM.

- [ ] **Step 5: Commit**

```bash
git add deploy/docker
git commit -m "feat(deploy): docker compose stack for the oracle vm (unverified until the vm exists)"
```

---

## Self-review against the spec

- **Spec 3 topology:** Tasks 2, 4, 5, 16 (front server, proxy, tunnel). Engine untouched: Task 1 pins, no task edits `engine/`.
- **Spec 4.1 gate:** Task 3 (cookie, cooldown, disable flag); WebSocket behind the gate: Task 4 Step 10 ordering plus Task 5.
- **Spec 4.2 identity:** Task 11 (guest, email, reset, attach), Task 6 (rules, profile doc shape).
- **Spec 4.3 bridge:** Tasks 7 and 8 (name rules, secret, transaction, `users.gameName` merge).
- **Spec 5 routes:** Task 4 classify covers every listed route; `/client/*` fallback to engine companions in `static.ts`; `.mid` handled as cache.
- **Spec 6 shell:** Task 11 (gate, sign-in), Task 12 (frame, strip, panel, overlays, responsive), Task 13 (all six panels), Task 14 (offline card, states, footer).
- **Spec 7 hooks:** Task 9 (interface, emitter, diffs), Task 10 (login, headless title, events, echo, `getObjName`). `rttMs` is always `null` in this sub-project; the spec allows null and sub-project 2 will measure it.
- **Spec 8 layout and conventions:** Task 1, Task 15. `types.ts` per package: server (Task 2), web (Task 11), client hooks (Task 9).
- **Spec 9 deployment:** Task 16 (PC), Task 17 (VM, authored only), Task 6 (Firebase resources).
- **Spec 10 error handling:** offline card (Task 14), bridge errors to Account panel (Task 14), login rejection mapping (Task 10 and 14), gate cooldown (Task 3), close code mirroring (Task 5), bundle and wasm served together (Task 4 `static.ts`).
- **Spec 11 testing:** unit in Tasks 2, 3, 4, 5, 7, 8, 9, 11, 12, 13; rules in Task 6; e2e in Task 14; `scripts/verify.ps1` in Task 15.
- **Placeholder scan:** the Connect panel's `pending` token is a deliberate spec-mandated placeholder, not a plan gap. `HealthSnapshot.gateEnabled` is introduced in Task 14 Step 3 and must be added to Task 2's type, `health.ts`, and its test at that point.
- **Type consistency:** `ClientHooks`, `HookEvents`, `ClientState`, `LoginResult` are defined once in Task 9 and mirrored verbatim in Task 14's `clientTypes.ts`; `PanelView`, `PanelId`, `SizeMode` come from Tasks 11 and 12 and are used unchanged in Tasks 13 and 14; `BridgeResponse` and `HealthSnapshot` exist in both `server/src/types.ts` and `web/src/types.ts` with identical fields.

