import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildDb } from '../../../wiki/gen/db';
import { renderAll } from '../../../wiki/gen/render';
import { data } from '../../../wiki/gen/render/fixture';

export function makeTestDb(): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'cs-wiki-')), 'wiki.db');
  buildDb(file, data, renderAll(data, []).pages);
  return file;
}
