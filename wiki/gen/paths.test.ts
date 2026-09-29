import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { contentHeadSha } from './paths';

function fakeContentDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'wiki-content-'));
  mkdirSync(path.join(dir, '.git'), { recursive: true });
  return dir;
}

describe('contentHeadSha', () => {
  test('reads a detached HEAD (raw sha) directly', () => {
    const dir = fakeContentDir();
    writeFileSync(path.join(dir, '.git', 'HEAD'), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n');
    expect(contentHeadSha(dir)).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  test('resolves a symbolic HEAD through the loose ref file', () => {
    const dir = fakeContentDir();
    writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/274\n');
    mkdirSync(path.join(dir, '.git', 'refs', 'heads'), { recursive: true });
    writeFileSync(path.join(dir, '.git', 'refs', 'heads', '274'), 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n');
    expect(contentHeadSha(dir)).toBe('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  });

  test('falls back to packed-refs when there is no loose ref file', () => {
    const dir = fakeContentDir();
    writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/274\n');
    writeFileSync(path.join(dir, '.git', 'packed-refs'), '# pack-refs with: peeled fully-peeled sorted\ncccccccccccccccccccccccccccccccccccccccc refs/heads/274\n');
    expect(contentHeadSha(dir)).toBe('cccccccccccccccccccccccccccccccccccccccc');
  });
});
