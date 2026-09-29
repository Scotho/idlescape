// Builds web/src/data/collision.bin and web/src/data/doors.json from the pinned content clone
// (spec section 3.3). Same shape as scripts/gen/atlas.ts:
//
//   bun scripts/gen/collision.ts            # write
//   bun scripts/gen/collision.ts --check    # fail if the committed files are stale
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseConfigText, parsePack } from '../../web/src/data/gen/configs';
import { parseJm2, squareCoords } from '../../web/src/data/gen/jm2';
import { buildSquare, locInfoOf, type DoorRow, type LocInfo } from '../../web/src/data/gen/collisionBuild';
import { encodeCollision, type EncodedSquare } from '../../web/src/data/gen/collisionFile';
import { CONTENT, contentSha, DATA, enforceBudget, filesUnder, writeOrCheck } from './lib/io';

const check = process.argv.includes('--check');

const configFiles = filesUnder(join(CONTENT, 'scripts'), /\.loc$/);
const mapFiles = filesUnder(join(CONTENT, 'maps'), /\.jm2$/);
const locPackFile = join(CONTENT, 'pack', 'loc.pack');
const modelPackFile = join(CONTENT, 'pack', 'model.pack');

const modelNames = new Set(parsePack(readFileSync(modelPackFile, 'utf8')).values());
const byName = new Map<string, LocInfo>();
for (const file of configFiles) {
  for (const [name, block] of parseConfigText(readFileSync(file, 'utf8'))) byName.set(name, locInfoOf(block, modelNames));
}
const locs = new Map<number, LocInfo>();
for (const [id, name] of parsePack(readFileSync(locPackFile, 'utf8'))) {
  const info = byName.get(name);
  if (info) locs.set(id, info);
}

const squares: EncodedSquare[] = [];
const doors: DoorRow[] = [];
for (const file of mapFiles) {
  const coords = squareCoords(basename(file));
  if (!coords) continue;
  const parsed = parseJm2(readFileSync(file, 'utf8'), coords.mx, coords.mz);
  const built = buildSquare(parsed, locs);
  squares.push({ mx: coords.mx, mz: coords.mz, levels: built.levels });
  for (const door of built.doors) {
    doors.push({ ...door, x: (coords.mx << 6) + door.x, z: (coords.mz << 6) + door.z });
  }
}

const bin = encodeCollision(squares);
console.log(`${locs.size} loc configs, ${squares.length} squares, ${doors.length} doors`);
enforceBudget('collision.bin', bin, { rawBytes: 1024 * 1024, gzipBytes: 400 * 1024 });
writeOrCheck(join(DATA, 'collision.bin'), bin, check);

const doorsJson = new TextEncoder().encode(JSON.stringify({
  version: 1,
  source: { contentSha: contentSha([...configFiles, ...mapFiles, locPackFile, modelPackFile]) },
  // Sorted so the committed bytes do not move with the directory read order.
  doors: doors.sort((a, b) => a.level - b.level || a.x - b.x || a.z - b.z)
}));
enforceBudget('doors.json', doorsJson, { rawBytes: 512 * 1024, gzipBytes: 128 * 1024 });
writeOrCheck(join(DATA, 'doors.json'), doorsJson, check);
