// web/src/frame/events.ts -- the cross-character event feed the Events panel reads.
//
// It sits in the frame, above SP7's session manager, because it is cross-character and no
// per-character iframe session can see the others. It is session-scoped and NOT persisted: the
// panel's own footer says "this session", and not persisting removes every migration and quota
// question (companion spec G1, plan ruling C5). Capped, append-only, one emit() entry point.
export type ShellEventType = 'xp' | 'loot' | 'level' | 'run' | 'claude' | 'bank';
export type ShellEventTone = 'default' | 'fail';

/**
 * Four of these fields are a cross-sprint contract and none of them may be narrowed away: sprint
 * 3's Sound entry reads this feed to decide what to play, and the board records its requirement on
 * this entry as "the event feed's event shape carries kind, character, time and a one-line label".
 * They are `type`, `characterId` with `characterName`, `at` and `text`. `tone`, `skill`, `amount`
 * and `seq` carry no such promise.
 */
export interface ShellEvent {
  readonly seq: number;
  readonly at: number;
  /** null for an account-scoped event: the bank, and the gateway's own health. */
  readonly characterId: string | null;
  readonly characterName: string | null;
  readonly type: ShellEventType;
  /** A SKILL_NAMES display name. The skill filter is a separate axis from the type. */
  readonly skill: string | null;
  readonly text: string;
  /** `fail` is a run that ended badly: a red rail and amber text, not a red type. */
  readonly tone: ShellEventTone;
  /** The numeric payload the canvas xp drop reads (Task 13): xp gained, items added, or null. */
  readonly amount: number | null;
}

export interface EventBus {
  emit(e: Omit<ShellEvent, 'seq' | 'at'> & { at?: number }): void;
  all(): readonly ShellEvent[];
  subscribe(fn: (e: ShellEvent) => void): () => void;
  dispose(): void;
}

export const EVENT_CAP = 500;

export function createEventBus(opts: { now?(): number; cap?: number } = {}): EventBus {
  const now = opts.now ?? (() => Date.now());
  const cap = opts.cap ?? EVENT_CAP;
  const log: ShellEvent[] = [];
  const subs = new Set<(e: ShellEvent) => void>();
  let seq = 0;
  let disposed = false;

  return {
    emit(e) {
      if (disposed) return;
      const record: ShellEvent = { ...e, seq: ++seq, at: e.at ?? now() };
      log.push(record);
      if (log.length > cap) log.splice(0, log.length - cap);
      for (const fn of [...subs]) {
        // One consumer throwing must not stop the feed: the panel is a consumer and so is the
        // canvas drop, and neither owns the other.
        try { fn(record); } catch { /* a consumer's problem, not the bus's */ }
      }
    },
    all: () => log,
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    dispose() { disposed = true; subs.clear(); log.length = 0; }
  };
}
