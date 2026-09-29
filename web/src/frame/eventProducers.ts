// web/src/frame/eventProducers.ts -- the six producers that feed frame/events.ts.
//
// Each is a small function over the bus, attached where the signal already exists rather than
// where it would be convenient. Three of them (xp, level, loot) hang off `sessions/wire.ts`'s
// existing hook subscriptions, the run producer attaches PER SESSION in `frame/stage.ts` because
// `tasks/router.ts` drops status and trace for background characters and a cross-character feed
// cannot use it (plan ruling R9), and the pairing, bank and gateway producers attach once in
// `frame/singletons.ts` to the three things that outlive a panel (ruling R10).
//
// The `claude` chip is scoped to exactly three of them: a pairing change, the gateway coming up,
// and a run Claude started (ruling R11). There is no Claude message channel and this entry builds
// none, so do not add a fourth.
import { SKILL_NAMES } from '../stats/skills';
import { EVENT_GATEWAY_OK, EVENT_PAUSED_MOUSE, bankUpdated, runFailed } from '../ui/copy';
import type { EventBus } from './events';
import type { PairingStore } from './pairing';
import type { BankStore } from '../bank/store';
import type { InventoryEvent, XpEvent } from '../clientTypes';
import type { TasksApi } from '../tasks/api';
import type { HealthSnapshot } from '../types';

/** The mock's resume row (`map-design.md` 3.12, seeded event 4). No em dash, so not in copy.ts. */
const RUN_RESUMED = 'Run resumed after you took control';
/** A run_done that arrives with no run_started before it. */
const UNNAMED_RUN = 'the run';

/** Who an event belongs to. Null on both fields is an account-scoped event (bank, gateway). */
export interface CharacterDeps {
  characterId: string;
  characterName: string | null;
}

export interface XpProducerDeps extends CharacterDeps {
  /**
   * The level this skill was last known to be at, or null when nothing knows yet. Read on every
   * event rather than cached alone, because `sessions/wire.ts` feeds the tracker first and a
   * producer that only asked once would never see the first level of a session move.
   */
  levelOf(skill: number): number | null;
}

export interface LootProducerDeps extends CharacterDeps {
  /** `ClientHooks.getObjName`. Null for an id this pack has never heard of. */
  objName(id: number): string | null;
}

/** Same fallback as `stats/xp.ts:23`: a skill off the end of the table is named, not undefined. */
const skillName = (skill: number): string => SKILL_NAMES[skill] ?? `Skill ${skill}`;

export function xpProducer(bus: EventBus, deps: XpProducerDeps): (ev: XpEvent) => void {
  const levels = new Map<number, number>();
  return ev => {
    // `HookEvents.xp` is one discrete event per xp change (ruling R7): no sampling, no diff.
    if (ev.delta <= 0) return;
    const skill = skillName(ev.skill);
    bus.emit({
      characterId: deps.characterId, characterName: deps.characterName, type: 'xp',
      skill, text: `+${ev.delta} ${skill} xp`, tone: 'default', amount: ev.delta
    });
    const known = levels.get(ev.skill) ?? deps.levelOf(ev.skill);
    levels.set(ev.skill, ev.level);
    if (known === null || ev.level <= known) return;
    // The level number is in the text; `amount` is the canvas drop's xp field and a level is not
    // xp, so it stays null rather than smuggling a second meaning into one field.
    bus.emit({
      characterId: deps.characterId, characterName: deps.characterName, type: 'level',
      skill, text: `Level up! ${skill} ${known} → ${ev.level}`, tone: 'default', amount: null
    });
  };
}

export function lootProducer(bus: EventBus, deps: LootProducerDeps): (ev: InventoryEvent) => void {
  return ev => {
    // `added` only: a removal is a drop, a deposit or a use, and none of them is loot
    // (`stats/loot.ts` counts the same half).
    for (const entry of ev.added) {
      if (entry.count <= 0) continue;
      const name = deps.objName(entry.id) ?? `Item ${entry.id}`;
      bus.emit({
        characterId: deps.characterId, characterName: deps.characterName, type: 'loot',
        skill: null, text: entry.count === 1 ? `${name} picked up` : `${entry.count} ${name} picked up`,
        tone: 'default', amount: entry.count
      });
    }
  };
}

