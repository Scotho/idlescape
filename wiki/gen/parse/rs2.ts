export interface ScriptBlock { trigger: string; subject: string; params: string; body: string; file: string; line: number; citations: string[] }

const HEADER = /^\[([a-z_0-9]+),([^\]]+)\](.*)$/;
const URL_RE = /https?:\/\/[^\s)"']+/g;

export function parseRs2(text: string, file: string): ScriptBlock[] {
  const blocks: ScriptBlock[] = [];
  const lines = text.split(/\r?\n/);
  let cur: ScriptBlock | null = null;
  let body: string[] = [];
  const flush = () => { if (cur) { cur.body = body.join('\n'); blocks.push(cur); } body = []; };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const h = HEADER.exec(line);
    if (h) {
      flush();
      cur = { trigger: h[1]!, subject: h[2]!.trim(), params: h[3]!.trim(), body: '', file, line: i + 1, citations: [] };
      continue;
    }
    if (!cur) continue;
    body.push(line);
    const c = line.indexOf('//');
    if (c >= 0) for (const url of line.slice(c).match(URL_RE) ?? []) cur.citations.push(url);
  }
  flush();
  return blocks;
}

/** Blocks whose subject is `subject`, including comma-separated multi-subject headers like `[ai_queue3,a,b]`. */
export function blocksFor(blocks: ScriptBlock[], subject: string): ScriptBlock[] {
  return blocks.filter(b => b.subject === subject || b.subject.split(',').map(s => s.trim()).includes(subject));
}
