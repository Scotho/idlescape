import { describe, expect, test } from 'bun:test';
import { assemble, confidenceOf, stub, type Draft } from './page';
import { wl } from './links';

const manifest = { revision: 225, contentSha: 'abcdef1234567890', engineSha: 'e1dea19f', generatedAt: '2026-09-05T00:00:00Z', counts: {} };

describe('assemble', () => {
  const draft: Draft = {
    type: 'item', slug: 'worm', title: 'Worm', lead: `The **Worm** is a members item found near the ${wl('area', 'tree-gnome-stronghold', 'Tree Gnome Stronghold')}.`,
    infobox: [['Members', 'Yes'], ['Examine', "Ugh! It's wriggling!"]],
    sections: [
      { heading: 'Uses', body: '', meta: { confidence: 'verified', sources: [{ kind: 'content', ref: 'content:a.obj#worm' }] }, required: true },
      { heading: 'Item sources', body: `Dropped by ${wl('npc', 'goblin', 'Goblin')}.`, meta: { confidence: 'derived', sources: [{ kind: 'content', ref: 'content:a.obj#worm' }, { kind: 'derived', ref: 'derived:drops.ts:main' }] }, required: true }
    ],
    sources: [{ kind: 'content', ref: 'content:a.obj#worm' }]
  };
  const page = assemble(draft, manifest);
  test('title, infobox, lead, sections in order, stub for empty required section', () => {
    expect(page.markdown.startsWith('# Worm\n')).toBe(true);
    expect(page.markdown).toContain('| **Members** | Yes |');
    expect(page.markdown.indexOf('The **Worm**')).toBeLessThan(page.markdown.indexOf('## Uses'));
    expect(page.markdown).toContain(`## Uses\n\n${stub('Uses')}`);
    expect(page.markdown.indexOf('## Uses')).toBeLessThan(page.markdown.indexOf('## Item sources'));
  });
  test('wikilinks become site links and are recorded', () => {
    expect(page.markdown).toContain('[Goblin](/wiki/npc/goblin)');
    expect(page.links).toContainEqual({ toType: 'npc', toSlug: 'goblin', relation: 'mentions' });
    expect(page.html).toContain('href="/wiki/npc/goblin"');
  });
  test('the stored lead is finalized, not raw wikilink syntax, and its links are recorded', () => {
    const withLink: Draft = { ...draft, lead: `The **Worm** is dropped by ${wl('npc', 'goblin', 'Goblin')}.` };
    const p = assemble(withLink, manifest);
    expect(p.lead).toContain('[Goblin](/wiki/npc/goblin)');
    expect(p.lead).not.toContain('[[');
    expect(p.links).toContainEqual({ toType: 'npc', toSlug: 'goblin', relation: 'mentions' });
  });
  test('sources footer numbered and grouped by section; build footer present', () => {
    expect(page.markdown).toContain('## Sources');
    expect(page.markdown).toContain('content:a.obj#worm');
    expect(page.markdown).toContain('## Build\n\nRevision 225');
    expect(page.markdown).toContain('abcdef12');
  });
  test('section meta kept and confidence derives from the weakest source', () => {
    expect(page.sections['Item sources']!.confidence).toBe('derived');
    expect(confidenceOf([{ kind: 'content', ref: 'x' }, { kind: 'modern', ref: 'y' }])).toBe('modern');
    expect(confidenceOf([])).toBe('editorial');
  });
  test('infobox cell escaping round-trips markdown-significant characters', () => {
    const escaped: Draft = { ...draft, infobox: [...draft.infobox, ['Weird', 'A*B_C|D']] };
    const p = assemble(escaped, manifest);
    expect(p.markdown).toContain('| **Weird** | A\\*B\\_C\\|D |');
  });
});
