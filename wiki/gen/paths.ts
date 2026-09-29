import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

export const ROOT = path.resolve(import.meta.dir, '..', '..');
export const CONTENT = path.join(ROOT, 'engine', 'content');
export const ENGINE = path.join(ROOT, 'engine', 'server');
export const DATA = path.join(ROOT, 'wiki', 'data');
export const BUILD = path.join(ROOT, 'wiki', 'build');
export const OVERLAYS = path.join(ROOT, 'wiki', 'content');

export function upstreamShas(): { contentSha: string; engineSha: string } {
  const lock = readFileSync(path.join(ROOT, 'scripts', 'upstream.lock'), 'utf8');
  const map = new Map(lock.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#')).map(l => l.split(' ') as [string, string]));
  return { contentSha: map.get('engine/content') ?? 'unknown', engineSha: map.get('engine/server') ?? 'unknown' };
}

/** The commit actually checked out in a content clone: resolves a symbolic `ref: ...` HEAD through the loose ref file or packed-refs, or returns the sha directly for a detached HEAD. */
export function contentHeadSha(contentDir = CONTENT): string {
  const head = readFileSync(path.join(contentDir, '.git', 'HEAD'), 'utf8').trim();
  const m = /^ref:\s*(\S+)/.exec(head);
  if (!m) return head;
  const ref = m[1]!;
  const refFile = path.join(contentDir, '.git', ref);
  if (existsSync(refFile)) return readFileSync(refFile, 'utf8').trim();
  const packed = readFileSync(path.join(contentDir, '.git', 'packed-refs'), 'utf8');
  for (const line of packed.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length === 2 && parts[1] === ref) return parts[0]!;
  }
  throw new Error(`could not resolve content HEAD ref ${ref} (no loose ref file and no match in packed-refs)`);
}
