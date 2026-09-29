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
  if (route.kind === 'page') {
    const res = await fileResponse(path.join(env.webDist, route.file), 'no-cache');
    return res ?? new Response('Not found', { status: 404 });
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
