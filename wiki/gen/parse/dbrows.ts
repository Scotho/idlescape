import { parseConfigText } from './configText';

export interface DbColumn { name: string; types: string[]; list: boolean }
export interface DbRow { table: string; key: string; file: string; values: Record<string, string[][]>; citations: string[] }

const FLAGS = new Set(['LIST', 'INDEXED', 'REQUIRED', 'CLIENTSIDE']);

export function parseDbTables(texts: { file: string; text: string }[]): Map<string, DbColumn[]> {
  const out = new Map<string, DbColumn[]>();
  for (const { file, text } of texts) for (const b of parseConfigText(text, file)) {
    const cols: DbColumn[] = [];
    for (const c of b.fields.get('column') ?? []) {
      const parts = c.split(',').map(s => s.trim());
      const name = parts.shift()!;
      cols.push({ name, types: parts.filter(p => !FLAGS.has(p)), list: parts.includes('LIST') });
    }
    out.set(b.key, cols);
  }
  return out;
}

export function parseDbRows(texts: { file: string; text: string }[], tables: Map<string, DbColumn[]>): DbRow[] {
  const rows: DbRow[] = [];
  for (const { file, text } of texts) for (const b of parseConfigText(text, file)) {
    const table = b.fields.get('table')?.[0];
    if (!table || !tables.has(table)) continue;
    const values: Record<string, string[][]> = {};
    for (const d of b.fields.get('data') ?? []) {
      const parts = d.split(',').map(s => s.trim());
      const col = parts.shift()!;
      (values[col] ??= []).push(parts);
    }
    rows.push({ table, key: b.key, file, values, citations: b.citations });
  }
  return rows;
}
