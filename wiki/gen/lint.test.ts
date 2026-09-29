import { describe, expect, test } from 'bun:test';
import { lintPages } from './lint';
import { assemble, type Draft } from './render/page';

const manifest = { revision: 274, contentSha: 'c', engineSha: 'e', generatedAt: '2026', counts: {} };
const ok: Draft = { type: 'item', slug: 'a', title: 'A', lead: 'The **A** is an item.', infobox: [], sources: [],
  sections: [{ heading: 'Uses', body: 'Used for things.', meta: { confidence: 'verified', sources: [{ kind: 'content', ref: 'x' }] }, required: true }, { heading: 'Item sources', body: 'None known.', meta: { confidence: 'verified', sources: [{ kind: 'content', ref: 'x' }] }, required: true }] };

describe('lintPages', () => {
  test('a well-formed page has no problems', () => {
    expect(lintPages([assemble(ok, manifest)], [ok], [])).toEqual([]);
  });
  test('lead must bold the title', () => {
    const d = { ...ok, lead: 'A is an item.' };
    expect(lintPages([assemble(d, manifest)], [d], []).map(p => p.rule)).toContain('lead-bold');
  });
  test('sections need sources; second person flagged outside guides and walkthroughs', () => {
    const d: Draft = { ...ok, sections: [{ heading: 'Uses', body: 'You can use it.', meta: { confidence: 'editorial', sources: [] }, required: true }, ok.sections[1]!] };
    const rules = lintPages([assemble(d, manifest)], [d], []).map(p => p.rule);
    expect(rules).toContain('section-sources');
    expect(rules).toContain('second-person');
    const g: Draft = { ...d, type: 'guide' };
    expect(lintPages([assemble(g, manifest)], [g], []).map(p => p.rule)).not.toContain('second-person');
  });
  test('unresolved wikilinks and denylist sentences fail', () => {
    const d: Draft = { ...ok, sections: [{ ...ok.sections[0]!, body: 'See [[Nothing Here]] for the copied sentence that must never appear in this corpus at all.' }, ok.sections[1]!] };
    const rules = lintPages([assemble(d, manifest)], [d], ['the copied sentence that must never appear in this corpus at all']).map(p => p.rule);
    expect(rules).toContain('unresolved-links');
    expect(rules).toContain('denylist');
  });
  test('a stored lead that still holds wikilink syntax is an unresolved-links error', () => {
    const page = assemble(ok, manifest);
    const raw = { ...page, lead: 'The **A** is dropped by [[npc/goblin|Goblin]].' };
    expect(lintPages([raw], [ok], []).map(p => p.rule)).toContain('unresolved-links');
  });
  test('required stubs are warnings, not errors', () => {
    const d: Draft = { ...ok, sections: [{ ...ok.sections[0]!, body: '' }, ok.sections[1]!] };
    const p = lintPages([assemble(d, manifest)], [d], []).find(x => x.rule === 'required-sections')!;
    expect(p.level).toBe('warn');
  });
  test('infobox wikilinks survive assembly and are not flagged; a backslash-escaped [[ is caught', () => {
    const d: Draft = { ...ok, infobox: [['Start point', 'Talk to [[npc/goblin|Goblin]]']] };
    const page = assemble(d, manifest);
    expect(page.markdown).toContain('Talk to [Goblin](/wiki/npc/goblin)');
    expect(lintPages([page], [d], []).map(p => p.rule)).not.toContain('unresolved-links');
    const corrupted = { ...page, markdown: page.markdown.replace('[Goblin](/wiki/npc/goblin)', '\\[\\[npc/goblin\\|Goblin]]') };
    expect(lintPages([corrupted], [d], []).map(p => p.rule)).toContain('unresolved-links');
  });
});
