// `[block]` + `key=value` config text (`.loc`, `.npc`) and the `id=debugname` pack indexes,
// both from the pinned engine content clone. Pure string-to-data (plan ruling R2).

export type ConfigBlock = Record<string, string[]>;

/** Every `[name]` block in one config file, in file order. Keys may repeat (`param`, `op1..5`). */
export function parseConfigText(text: string): Map<string, ConfigBlock> {
  const out = new Map<string, ConfigBlock>();
  let block: ConfigBlock | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('//')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      block = {};
      out.set(line.slice(1, -1), block);
      continue;
    }
    if (!block) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    (block[key] ??= []).push(value);
  }
  return out;
}

/** The first value for a key, or undefined. Most config keys appear at most once. */
export function first(block: ConfigBlock, key: string): string | undefined {
  return block[key]?.[0];
}

/** `op1..op5`, in order, skipping the `hidden` marker the content uses for a suppressed op. */
export function ops(block: ConfigBlock): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const value = first(block, `op${i}`);
    if (value && value !== 'hidden') out.push(value);
  }
  return out;
}

/** `engine/content/pack/*.pack`: one `<id>=<debugname>` per line. */
export function parsePack(text: string): Map<number, string> {
  const out = new Map<number, string>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    out.set(Number(line.slice(0, eq)), line.slice(eq + 1));
  }
  return out;
}