export function runProducer(bus: EventBus, api: TasksApi, deps: CharacterDeps): () => void {
  /** `run_done` carries no scriptId, so the name is kept from the start event that named it. */
  let scriptId: string | null = null;
  /** The mock pairs its resume row with a human-input pause; every other pause is silent. */
  let pausedByHuman = false;
  const emit = (text: string, type: 'run' | 'claude' = 'run', tone: 'default' | 'fail' = 'default'): void => {
    bus.emit({ characterId: deps.characterId, characterName: deps.characterName, type, skill: null, text, tone, amount: null });
  };
  return api.onEvent(e => {
    switch (e.kind) {
      case 'run_started':
        scriptId = e.scriptId;
        if (e.startedBy === 'claude') emit(`Claude started ${e.scriptId}`, 'claude');
        else emit(`Started ${e.scriptId}`);
        break;
      case 'paused':
        if (e.reason !== 'human-input') break;
        pausedByHuman = true;
        emit(EVENT_PAUSED_MOUSE);
        break;
      case 'resumed':
        if (!pausedByHuman) break;
        pausedByHuman = false;
        emit(RUN_RESUMED);
        break;
      case 'run_done': {
        const name = scriptId ?? UNNAMED_RUN;
        scriptId = null;
        pausedByHuman = false;
        const reason = e.summary.trim();
        if (e.status === 'failed') emit(reason ? runFailed(name, reason) : `${name} failed`, 'run', 'fail');
        else emit(`${name} ${e.status === 'done' ? 'finished' : 'stopped'}`);
        break;
      }
      default:
        // Every other arm of the nineteen-arm trace union is the trace view's, not the feed's.
        break;
    }
  });
}

export function pairingProducer(bus: EventBus, store: PairingStore): () => void {
  /** Token id to "is revoked". Null until the first snapshot, which is the baseline. */
  let seen: Map<string, boolean> | null = null;
  const emit = (text: string): void => {
    bus.emit({ characterId: null, characterName: null, type: 'claude', skill: null, text, tone: 'default', amount: null });
  };
  return store.subscribe(() => {
    const rows = store.sessions();
    const next = new Map(rows.map(r => [r.id, r.revokedAt !== null]));
    // A page load with three sessions already paired is not three pairings that just happened.
    if (seen === null) { seen = next; return; }
    for (const row of rows) {
      const was = seen.get(row.id);
      const revoked = row.revokedAt !== null;
      if (was === undefined) { if (!revoked) emit(`${row.label} session paired`); }
      else if (!was && revoked) emit(`${row.label} session revoked`);
    }
    seen = next;
  });
}

export function bankProducer(bus: EventBus, store: BankStore): () => void {
  /** Null until the first VERSION-BEARING snapshot, which is the baseline. */
  let version: number | null = null;
  return store.subscribe(state => {
    // A negative version means the store holds no read: its initial state, and what stop() puts
    // it back to. Neither is a baseline, and forgetting the one we had is the point of the reset.
    // The store notifies on plenty that carries no read at all - `emit({ live: healthy })` when
    // the SSE stream connects (store.ts's onHealth) and `emit({ loading: false, error })` when
    // the first GET fails, and start() races the stream against that GET - so latching on the
    // first notification of ANY kind would announce the first read of a plain page load, and
    // would measure the second account signed in on one page against the first account's bank.
    if (state.version < 0) { version = null; return; }
    const previous = version;
    version = state.version;
    // The producer is attached BEFORE the store is started (frame/singletons.ts), so the first
    // read it ever sees is the load, not a change the player made.
    if (previous === null || state.version === previous) return;
    bus.emit({
      characterId: null, characterName: null, type: 'bank', skill: null,
      // The mock's literal carries a fixed `27 / 240`; copy.ts declares it as a template so the
      // producer can say the real numbers.
      text: bankUpdated(state.used, state.capacity), tone: 'default', amount: state.used
    });
  });
}

/**
 * The third and last `claude` producer (ruling R11), fed by the /health poll that
 * `frame/singletons.ts` runs. Emits on the transition INTO `up`, never on every poll.
 */
export function gatewayProducer(bus: EventBus): (gateway: HealthSnapshot['gateway']) => void {
  let up = false;
  return gateway => {
    const nowUp = gateway === 'up';
    if (nowUp && !up) {
      bus.emit({ characterId: null, characterName: null, type: 'claude', skill: null, text: EVENT_GATEWAY_OK, tone: 'default', amount: null });
    }
    up = nowUp;
  };
}
