export function escapeCell(v: string): string {
  return v.replace(/[|*_[]/g, '\\$&');
}
export function infobox(rows: [string, string | number | boolean | null | undefined][]): string {
  const kept = rows.filter((r): r is [string, string | number | boolean] => r[1] !== null && r[1] !== undefined && r[1] !== '');
  const cell = (v: string | number | boolean) => typeof v === 'boolean' ? (v ? 'Yes' : 'No') : escapeCell(String(v));
  return ['| | |', '|---|---|', ...kept.map(([k, v]) => `| **${k}** | ${cell(v)} |`)].join('\n');
}
export function fmtCoord(c: { x: number; z: number; level: number }): string { return `(${c.x}, ${c.z}, ${c.level})`; }
export function fmtRate(num: number, den: number): string {
  if (den === 0) return 'unknown';
  if (num >= den) return 'Always';
  const g = gcd(num, den);
  return `${num / g}/${den / g} (${((num / den) * 100).toFixed(num / den < 0.01 ? 2 : 1)}%)`;
}
function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }
export function fmtXp(x: number): string { return `${x % 1 === 0 ? x : x.toFixed(1)} xp`; }
