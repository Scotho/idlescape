// A `ScriptContext` for the Tutorial Island stages, over a mutable fake world.
//
// What is real: the stage modules themselves, the helpers, and the step signal they read. What is
// faked is the layer below - the snapshot, the sdk packets, the bot porcelain, `c.find` and
// `c.travel` - because a stage test's claim is "this title fires this task and it takes this
// action", not "travel walks".
//
// Each fake refuses what the real one refuses, and the comment beside it names why:
//  - `followHint` refuses a hint arrow behind the character designer, refuses when there is no
//    arrow, and refuses an npc that is not in the snapshot (workerContext.ts).
//  - `clickThrough` clicks only while a dialog with no REAL choice is open and stops at one that
//    offers a choice, and it spends its whole budget against a frame that does not move, which
//    is what the live implementation does when its frame-change wait times out (workerContext.ts).
//  - `wait.until` answers what the predicate said rather than throwing it away, so a test can
//    pin the predicate (the shape library.harness.ts had to be fixed into).
//
// This file imports NOTHING from vitest: tsconfig excludes `*.test.ts` but not `*.harness.ts`,
// and vitest's ambient types would reach the shipped program from here.
import { CHAR_DESIGN_INTERFACE } from '../../../agent/constants';
import { locAtHint } from '../../../agent/hintTarget';
import { dialogFakes } from './harness.dialog';
import type { HarnessDialog } from './harness.dialog';
import type { ActionResult, WorldState } from '../../../agent/types';
import type { FoundTarget, HealthCondition, ScriptContext, Task, TravelResult, TravelTarget } from '../../types';
import type { NearbyLoc, NearbyNpc } from '../../../vendor/rs-sdk/sdk/types';

export interface HarnessWorld {
  title?: string;
  tutorialOpen?: boolean;
  flashingTab?: number | null;
  hint?: WorldState['hint'];
  /** The chatbox frame. `harness.dialog.ts` documents how its `index` field is read. */
  dialog?: HarnessDialog;
  interfaceId?: number;
  interfaceOpen?: boolean;
  modalOpen?: boolean;
  modalInterface?: number;
  bankOpen?: boolean;
  inventory?: { slot: number; id: number; name: string; count: number }[];
  equipment?: { slot: number; id: number; name: string; count: number }[];
  locs?: { id?: number; name: string; x: number; z: number; options?: string[]; level?: number }[];
  npcs?: { index?: number; name: string; x: number; z: number; options?: string[]; combatLevel?: number }[];
  player?: { worldX: number; worldZ: number; level?: number };
  regionId?: number;
  interfaceTexts?: Record<number, string>;
}

export interface HarnessCalls {
  status: string[];
  interactLoc: { name: string; op: string | number }[];
  interactNpc: { name: string; op: string | number }[];
  talkTo: string[];
  walked: { x: number; z: number }[];
  dialogClicks: number[];
  setTab: number[];
  clickedComponent: number[];
  clickedComponentWithOption: { component: number; option: number; slot: number }[];
  useItemOnItem: { source: number; target: number }[];
  closeModal: number;
  randomize: number;
  acceptDesign: number;
  equipped: string[];
  unequipped: string[];
  attacked: string[];
  cast: { target: string; spell: string | number }[];
  useItemOnLoc: { item: string; loc: string }[];
  bank: string[];
  travel: TravelTarget[];
  find: { kind: string; radius?: number }[];
  waited: string[];
  recovered: HealthCondition[];
  log: string[];
}

export interface HarnessOpts {
  world?: HarnessWorld;
  params?: Record<string, boolean | number | string>;
  /** What `c.find.nearest` answers, by kind. Absent means "nothing of that kind anywhere". */
  found?: Partial<Record<string, FoundTarget | null>>;
  /** What `c.travel.to` answers. Defaults to an arrival that walked nothing. */
  travel?: TravelResult;
  /** Conditions `c.health.is` reports as waiting on the script. */
  health?: HealthCondition[];
  /** Make every interaction fail the way an out-of-reach click does. */
  interactFails?: boolean;
}

export interface TutorialHarness {
  ctx: ScriptContext;
  calls: HarnessCalls;
  /** Change the world between assertions; the next `state()` reads it. */
  set(patch: HarnessWorld): void;
  state(): WorldState;
}

