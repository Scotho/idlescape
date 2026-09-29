import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export interface TextFile { file: string; text: string }
export interface ContentFiles {
  obj: TextFile[]; npc: TextFile[]; loc: TextFile[]; inv: TextFile[]; varp: TextFile[]; param: TextFile[];
  dbtable: TextFile[]; dbrow: TextFile[]; rs2: TextFile[]; jm2: TextFile[];
  statEnum: string; unlocksEnum: string; constants: string[]; labels: string; free2play: string; multiway: string;
}

function walk(root: string, sub: string, ext: RegExp): TextFile[] {
  const out: TextFile[] = [];
  for (const rel of readdirSync(path.join(root, sub), { recursive: true }) as string[]) {
    if (!ext.test(rel)) continue;
    const file = `${sub}/${rel.replace(/\\/g, '/')}`;
    out.push({ file, text: readFileSync(path.join(root, file), 'utf8') });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

export function loadContent(root: string): ContentFiles {
  const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
  return {
    obj: walk(root, 'scripts', /\.obj$/), npc: walk(root, 'scripts', /\.npc$/), loc: walk(root, 'scripts', /\.loc$/), inv: walk(root, 'scripts', /\.inv$/),
    varp: walk(root, 'scripts', /\.varp$/), param: walk(root, 'scripts', /\.param$/), dbtable: walk(root, 'scripts', /\.dbtable$/), dbrow: walk(root, 'scripts', /\.dbrow$/),
    rs2: walk(root, 'scripts', /\.rs2$/), jm2: walk(root, 'maps', /\.jm2$/),
    statEnum: read('scripts/player/configs/stat.enum'), unlocksEnum: read('scripts/levelup/configs/levelup_unlocks.enum'),
    constants: walk(root, 'scripts', /\.constant$/).map(f => f.text),
    labels: read('maps/labels.txt'), free2play: read('maps/free2play.csv'), multiway: read('maps/multiway.csv')
  };
}
