// The script as the runner sees it: one task list, in order, with recovery first and the two
// fallbacks last.
import { describe, expect, test } from 'vitest';
import script from './index';
import { pick, tutorialHarness } from './harness';
import { LIBRARY, librarySource, libraryById } from '../index';
import { TUTORIAL_REGION_IDS } from '../regions';

describe('the manifest', () => {
  test('is registered in the bundled library under its own id', () => {
    expect(libraryById('tutorial-island')).toBe(script);
    expect(LIBRARY.map(s => s.id)).toContain('tutorial-island');
  });

  test('runs before the three skilling loops in the panel order', () => {
    const order = LIBRARY.map(s => s.id);
    expect(order.indexOf('tutorial-island')).toBeLessThan(order.indexOf('chop-and-drop'));
  });

  test('has no fork source, because a fork of eight modules would not compile', () => {
    expect(librarySource('tutorial-island')).toBeNull();
    expect(librarySource('chop-and-drop')).not.toBeNull();
  });

  test('declares the island as its area requirement, and the designer as its one expected interface', () => {
    expect(script.requires).toEqual([{ kind: 'area', regionIds: [...TUTORIAL_REGION_IDS], text: 'Only runs on Tutorial Island' }]);
    expect(script.health).toEqual({
      onDeath: 'fail', noProgressMs: 120_000, expectInterfaces: [3559], maxRecoveryAttempts: 3
    });
  });

  test('every task name is unique, which defineScript would otherwise have refused', () => {
    const names = script.tasks.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThan(30);
  });
});

describe('the task order', () => {
  test('the six recovery tasks come first', () => {
    expect(script.tasks.slice(0, 6).map(t => t.name)).toEqual([
      'decline-tutorial-skip', 'design-character', 'dismiss-level-up', 'continue-dialog',
      'close-unexpected-modal', 'accept-expected-interface'
    ]);
  });

  test('the question that offers the skip is claimed a frame before its answers open', () => {
    // The answers alone are a frame too late: the guide asks, `getting-started` matches the
    // title, talks to him again, and the step wait runs out with the question still on screen.
    const h = tutorialHarness({
      world: {
        title: 'Getting started',
        interfaceTexts: { 4885: 'Do you want to skip the tutorial?', 4886: 'Click here to continue' }
      }
    });
    expect(pick(script.tasks, h.state(), h.ctx)?.name).toBe('decline-tutorial-skip');
  });

  test('the skip offer is answered before any step task can re-talk to the guide', () => {
    // The failure this pins, measured on the live stack: with the title still reading "Getting
    // started", `getting-started` matched first and talked to the guide again for as long as
    // the choice stood, and the run ended up in Lumbridge with none of the island played.
    const h = tutorialHarness({
      world: { title: 'Getting started', dialog: { isOpen: true, options: [{ text: 'Yes please.' }, { text: 'No, thank you.' }] } }
    });
    expect(pick(script.tasks, h.state(), h.ctx)?.name).toBe('decline-tutorial-skip');
  });

  test('the two fallbacks come last, so every named step wins over them', () => {
    expect(script.tasks.slice(-2).map(t => t.name)).toEqual(['choose-dialog-option', 'follow-the-arrow']);
  });

  test('a modal beats a step: the designer wins over the first titled step', () => {
    const h = tutorialHarness({ world: { title: 'Getting started', interfaceOpen: true, interfaceId: 3559 } });
    expect(pick(script.tasks, h.state(), h.ctx)?.name).toBe('design-character');
  });

  test('an instructor talking beats the titled step underneath, so the step is not clicked at through a dialog', () => {
    const h = tutorialHarness({ world: { title: 'Cut down a tree', dialog: { isOpen: true } } });
    expect(pick(script.tasks, h.state(), h.ctx)?.name).toBe('continue-dialog');
  });

  test('a titled step wins over the arrow fallback', () => {
    const h = tutorialHarness({
      world: { title: 'Mining.', hint: { kind: 'tile', tile: { x: 3080, z: 9500, height: 0 } }, locs: [{ name: 'Rocks', x: 3080, z: 9500 }] }
    });
    expect(pick(script.tasks, h.state(), h.ctx)?.name).toBe('mine-rocks');
  });

  test('nothing matches a snapshot with no title, no arrow, no tab and no dialog', () => {
    const h = tutorialHarness({ world: { title: 'A step from a future content bump' } });
    expect(pick(script.tasks, h.state(), h.ctx)).toBeUndefined();
  });
});

describe('until', () => {
  test('keeps running while the player is on the island', () => {
    const h = tutorialHarness({ world: { regionId: TUTORIAL_REGION_IDS[0], tutorialOpen: true } });
    expect(script.until?.(h.state(), h.ctx)).toBe(false);
  });

  test('stops once the player is off the island and the chatbox has gone', () => {
    // 12850 is Lumbridge: map square 50_50, packed the way `regionId` packs it ((50 << 8) | 50),
    // which is where Terrova's teleport lands.
    const h = tutorialHarness({ world: { regionId: 12850, tutorialOpen: false } });
    expect(script.until?.(h.state(), h.ctx)).toBe(true);
  });

  test('does not stop on the mainland while the tutorial chatbox is somehow still up', () => {
    const h = tutorialHarness({ world: { regionId: 12850, tutorialOpen: true } });
    expect(script.until?.(h.state(), h.ctx)).toBe(false);
  });

  test('does not stop inside the tutorial mine, which is a region of its own', () => {
    const h = tutorialHarness({ world: { regionId: TUTORIAL_REGION_IDS[0], tutorialOpen: false } });
    expect(script.until?.(h.state(), h.ctx)).toBe(false);
  });
});
