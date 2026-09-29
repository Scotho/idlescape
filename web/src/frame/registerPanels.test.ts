// web/src/frame/registerPanels.test.ts -- the strip's order, which nothing could reach before.
//
// Registration order IS strip order (plugins/registry.ts's `emitStrip`), and it lived in
// `main.ts`'s module body, which no unit test executes. A case in registry.test.ts could not
// stand in: it would pin a fixture's order and keep passing while the real list drifted.
import { describe, expect, it, vi } from 'vitest';
import { PANEL_ORDER, registerShellPanels, type PluginShell, type RegisterDeps } from './registerPanels';
import { PANEL_IDS } from './panels';
import { createEventBus } from './events';
import { createLootLog } from '../stats/loot';
import { createXpTracker } from '../stats/xp';
import type { ShellPlugin } from '../plugins/types';
import type { TasksPluginDeps } from '../plugins/builtin/tasks';
import type { PanelId } from '../types';

/**
 * The `counters` closure this module builds is the ONLY derivation of the run card's two figures:
 * every panel test hands the panel its own fixture, so nothing downstream can see it. Gutting it
 * to `{ logs: 0, sessionXp: 0 }` left the whole web suite green. The real `createTasksPlugin` is
 * still what runs; the wrapper only keeps the deps it was handed, so the six cases below are
 * unaffected and this one has something to assert against.
 */
const seam = vi.hoisted(() => ({ counters: null as TasksPluginDeps['counters'] | null }));
vi.mock('../plugins/builtin/tasks', async importOriginal => {
  const actual = await importOriginal<typeof import('../plugins/builtin/tasks')>();
  return {
    ...actual,
    createTasksPlugin: (deps: TasksPluginDeps): ShellPlugin => {
      seam.counters = deps.counters;
      return actual.createTasksPlugin(deps);
    }
  };
});

/**
 * A collaborator that fails if the register pass ever touches it. Registration builds plugins; it
 * does not run them, so every one of these is stricter than the real object rather than looser: a
 * plugin that reached for its store or its window at construction time fails here loudly.
 */
function unreachable<T extends object>(name: string): T {
  return new Proxy({} as T, {
    get: (_target, key) => () => { throw new Error(`${name}.${String(key)} was called during registration`); }
  });
}

function fakeDeps(): RegisterDeps {
  const view = () => ({ title: 'stub', mount: () => {} });
  return {
    activeXp: createXpTracker,
    activeLoot: createLootLog,
    activeCanvas: () => null,
    tasks: {
      api: unreachable('tasks.api'),
      hasSession: () => false,
      openTrace: () => {},
      onActiveChanged: () => () => {},
      marketplace: { api: unreachable('marketplace.api'), hasSession: () => false, openPanel: () => {} }
    },
    bank: { window: unreachable('bank.window'), store: unreachable('bank.store'), closePanel: () => {} },
    // The real bus: it is a dozen lines with no network and no timer, so a stand-in could only
    // be looser than the thing the panel is handed in `main.ts`.
    events: { bus: createEventBus(), characters: () => [] },
    connect: view, account: view, config: view, plugins: view
  };
}

function recordingShell(into: ShellPlugin[]): PluginShell {
  return { register: plugin => { into.push(plugin); } };
}

