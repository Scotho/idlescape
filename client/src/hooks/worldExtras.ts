// client/src/hooks/worldExtras.ts — idlescape additions on top of the vendored collector.
//
// The vendored rs-sdk `BotStateCollector` publishes the bot-facing world, but not
// the tutorial-island affordances the shell needs: the hint arrow, the tutorial
// text box, the flashing sidebar tab, and the region id. Those are read here
// through a narrow bridge (`ClientExtrasBridge`) so this file stays testable
// without a `Client`, and so `Client`'s private fields stay private.
export const TUTORIAL_TEXT = { root: 6179, title: 6180, line1: 6181, line2: 6182, line3: 6183, line4: 6184 } as const;
export const CHAR_DESIGN_INTERFACE = 3559;

export interface HintRaw { type: number; npc: number; player: number; tileX: number; tileZ: number; height: number }
export interface ClientExtrasBridge {
  hint(): HintRaw;
  flashIcon(): number;                         // tutFlashIcon, -1 when none
  tutorialRoot(): number;                      // tutComId, -1 when the tutorial box is closed
  componentText(id: number): string | null;    // IfType.list[id]?.text
  modalComponentIds(): number[];               // ids whose text is worth publishing: open chat modal + main modal roots and their children
  position(): { x: number; z: number; level: number };
}

export type Hint =
  | { kind: 'none' }
  | { kind: 'npc'; npcIndex: number }
  | { kind: 'player'; playerIndex: number }
  | { kind: 'tile'; tile: { x: number; z: number; height: number } };

export interface WorldExtras {
  hint: Hint;
  tutorial: { open: boolean; title: string; lines: string[] };
  flashingTab: number | null;
  interfaceTexts: Record<number, string>;
  regionId: number;
  /** Absolute tile >> 3 — the map zone the player stands in. */
  zone: { x: number; z: number };
}

const strip = (s: string | null): string => (s ?? '').replace(/@\w{3}@/g, '').replace(/\s+/g, ' ').trim();

export function collectWorldExtras(b: ClientExtrasBridge): WorldExtras {
  const h = b.hint();
  const hint: Hint = h.type === 1 ? { kind: 'npc', npcIndex: h.npc }
    : h.type === 10 ? { kind: 'player', playerIndex: h.player }
    : h.type >= 2 && h.type <= 6 ? { kind: 'tile', tile: { x: h.tileX, z: h.tileZ, height: h.height } }
    : { kind: 'none' };
  // 274 opens the tutorial box with its own packet (TUT_OPEN -> tutComId); it is not a
  // chat/main modal. Deriving `open` from the text instead would latch on forever, because
  // IF_SETTEXT never clears a component's text once the tutorial has written to it.
  const open = b.tutorialRoot() !== -1;
  const title = open ? strip(b.componentText(TUTORIAL_TEXT.title)) : '';
  const lines = open
    ? [TUTORIAL_TEXT.line1, TUTORIAL_TEXT.line2, TUTORIAL_TEXT.line3, TUTORIAL_TEXT.line4].map(id => strip(b.componentText(id))).filter(Boolean)
    : [];
  const interfaceTexts: Record<number, string> = {};
  // Same staleness rule: publish the tutorial components' text only while the box is open.
  for (const id of [...b.modalComponentIds(), ...(open ? Object.values(TUTORIAL_TEXT) : [])]) {
    const t = strip(b.componentText(id));
    if (t) interfaceTexts[id] = t;
  }
  const flash = b.flashIcon();
  const p = b.position();
  return {
    hint,
    tutorial: { open, title, lines },
    flashingTab: flash >= 0 ? flash : null,
    interfaceTexts,
    regionId: ((p.x >> 6) << 8) | (p.z >> 6),
    zone: { x: p.x >> 3, z: p.z >> 3 }
  };
}