const OK: ActionResult = { success: true, message: 'ok' };
const CANT_REACH: ActionResult = { success: false, message: 'cant reach', reason: 'cant_reach' };

/** The task a snapshot selects, exactly as `runner.loop` selects it: first match wins. */
export function pick(tasks: Task[], s: WorldState, c: ScriptContext): Task | undefined {
  return tasks.find(t => t.when(s, c));
}

export function tutorialHarness(opts: HarnessOpts = {}): TutorialHarness {
  let w: HarnessWorld = { ...opts.world };
  const calls: HarnessCalls = {
    status: [], interactLoc: [], interactNpc: [], talkTo: [], walked: [], dialogClicks: [], setTab: [],
    clickedComponent: [], clickedComponentWithOption: [],
    useItemOnItem: [], closeModal: 0, randomize: 0, acceptDesign: 0, equipped: [], unequipped: [],
    attacked: [], cast: [], useItemOnLoc: [], bank: [], travel: [], find: [], waited: [], recovered: [], log: []
  };

  const locsOf = (): NearbyLoc[] => (w.locs ?? []).map((l, i) => ({
    id: l.id ?? 1000 + i, name: l.name, x: l.x, z: l.z, level: l.level ?? 0,
    distance: Math.max(Math.abs(l.x - (w.player?.worldX ?? 0)), Math.abs(l.z - (w.player?.worldZ ?? 0))),
    options: l.options ?? [], optionsWithIndex: (l.options ?? []).map((text, n) => ({ text, opIndex: n + 1 })), reachable: true
  } as unknown as NearbyLoc));

  const npcsOf = (): NearbyNpc[] => (w.npcs ?? []).map((n, i) => ({
    kind: 'npc', id: 2000 + i, index: n.index ?? i + 1, name: n.name, combatLevel: n.combatLevel ?? 1,
    x: n.x, z: n.z, tileX: n.x, tileZ: n.z,
    distance: Math.max(Math.abs(n.x - (w.player?.worldX ?? 0)), Math.abs(n.z - (w.player?.worldZ ?? 0))),
    options: n.options ?? [], optionsWithIndex: (n.options ?? []).map((text, k) => ({ text, opIndex: k + 1 })), reachable: true
  } as unknown as NearbyNpc));

  const abort = new AbortController();
  const acted = (): ActionResult => (opts.interactFails ? CANT_REACH : OK);

  // Lifted out of the context literal below so the dialogue fakes can be given the same one: a
  // wait the shipped `createDialog` starts is then recorded exactly like a wait a stage starts.
  const wait = {
    // The boolean is the whole point of the call, so the fake reports what the predicate said.
    async until(pred: (s: WorldState) => boolean) {
      const answer = pred(state());
      calls.waited.push(`until:${answer}`);
      return answer;
    },
    // `ticks` answers a boolean since R6 widened it, so the fake answers one too: a run that
    // was never stopped counted the ticks it was asked for. It read `undefined` until the
    // `satisfies` below started comparing this bag with the member it stands in for.
    async ticks() { calls.waited.push('ticks'); return true; },
    async dialog() { calls.waited.push('dialog'); return state().dialog?.isOpen === true; },
    async xp() { calls.waited.push('xp'); return true; },
    async item(key: number | string) { calls.waited.push(`item:${key}`); return true; },
    async message() { calls.waited.push('message'); return true; },
    async idle() { calls.waited.push('idle'); return true; },
    async animation() { calls.waited.push('animation'); return true; },
    async hp() { calls.waited.push('hp'); return true; }
    // The cast on the return throws away every signature in this file, which is the hazard
    // this directory's harness.test.ts header already names. This bag is pinned to the real
    // declaration so a drift is a typecheck error, not a stage test going green over nothing.
  } satisfies ScriptContext['wait'];

  const fakes = dialogFakes({
    frame: () => w.dialog,
    state: () => state(),
    click: i => { calls.dialogClicks.push(i); },
    acted: () => acted(),
    wait,
    signal: () => abort.signal
  });

  const state = (): WorldState => ({
    tutorial: { open: w.tutorialOpen ?? true, title: w.title ?? '', lines: [] },
    flashingTab: w.flashingTab ?? null,
    hint: w.hint ?? { kind: 'none' },
    dialog: { isOpen: w.dialog?.isOpen ?? false, options: fakes.options(), isWaiting: false, text: w.dialog?.text },
    interface: { isOpen: w.interfaceOpen ?? false, interfaceId: w.interfaceId ?? -1, options: [] },
    modalOpen: w.modalOpen ?? false,
    modalInterface: w.modalInterface ?? -1,
    bank: { isOpen: w.bankOpen ?? false, items: [], noteMode: false },
    inventory: w.inventory ?? [],
    equipment: w.equipment ?? [],
    nearbyLocs: locsOf(),
    nearbyNpcs: npcsOf(),
    skills: [],
    interfaceTexts: w.interfaceTexts ?? {},
    regionId: w.regionId ?? 0,
    player: { worldX: w.player?.worldX ?? 0, worldZ: w.player?.worldZ ?? 0, level: w.player?.level ?? 0, animId: -1 }
  } as unknown as WorldState);

  const ctx = {
    state,
    dialog: fakes.dialog,
    params: opts.params ?? {},
    memory: new Map<string, unknown>(),
    signal: abort.signal,
    status: (text: string) => { calls.status.push(text); },
    log: (text: string) => { calls.log.push(text); },
    anchor: () => ({ x: w.player?.worldX ?? 0, z: w.player?.worldZ ?? 0 }),
    health: {
      is: (condition: HealthCondition) => (opts.health ?? []).includes(condition),
      last: () => null,
      recovered: (condition: HealthCondition) => { calls.recovered.push(condition); }
    },
    tutorial: {
      title: () => w.title ?? '',
      is: (re: RegExp) => re.test(w.title ?? ''),
      // Mirrors workerContext.followHint, refusal for refusal: the character designer swallows
      // clicks, no arrow is not a target, and an npc the snapshot does not carry cannot be
      // talked to. A fake that clicked regardless would make every hint step look reachable.
      async followHint(o: { talk?: boolean } = {}): Promise<ActionResult> {
        const s = state();
        if (s.interface?.isOpen && s.interface.interfaceId === CHAR_DESIGN_INTERFACE) {
          return { success: false, message: 'character design is open', reason: 'char_design_open' };
        }
        const h = s.hint;
        if (h?.kind === 'npc') {
          const npc = npcsOf().find(n => n.index === h.npcIndex);
          if (!npc) return { success: false, message: 'hinted npc not in view', reason: 'target_not_found' };
          if (o.talk === false) { calls.interactNpc.push({ name: npc.name, op: 1 }); } else { calls.talkTo.push(npc.name); }
          return acted();
        }
        if (h?.kind === 'tile') {
          // The real rule, imported rather than restated: a fake that matched the arrow's exact
          // tile while the shipped code accepts a door one tile off would be the more permissive
          // of the two, and every door step would look reachable here and stall on the stack.
          const t = locAtHint(locsOf(), h.tile);
          if (t) { calls.interactLoc.push({ name: t.loc.name, op: t.op }); return acted(); }
          calls.walked.push({ x: h.tile.x, z: h.tile.z });
          return acted();
        }
        return { success: false, message: 'no hint arrow', reason: 'no_hint' };
      },
      // The shipped shim over the shipped namespace, from `harness.dialog.ts`. It clicks only
      // while a dialog with nothing to decide is open and stops at one offering a real choice,
      // because that is what `continueUntilOption` does; a stage test calling this exercises the
      // code the Worker runs rather than a second implementation of it.
      clickThrough: fakes.clickThrough
    },
    wait,
    find: {
      async nearest(kind: string, o: { radius?: number } = {}) {
        calls.find.push({ kind, radius: o.radius });
        return opts.found?.[kind] ?? null;
      },
      nearestAtlas: () => null,
      async sweep() { return null; },
      landmark: () => null
    },
    travel: {
      async to(target: TravelTarget) {
        calls.travel.push(target);
        return opts.travel ?? { success: true, legs: 1, tiles: 0 };
      },
      distanceTo: () => Infinity
    },
    sdk: {
      async sendSetTab(tab: number) { calls.setTab.push(tab); return acted(); },
      async sendUseItemOnItem(source: number, target: number) { calls.useItemOnItem.push({ source, target }); return acted(); },
      async sendClickComponent(componentId: number) { calls.clickedComponent.push(componentId); return acted(); },
      async sendClickComponentWithOption(component: number, option = 1, slot = 0) {
        calls.clickedComponentWithOption.push({ component, option, slot });
        return acted();
      },
      async sendCloseModal() { calls.closeModal++; return acted(); },
      async sendRandomizeCharacterDesign() { calls.randomize++; return acted(); },
      async sendAcceptCharacterDesign() { calls.acceptDesign++; return acted(); },
      // Refuses what `Client.clickDialogOption` refuses; `harness.dialog.ts` states the rule.
      sendClickDialog: fakes.sendClickDialog
    },
    bot: {
      async interactLoc(loc: NearbyLoc, op: string | number) { calls.interactLoc.push({ name: loc.name, op }); return acted(); },
      async interactNpc(npc: NearbyNpc, op: string | number) { calls.interactNpc.push({ name: npc.name, op }); return acted(); },
      async talkTo(target: NearbyNpc | string) { calls.talkTo.push(typeof target === 'string' ? target : target.name); return acted(); },
      async walkTo(x: number, z: number) { calls.walked.push({ x, z }); return acted(); },
      // Resolves out of the snapshot by name, the way the real porcelain does, so a test cannot
      // equip an item the character is not carrying.
      async equipItem(target: string) {
        const item = (w.inventory ?? []).find(i => i.name.toLowerCase() === String(target).toLowerCase());
        if (!item) return { success: false, message: 'No such item', reason: 'not_found' } as ActionResult;
        calls.equipped.push(item.name);
        return acted();
      },
      async unequipItem(target: string) {
        const item = (w.equipment ?? []).find(i => i.name.toLowerCase() === String(target).toLowerCase());
        if (!item) return { success: false, message: 'Not equipped', reason: 'not_found' } as ActionResult;
        calls.unequipped.push(item.name);
        return acted();
      },
      // Resolves against the snapshot the way `resolveCombatTarget` does, so a test cannot
      // attack a rat that is not in the room.
      async attack(target: NearbyNpc | string | RegExp) {
        const npc = typeof target === 'object' && 'name' in target
          ? target
          : npcsOf().find(n => (typeof target === 'string' ? n.name.toLowerCase() === target.toLowerCase() : target.test(n.name)));
        if (!npc) return { success: false, message: `Target not found: ${String(target)}`, reason: 'npc_not_found' } as ActionResult;
        calls.attacked.push(npc.name);
        return acted();
      },
      // Resolved the same way, and for the same reason: casting at a chicken that is not
      // there has to refuse rather than report a cast.
      async castSpell(target: NearbyNpc | string | RegExp, spell: string | number) {
        const npc = typeof target === 'object' && 'name' in target
          ? target
          : npcsOf().find(n => (typeof target === 'string' ? n.name.toLowerCase() === target.toLowerCase() : target.test(n.name)));
        if (!npc) return { success: false, message: `Target not found: ${String(target)}`, reason: 'npc_not_found' } as ActionResult;
        calls.cast.push({ target: npc.name, spell });
        return acted();
      },
      // Both operands are resolved out of the snapshot, as the real porcelain resolves them:
      // using an item the character is not carrying, or on a loc that is not in view, refuses.
      async useItemOnLoc(item: string, loc: string) {
        const carried = (w.inventory ?? []).find(i => i.name.toLowerCase() === item.toLowerCase());
        if (!carried) return { success: false, message: `No ${item} in the inventory`, reason: 'not_found' } as ActionResult;
        const target = locsOf().find(l => l.name.toLowerCase() === loc.toLowerCase());
        if (!target) return { success: false, message: `No ${loc} found`, reason: 'loc_not_found' } as ActionResult;
        calls.useItemOnLoc.push({ item: carried.name, loc: target.name });
        return acted();
      },
      async openBank() { calls.bank.push('open'); return acted(); },
      async closeBank() { calls.bank.push('close'); return acted(); },
      async closeInterface() { calls.bank.push('close-interface'); return acted(); },
      async dismissBlockingUI() { calls.bank.push('dismiss'); }
    }
  } as unknown as ScriptContext;

  return {
    ctx, calls, state,
    set(patch: HarnessWorld) { w = { ...w, ...patch }; }
  };
}
