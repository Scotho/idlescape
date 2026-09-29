import { describe, expect, test } from 'bun:test';
import { renderAll } from './index';
import { parseOverlay } from './overlay';
import { data } from './fixture';

const tick = parseOverlay(`---
type: mechanic
slug: game-tick
title: Game tick
lead: The **Game tick** is the 600 millisecond cycle the server runs on.
sources:
  lead: engine:src/engine/World.ts#tick
---
## Details

Every action resolves on a tick boundary. <!-- src: engine:src/engine/World.ts#tick -->
`, 'content/mechanics/game-tick.md');
const quest = parseOverlay(`---
type: item
key: bronze_axe
---
## Trivia

Chopping takes several [[Game tick]]s per swing. <!-- src: engine:src/engine/World.ts#tick -->
`, 'content/items/bronze-axe.md');

describe('standalone pages', () => {
  test('render as pages and are linkable by title from other overlays', () => {
    const { pages, problems } = renderAll(data, [tick, quest]);
    expect(problems.filter(p => p.level === 'error')).toEqual([]);
    expect(pages.find(p => p.type === 'mechanic' && p.slug === 'game-tick')!.markdown).toContain('# Game tick');
    expect(pages.find(p => p.slug === 'bronze-axe')!.markdown).toContain('[Game tick](/wiki/mechanic/game-tick)');
  });
});
