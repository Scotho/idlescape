import { describe, expect, test } from 'bun:test';
import { collectWorldExtras, TUTORIAL_TEXT } from './worldExtras';

function bridge(over: Partial<Parameters<typeof collectWorldExtras>[0]> = {}) {
  return {
    hint: () => ({ type: 0, npc: 0, player: 0, tileX: 0, tileZ: 0, height: 0 }),
    flashIcon: () => -1,
    tutorialRoot: () => -1,
    componentText: (_id: number) => null as string | null,
    modalComponentIds: () => [] as number[],
    position: () => ({ x: 3094, z: 3107, level: 0 }),
    ...over
  };
}

describe('collectWorldExtras', () => {
  test('no hint, no tutorial box', () => {
    const e = collectWorldExtras(bridge());
    expect(e.hint).toEqual({ kind: 'none' });
    expect(e.tutorial).toEqual({ open: false, title: '', lines: [] });
    expect(e.flashingTab).toBeNull();
    expect(e.regionId).toBe((3094 >> 6) << 8 | (3107 >> 6));
    expect(e.zone).toEqual({ x: 3094 >> 3, z: 3107 >> 3 });
  });
  test('npc hint and a flashing inventory tab', () => {
    const e = collectWorldExtras(bridge({ hint: () => ({ type: 1, npc: 42, player: 0, tileX: 0, tileZ: 0, height: 0 }), flashIcon: () => 3 }));
    expect(e.hint).toEqual({ kind: 'npc', npcIndex: 42 });
    expect(e.flashingTab).toBe(3);
  });
  test('tile hint carries absolute tile and height', () => {
    const e = collectWorldExtras(bridge({ hint: () => ({ type: 2, npc: 0, player: 0, tileX: 3100, tileZ: 3110, height: 128 }) }));
    expect(e.hint).toEqual({ kind: 'tile', tile: { x: 3100, z: 3110, height: 128 } });
  });
  test('tutorial title and lines come from the tutorial_text components, colour codes stripped', () => {
    const texts: Record<number, string> = { [TUTORIAL_TEXT.title]: '@yel@Cut down a tree', [TUTORIAL_TEXT.line1]: 'Use this to get some logs', [TUTORIAL_TEXT.line2]: '' };
    // 274 opens the box with TUT_OPEN, which stores the root in tutComId; the box is not a
    // chat/main modal, so modalComponentIds() stays empty while it is on screen.
    const e = collectWorldExtras(bridge({ componentText: id => texts[id] ?? null, tutorialRoot: () => TUTORIAL_TEXT.root }));
    expect(e.tutorial).toEqual({ open: true, title: 'Cut down a tree', lines: ['Use this to get some logs'] });
    expect(e.interfaceTexts[TUTORIAL_TEXT.title]).toBe('Cut down a tree');
  });
  test('a closed tutorial box stays closed even though IF_SETTEXT never clears the old text', () => {
    // TUT_OPEN(-1) closes the box but leaves IfType.list[...].text as the last step wrote it.
    const texts: Record<number, string> = { [TUTORIAL_TEXT.title]: 'Cut down a tree', [TUTORIAL_TEXT.line1]: 'Use this to get some logs' };
    const e = collectWorldExtras(bridge({ componentText: id => texts[id] ?? null, tutorialRoot: () => -1 }));
    expect(e.tutorial).toEqual({ open: false, title: '', lines: [] });
    expect(e.interfaceTexts[TUTORIAL_TEXT.title]).toBeUndefined();
  });
});
