export function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/&/g, ' and ').replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function dedupeSlugs<T extends { id: number; slug: string }>(rows: T[]): void {
  const byId = [...rows].sort((a, b) => a.id - b.id);
  // Precompute every original slug up front: an unrelated entity can already occupy the exact
  // "-N" form a later duplicate would naively generate (e.g. a literal key like "coins_2" slugifies
  // to "coins-2", which collides with the second of several entities named "Coins"). Tracking a
  // single `taken` set across the whole run lets us skip past any such collision instead of
  // producing two rows with the same (type, slug) and failing the entities table's primary key.
  const taken = new Set(byId.map(r => r.slug));
  const counts = new Map<string, number>();
  for (const r of byId) {
    const base = r.slug;
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    if (count === 1) continue;
    let n = count;
    let candidate = `${base}-${n}`;
    while (taken.has(candidate)) { n++; candidate = `${base}-${n}`; }
    taken.add(candidate);
    r.slug = candidate;
  }
}

export function aliasesFor(key: string, name: string): string[] {
  const spaced = key.replace(/_/g, ' ').toLowerCase();
  return spaced === name.toLowerCase() ? [spaced] : [spaced, name.toLowerCase()];
}