describe('registerShellPanels', () => {
  it('the strip is exactly the eleven panels the icon set was drawn for, in the mock order', () => {
    // Companion spec section 3: eleven glyphs, eleven buttons, every name matching.
    const seen: ShellPlugin[] = [];
    registerShellPanels(recordingShell(seen), fakeDeps());
    const withButtons = seen.filter(p => p.panel !== undefined).map(p => p.manifest.id);
    expect(withButtons).toEqual([...PANEL_ORDER]);
    expect(PANEL_ORDER).toEqual([
      'tasks', 'connect', 'xp', 'loot', 'events', 'notes', 'screenshot', 'bank', 'account', 'plugins', 'config'
    ]);
  });

  // G4 and the status HUD: both are registered, and neither is allowed a button. `emitStrip` gives
  // a button to a plugin that declares a `panel`, so this is the whole of the "no button" claim.
  it('marketplace and status-hud register last and emit no strip button', () => {
    const seen: ShellPlugin[] = [];
    registerShellPanels(recordingShell(seen), fakeDeps());
    expect(seen.map(p => p.manifest.id).slice(-2)).toEqual(['marketplace', 'status-hud']);
    expect(seen.find(p => p.manifest.id === 'marketplace')!.panel).toBeUndefined();
    expect(seen.find(p => p.manifest.id === 'status-hud')!.panel).toBeUndefined();
    expect(seen).toHaveLength(PANEL_ORDER.length + 2);
  });

  // The rename is the display name only: the id is in every player's `cs.panel`, in
  // `cs.plugin.tasks` and in `[data-panel="tasks"]` in both suites (ruling C2).
  it('the Automation button keeps the plugin id tasks, and every glyph name is the mock name', () => {
    const seen: ShellPlugin[] = [];
    registerShellPanels(recordingShell(seen), fakeDeps());
    const byId = new Map(seen.map(p => [p.manifest.id, p.manifest]));
    expect(byId.get('tasks')!.name).toBe('Automation');
    expect(byId.get('tasks')!.icon).toBe('automation');
    expect(byId.get('account')!.name).toBe('Account');
    expect(byId.get('events')!.icon).toBe('events');
    expect([...PANEL_ORDER].map(id => byId.get(id)!.icon)).toEqual([
      'automation', 'claude', 'xp', 'loot', 'events', 'notes', 'screenshot', 'bank', 'account', 'plugins', 'config'
    ]);
  });

  // `cs.panel` is a persisted data contract and `restore()` narrows an arbitrary stored string
  // through `PANEL_IDS`, so a panel registered here but missing from that list opens from its
  // strip button and then silently never comes back on a reload. Nothing tied the two together:
  // deleting an id from `PANEL_IDS` left the whole suite green. The compile-time half lives on
  // the `PANEL_IDS` declaration; this is the runtime half, against what is really registered.
  it('every panel it registers can be restored from cs.panel', () => {
    const seen: ShellPlugin[] = [];
    registerShellPanels(recordingShell(seen), fakeDeps());
    for (const p of seen) {
      // `status-hud` is not a panel id at all, so it is not in the union or the list.
      if (p.manifest.id === 'status-hud') continue;
      expect(PANEL_IDS).toContain(p.manifest.id);
    }
    expect([...PANEL_IDS].sort()).toEqual([...PANEL_ORDER, 'marketplace'].sort());
  });

  it('hands the Automation panel counters read off the live loot and xp trackers', () => {
    // The two trackers the XP and Loot panels are given, fed the way a session feeds them.
    const xp = createXpTracker();
    const loot = createLootLog();
    loot.onInventory({ added: [{ id: 1511, count: 3 }, { id: 1521, count: 2 }] }, 0);
    loot.onInventory({ added: [{ id: 1511, count: 1 }] }, 10);
    xp.onXp({ skill: 8, xp: 100, delta: 0, level: 5 }, 0);
    xp.onXp({ skill: 8, xp: 350, delta: 25, level: 6 }, 10);
    registerShellPanels(recordingShell([]), { ...fakeDeps(), activeXp: () => xp, activeLoot: () => loot });
    // Four logs and two of the other stack, and the xp GAINED since the tracker's baseline,
    // which is what the run card's row says: not the character's 350 total.
    expect(seam.counters?.()).toEqual({ logs: 6, sessionXp: 250 });
  });

  it('reads the trackers on every call, so a card patched a second later sees the new figures', () => {
    const xp = createXpTracker();
    const loot = createLootLog();
    registerShellPanels(recordingShell([]), { ...fakeDeps(), activeXp: () => xp, activeLoot: () => loot });
    expect(seam.counters?.()).toEqual({ logs: 0, sessionXp: 0 });
    loot.onInventory({ added: [{ id: 1511, count: 7 }] }, 0);
    expect(seam.counters?.()).toEqual({ logs: 7, sessionXp: 0 });
  });

  // `characters` is deleted, not renamed: a registration for it would put a twelfth button on a
  // strip the icon set has eleven glyphs for.
  it('no panel is registered for the deleted characters id', () => {
    const seen: ShellPlugin[] = [];
    registerShellPanels(recordingShell(seen), fakeDeps());
    expect(seen.map(p => p.manifest.id)).not.toContain('characters');
    expect(PANEL_ORDER).not.toContain('characters' as PanelId);
  });
});
