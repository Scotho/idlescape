import { describe, expect, test } from 'bun:test';
import { applyOverlay, parseOverlay } from './overlay';
import type { Draft } from './page';

const OVERLAY = `---
type: quest
key: quest_cook
infobox:
  Length: Very short
  Difficulty: Novice
sources:
  Length: editorial:cs:2026-09-05
---
## Walkthrough

1. Talk to the [[Goblin]] in the castle kitchen. <!-- src: content:scripts/quests/quest_cook -->
2. Bring the three items back.

## Trivia

The quest is the first most players finish. <!-- src: editorial:cs:2026-09-05 -->
`;

const draft: Draft = { type: 'quest', slug: 'cooks-assistant', title: "Cook's Assistant", lead: '**x**', infobox: [['Members', 'No']],
  sections: [{ heading: 'Walkthrough', body: 'generated', meta: { confidence: 'derived', sources: [{ kind: 'derived', ref: 'd' }] }, required: true }, { heading: 'Rewards', body: 'r', meta: { confidence: 'verified', sources: [{ kind: 'content', ref: 'c' }] }, required: true }, { heading: 'Trivia', body: '', meta: { confidence: 'verified', sources: [] } }],
  sources: [] };

describe('overlay', () => {
  const ov = parseOverlay(OVERLAY, 'content/quests/cooks-assistant.md');
  test('frontmatter and sections parse; inline src comments become section sources', () => {
    expect(ov.type).toBe('quest'); expect(ov.key).toBe('quest_cook');
    expect(ov.infobox).toEqual({ Length: 'Very short', Difficulty: 'Novice' });
    expect(ov.sections.map(s => s.heading)).toEqual(['Walkthrough', 'Trivia']);
    expect(ov.sections[0]!.sources).toEqual(['content:scripts/quests/quest_cook']);
  });
  test('sections replace by heading, extras appended, infobox rows added with a source, unsourced row is a problem', () => {
    const { draft: d, problems } = applyOverlay(draft, ov, new Map([['goblin', { type: 'npc', slug: 'goblin' }]]));
    expect(d.sections.find(s => s.heading === 'Walkthrough')!.body).toContain('[[npc/goblin|Goblin]]');
    expect(d.sections.find(s => s.heading === 'Walkthrough')!.meta.sources).toContainEqual({ kind: 'content', ref: 'scripts/quests/quest_cook' });
    expect(d.sections.find(s => s.heading === 'Rewards')!.body).toBe('r');
    expect(d.sections.find(s => s.heading === 'Trivia')!.meta.confidence).toBe('editorial');
    expect(d.infobox).toContainEqual(['Length', 'Very short']);
    expect(problems).toContainEqual(expect.objectContaining({ rule: 'overlay-source', message: expect.stringContaining('Difficulty') }));
  });
  test('an infobox override that disagrees with generated data needs disputes', () => {
    const ov2 = parseOverlay('---\ntype: quest\nkey: quest_cook\ninfobox:\n  Members: Yes\nsources:\n  Members: modern:https://oldschool.runescape.wiki/w/Cook%27s_Assistant\n---\n', 'f.md');
    expect(applyOverlay(draft, ov2, new Map()).problems).toContainEqual(expect.objectContaining({ rule: 'overlay-dispute' }));
    const ov3 = parseOverlay('---\ntype: quest\nkey: quest_cook\ndisputes: content\ninfobox:\n  Members: Yes\nsources:\n  Members: period:https://web.archive.org/x\n---\n', 'f.md');
    expect(applyOverlay(draft, ov3, new Map()).problems.filter(p => p.rule === 'overlay-dispute')).toEqual([]);
  });
  test('a new section with no Trivia present is appended at the end, not spliced before the last section', () => {
    const shopDraft: Draft = { type: 'shop', slug: 'general-store', title: 'General Store', lead: '**x**', infobox: [],
      sections: [{ heading: 'Stock', body: 'stock', meta: { confidence: 'verified', sources: [{ kind: 'content', ref: 'c' }] }, required: true }, { heading: 'Location', body: 'loc', meta: { confidence: 'verified', sources: [{ kind: 'content', ref: 'c' }] } }],
      sources: [] };
    const ov = parseOverlay('---\ntype: shop\nkey: shop\n---\n## Trivia\n\nA fun fact. <!-- src: editorial:cs:2026-09-05 -->\n', 'f.md');
    const { draft: d } = applyOverlay(shopDraft, ov, new Map());
    expect(d.sections.map(s => s.heading)).toEqual(['Stock', 'Location', 'Trivia']);
  });
  test('a heading matches case-insensitively and replaces rather than duplicates', () => {
    const ov = parseOverlay('---\ntype: quest\nkey: quest_cook\n---\n## walkthrough\n\nOverlay walkthrough text. <!-- src: editorial:cs:2026-09-05 -->\n', 'f.md');
    const { draft: d } = applyOverlay(draft, ov, new Map());
    const walkthroughs = d.sections.filter(s => s.heading.toLowerCase() === 'walkthrough');
    expect(walkthroughs.length).toBe(1);
    expect(walkthroughs[0]!.heading).toBe('Walkthrough');
    expect(walkthroughs[0]!.body).toBe('Overlay walkthrough text.');
  });
});
