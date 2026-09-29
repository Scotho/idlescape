import { describe, expect, test } from 'bun:test';
import { renderAll } from './index';
import { parseOverlay } from './overlay';
import { data } from './fixture';

describe('renderAll', () => {
  test('a standalone overlay colliding with a generated page is rejected as duplicate-page', () => {
    const ov = parseOverlay('---\ntype: item\nslug: bronze-axe\ntitle: Bronze axe\nlead: A colliding standalone page.\n---\n', 'f.md');
    const { pages, problems } = renderAll(data, [ov]);
    expect(problems.filter(p => p.rule === 'duplicate-page')).toEqual([expect.objectContaining({ rule: 'duplicate-page', level: 'error', page: 'item/bronze-axe' })]);
    expect(pages.filter(p => p.type === 'item' && p.slug === 'bronze-axe').length).toBe(1);
  });
  test('an overlay whose type:key matches no entity is reported as orphan-overlay, not dropped silently', () => {
    const ov = parseOverlay('---\ntype: item\nkey: does_not_exist\n---\n## Trivia\n\nNothing.\n', 'content/items/ghost.md');
    const { problems } = renderAll(data, [ov]);
    expect(problems).toContainEqual(expect.objectContaining({ rule: 'orphan-overlay', level: 'error', message: expect.stringContaining('content/items/ghost.md') }));
  });
  test('an overlay that does match an entity is not reported as an orphan', () => {
    const ov = parseOverlay('---\ntype: item\nkey: bronze_axe\n---\n## Trivia\n\nNothing.\n', 'content/items/axe.md');
    expect(renderAll(data, [ov]).problems.filter(p => p.rule === 'orphan-overlay')).toEqual([]);
  });
});
