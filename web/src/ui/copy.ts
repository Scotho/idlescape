// web/src/ui/copy.ts -- UI copy quoted verbatim from the shell v2 mock.
//
// Plan ruling R1: the sprint constraint forbids em dashes in NEW prose; these strings are design
// literals, copied from docs/design/idlescape-shell-v2/Idlescape Shell v2.dc.html, which the
// authority order puts above every other document for literals. They live here, together, so a
// reversal of that ruling is one file and one commit rather than a hunt through eleven surfaces.
// Every consumer imports from here; no surface inlines one of these strings.

export const BAR_UNPAIRED = 'not paired — Claude can play this character alongside you';
export const BAR_PAUSED = 'paused — you took control';
export const LOOT_EMPTY_COPY = 'Items you pick up appear here as you play — or as Claude plays for you.';
export const EVENTS_EMPTY_COPY = 'Loosen the filters — or go make something happen.';
export const EVENT_PAUSED_MOUSE = 'Paused — you moved the mouse';
export const EVENT_GATEWAY_OK = 'Gateway connected — ws ok';
export const BANK_FOOTER_NOTE = 'view & reorder only — items move in game';
export const CANVAS_CAPTION_NOTE = '(same-origin iframe — never restyled)';

/** The run card's paused status line. */
export const pausedResumes = (seconds: number): string =>
  `You took control — resumes in ${seconds}s. Esc pauses again any time.`;
/** An Events row for a run that failed with a reason. */
export const runFailed = (script: string, reason: string): string => `${script} failed — ${reason}`;
/** The trace window footer. `.dc.html:134`: middot separator, em dash inside the clause. */
export const tracePoppedOut = (count: number): string => `${count} events · popped out — the panel stays free`;
/**
 * An Events row for a bank version bump. The mock writes `Bank updated — 27 / 240 slots used`
 * with fixed numbers; the producer (Task 11) formats the same sentence with real ones, so the
 * sentence lives here as a template and never as a const with the mock's 27 in it.
 */
export const bankUpdated = (used: number, total: number): string =>
  `Bank updated — ${used} / ${total} slots used`;

/** Every plain-string export above, for copy.test.ts. Keep in declaration order. */
export const EM_DASH_COPY: readonly string[] = [
  BAR_UNPAIRED, BAR_PAUSED, LOOT_EMPTY_COPY, EVENTS_EMPTY_COPY, EVENT_PAUSED_MOUSE,
  EVENT_GATEWAY_OK, BANK_FOOTER_NOTE, CANVAS_CAPTION_NOTE
];
