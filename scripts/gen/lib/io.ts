// Shared file IO for the three generators. Bun only: nothing in web/ imports this.
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dir, '..', '..', '..');
export const CONTENT = join(ROOT, 'engine', 'content');
export const DATA = join(ROOT, 'web', 'src', 'data');

/** Every file under `dir` whose name matches, recursively, in a stable order. */
export function filesUnder(dir: string, match: RegExp): string[] {
  const out: string[] = [];
  const walk = (at: string): void => {
    for (const entry of readdirSync(at).sort()) {
      const full = join(at, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (match.test(entry)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

/** A sha256 over the generator's inputs: path plus bytes, in the order `filesUnder` returns. */
export function contentSha(files: string[]): string {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(relative(ROOT, file).replace(/\\/g, '/'));
    hash.update(readFileSync(file));
  }
  return hash.digest('hex').slice(0, 16);
}

export interface Budget { rawBytes: number; gzipBytes: number }

/** Fails loudly rather than committing an asset the shell would then fetch on every run. */
export function enforceBudget(name: string, bytes: Uint8Array, budget: Budget): void {
  const gz = gzipSync(bytes).byteLength;
  if (bytes.byteLength > budget.rawBytes || gz > budget.gzipBytes) {
    throw new Error(
      `${name} is ${bytes.byteLength} bytes raw / ${gz} gzipped; the budget is ` +
      `${budget.rawBytes} / ${budget.gzipBytes} (spec decision 2)`);
  }
  console.log(`${name}: ${bytes.byteLength} bytes raw, ${gz} gzipped (budget ${budget.rawBytes} / ${budget.gzipBytes})`);
}

/**
 * `writeOrCheck` for generated *source*, where the byte comparison cannot be exact. `.gitattributes`
 * says `text=auto` and this repo is checked out with `core.autocrlf=true`, so a committed `.ts`
 * file arrives with CRLF while a generator writing `\n` produces LF: comparing bytes would fail
 * the build on every fresh clone. Line endings are normalised on both sides instead, and the
 * generator writes LF, which is what git stores either way.
 */
export function writeOrCheckText(path: string, text: string, check: boolean): void {
  const normalise = (s: string): string => s.replace(/\r\n/g, '\n');
  if (!check) {
    writeFileSync(path, text);
    console.log(`wrote ${relative(ROOT, path)}`);
    return;
  }
  let existing: string;
  try { existing = readFileSync(path, 'utf8'); } catch { throw new Error(`${relative(ROOT, path)} is missing; run the generator`); }
  if (normalise(existing) !== normalise(text)) {
    throw new Error(`${relative(ROOT, path)} is out of date with engine/content; re-run the generator and commit it`);
  }
  console.log(`${relative(ROOT, path)} is current`);
}

/**
 * Write, or in `--check` mode compare. The check is what `scripts/build.ps1` runs: the atlas is
 * committed output, so a content bump that nobody regenerated has to fail the build rather than
 * leave the shell fetching an atlas that no longer describes the map.
 */
export function writeOrCheck(path: string, bytes: Uint8Array, check: boolean): void {
  if (!check) {
    writeFileSync(path, bytes);
    console.log(`wrote ${relative(ROOT, path)}`);
    return;
  }
  let existing: Uint8Array;
  try { existing = readFileSync(path); } catch { throw new Error(`${relative(ROOT, path)} is missing; run the generator`); }
  if (Buffer.compare(Buffer.from(existing), Buffer.from(bytes)) !== 0) {
    throw new Error(`${relative(ROOT, path)} is out of date with engine/content; re-run the generator and commit it`);
  }
  console.log(`${relative(ROOT, path)} is current`);
}
