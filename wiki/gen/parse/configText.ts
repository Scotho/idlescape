export interface ConfigBlock { key: string; file: string; line: number; fields: Map<string, string[]>; citations: string[] }

const URL_RE = /https?:\/\/[^\s)"']+/g;

export function parseConfigText(text: string, file: string): ConfigBlock[] {
  const blocks: ConfigBlock[] = [];
  let cur: ConfigBlock | null = null;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    const header = /^\[([^\]]+)\]\s*$/.exec(trimmed);
    if (header) {
      cur = { key: header[1]!, file, line: i + 1, fields: new Map(), citations: [] };
      blocks.push(cur);
      continue;
    }
    if (!cur) continue;
    const commentAt = raw.indexOf('//');
    const code = commentAt >= 0 ? raw.slice(0, commentAt) : raw;
    const comment = commentAt >= 0 ? raw.slice(commentAt) : '';
    for (const url of comment.match(URL_RE) ?? []) cur.citations.push(url);
    const eq = code.indexOf('=');
    if (eq <= 0) continue;
    const k = code.slice(0, eq).trim();
    const v = code.slice(eq + 1).trim();
    const list = cur.fields.get(k);
    if (list) list.push(v); else cur.fields.set(k, [v]);
  }
  return blocks;
}

export function first(b: ConfigBlock, key: string): string | null {
  return b.fields.get(key)?.[0] ?? null;
}
export function paramsOf(b: ConfigBlock): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of b.fields.get('param') ?? []) {
    const c = p.indexOf(',');
    if (c > 0) out[p.slice(0, c)] = p.slice(c + 1);
  }
  return out;
}
