// web/src/frame/stage.ts -- the game stage: one client iframe per character (SP7).
//
// SP6 loaded one client into the page and wired everything around one `hooks` object. Now every
// character has its own `/play.html` iframe, and the stage owns what follows from that: the
// session manager and the tab strip, one XP tracker and loot log per character, one script
// runtime (`wireTasks`) per frame — attached to the tasks router, which is what makes
// `window.idlescape.tasks` follow the active tab — and the sizing of every frame. `main.ts` stays
// the composition root and reads the *active* session through the accessors below; nothing
// outside this module holds a session's hooks.
import { applyFrameSize, computeCanvasSize, type SizeMode } from './canvasSize';
import { createCharacterTabs } from './characterTabs';
import { lootProducer, runProducer, xpProducer } from './eventProducers';
import type { EventBus } from './events';
import { siteLabel } from './siteLabel';
import { createSessionManager, frameWindow, SESSION_CLOSED_MESSAGE, type CharacterSessionManager, type SessionManagerDeps } from '../sessions/manager';
import type { CharacterSession } from '../sessions/types';
import { wireSession } from '../sessions/wire';
import { createXpTracker } from '../stats/xp';
import { createLootLog } from '../stats/loot';
import type { TasksApi } from '../tasks/api';
import type { TasksRouter } from '../tasks/router';
import { wireTasks } from '../tasks/wire';
import type { ClientPluginRegistry } from '../clientTypes';
import type { CharacterSummary, PanelId } from '../types';

export type XpTracker = ReturnType<typeof createXpTracker>;
export type LootLog = ReturnType<typeof createLootLog>;

export interface StageDeps {
  /** `#client-frames`, `#character-tabs`, `#stage`, `#side-panel` and `#title-centre`. */
  frames: HTMLElement;
  tabs: HTMLElement;
  stage: HTMLElement;
  sidePanel: HTMLElement;
  title: HTMLElement;
  mintSession(characterId: string): Promise<{ gameName: string; secret: string }>;
  uid(): string | null;
  characters(): CharacterSummary[];
  characterLimit(): number;
  /**
   * The canvas overlay. The tone union is the module's own three (`frame/overlays.ts`), not the
   * two this stage happens to pass: a narrower copy here made the two disagree, and `'error'` is
   * passed by `sessions/wire.ts` through the very seam below.
   */
  overlays: { setXpLine(text: string | null): void; setStatus(text: string, tone: 'ok' | 'muted' | 'error'): void };
  /** `window.idlescape.tasks`: every session's runtime attaches to it for as long as its tab lives. */
  tasks: TasksRouter;
  /**
   * The frame's event feed. The xp, loot and run producers attach PER SESSION here, because the
   * tasks router drops status and trace for every character that is not in front and a
   * cross-character feed cannot use it (plan ruling R9). Optional: a stage without a bus runs.
   */
  events?: EventBus;
  notify(message: string, kind?: 'info' | 'error' | 'ok'): void;
  openPanel(id: PanelId): void;
  restorePanel(): void;
  /** Client-tier plugins the user already enabled, so a freshly booted frame catches up. */
  enabledClientPlugins(): { id: string; settings: Record<string, unknown> }[];
  getSize(): SizeMode;
  getFilter(): 'auto' | 'pixelated';
  /** The tab clock's clock. Defaults to `Date.now`; a test drives it. */
  now?(): number;
  /** Testing seams: a scripted session manager, and a runtime factory that spawns no Worker. */
  createSessions?(deps: SessionManagerDeps): CharacterSessionManager;
  wireTasks?: typeof wireTasks;
}

export interface Stage {
  sessions: CharacterSessionManager;
  /** The active character's trackers; a throwaway pair before any session exists. */
  activeXp(): XpTracker;
  activeLoot(): LootLog;
  activeTasks(): TasksApi | null;
  activePlugins(): ClientPluginRegistry | null;
  activeCanvas(): HTMLCanvasElement | null;
  /** Sizes every frame, hidden ones too, so switching tabs never reflows the stage. */
  layout(): void;
  /**
   * Points the title bar, the status line and the XP line at one session (the newly active one),
   * or clears all three when nothing is active.
   */
  syncChrome(session: CharacterSession | null): void;
  renderTabs(): void;
  /**
   * The account's roster as last reported; from here on it is what the tab strip renders. Pass the
   * limit that came with the listing so the strip's slot count follows it too; omit it to fall back
   * to `deps.characterLimit()`.
   */
  setCharacters(characters: CharacterSummary[], limit?: number): void;
  /** Opens (lazily booting) and shows a character; rejects when its client fails to start. */
  activate(characterId: string): Promise<void>;
  /** `activate` for the tab strip and the panels: failures become a toast, never a rejection. */
  selectCharacter(characterId: string): Promise<void>;
  /** Logs the character out, forgets its trackers, disposes its runtime and drops the frame. */
  close(characterId: string): void;
  /** Sign-out: every session closed, every tracker forgotten. */
  closeAll(): void;
  /** Fans a client-tier plugin toggle out to every open frame. */
  toggleClientPlugin(id: string, enabled: boolean, settings: Record<string, unknown>): void;
  /** Stops the 1 Hz tab clock. The shell builds one stage per page and never calls this. */
  dispose(): void;
}

/** One interval for the whole strip, not one per tab. */
const TAB_CLOCK_MS = 1000;

/** Sentinel tracker key while nothing is active, so the XP and loot panels always have a source. */
const NO_CHARACTER = ' none';

function canvasOf(session: CharacterSession | null): HTMLCanvasElement | null {
  return (session?.iframe.contentDocument?.getElementById('canvas') as HTMLCanvasElement | null) ?? null;
}

function pluginsOf(session: CharacterSession | null): ClientPluginRegistry | null {
  return frameWindow(session)?.idlescape?.plugins ?? null;
}

/**
 * Frame geometry, in one place. The tokens in styles/tokens.css are the source of truth; these
 * constants are the fallback for an environment that cannot compute them (jsdom returns the empty
 * string for a custom property read off documentElement), and stage.test.ts pins them to the
 * token literals so the two can never drift apart silently.
 */
export const PANEL_W = 280;
export const STRIP_W = 40;

function pxToken(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function createStage(deps: StageDeps): Stage {
  // One tracker per character: XP and loot are per session, not per page (phase-a F7).
  const xpByCharacter = new Map<string, XpTracker>();
  const lootByCharacter = new Map<string, LootLog>();
  /**
   * One script runtime per frame. The stage owns each api's life (it built it, and `close`
   * disposes it); the router owns who `window.idlescape.tasks` currently speaks for.
   */
  const tasksBySession = new Map<string, TasksApi>();
  /** The `wireSession` disposer per session, released when the session closes. */
  const unwireBySession = new Map<string, () => void>();
  /** The Escape-forwarding disposer per session (see `forwardEscape`). */
  const unescapeBySession = new Map<string, () => void>();
  /** The run producer's disposer per session, released with the session in `close`. */
  const unrunBySession = new Map<string, () => void>();
  /**
   * The roster the tab strip renders. Null until something reports one, so the strip falls back to
   * `deps.characters()`; after a create or a delete in the Characters panel the reported listing is
   * newer than the home controller's cache, and the strip has to follow the newer one.
   */
  let roster: CharacterSummary[] | null = null;
  /** The limit that came with that roster, when one did. */
  let rosterLimit: number | null = null;

  function xpFor(characterId: string): XpTracker {
    const existing = xpByCharacter.get(characterId);
    if (existing) return existing;
    const created = createXpTracker();
    xpByCharacter.set(characterId, created);
    return created;
  }

  function lootFor(characterId: string): LootLog {
    const existing = lootByCharacter.get(characterId);
    if (existing) return existing;
    const created = createLootLog();
    lootByCharacter.set(characterId, created);
    return created;
  }

  const makeSessions = deps.createSessions ?? createSessionManager;
  const makeTasks = deps.wireTasks ?? wireTasks;

  const now = deps.now ?? (() => Date.now());
  const tabs = createCharacterTabs(deps.tabs, {
    onSelect: characterId => { void selectCharacter(characterId); },
    // The character list lives inside Account since the merge; there is no Characters panel.
    onNew: () => deps.openPanel('account'),
    now
  });
  const tabClock = setInterval(() => tabs.tick(now()), TAB_CLOCK_MS);

  const sessions = makeSessions({
    host: deps.frames,
    mintSession: deps.mintSession,
    onReady: session => {
      const bus = deps.events;
      const who = { characterId: session.id, characterName: session.character.gameName };
      unwireBySession.get(session.id)?.();
      unwireBySession.set(session.id, wireSession(session, {
        xpFor, lootFor,
        isActive: id => sessions.activeId() === id,
        setXpLine: t => deps.overlays.setXpLine(t),
        setStatus: (t, tone) => deps.overlays.setStatus(t, tone),
        setTitle: t => { deps.title.textContent = t; },
        // Both hang off the hook subscriptions wireSession already makes: `HookEvents.xp` is one
        // discrete event per xp change, so no sampling and no state diff (ruling R7).
        onXp: bus ? xpProducer(bus, { ...who, levelOf: skill => xpFor(session.id).levelOf(skill) }) : undefined,
        onLoot: bus ? lootProducer(bus, { ...who, objName: id => session.hooks?.getObjName(id) ?? null }) : undefined
      }));
      if (session.hooks) {
        tasksBySession.get(session.id)?.dispose();
        // Bound to THIS iframe's hooks and canvas, not to "whatever is active": a run keeps
        // driving the character it started on even after the player switches tabs.
        const api = makeTasks({
          hooks: session.hooks,
          canvas: () => canvasOf(session),
          uid: deps.uid,
          characterId: () => session.id,
          characterName: () => session.character.gameName,
          // The session manager, not the client: it refuses a second login while one is in
          // flight, which a bare `loginArmed()` would leave hanging forever, and it reports
          // success for a session that is already online.
          relogin: () => sessions.login(session.id).then(r => (r.ok ? { ok: true } : { ok: false, reason: r.reason }))
        });
        tasksBySession.set(session.id, api);
        deps.tasks.attach(session.id, api);
        // On the raw api and not on `deps.tasks`: the router publishes the ACTIVE session only.
        unrunBySession.get(session.id)?.();
        unrunBySession.delete(session.id);
        if (bus) unrunBySession.set(session.id, runProducer(bus, api, who));
      }
      syncClientPlugins(session);
      forwardEscape(session);
      layout();
    },
    // Every change (a frame appended, booted, shown or dropped) re-sizes, re-renders the strip
    // and re-publishes the active runtime's status: cheap, and it keeps the three from ever
    // disagreeing. Status is edge-driven, so without the last one a tab switch would leave the
    // previous character's run on the banner.
    onChange: () => { layout(); renderTabs(); deps.tasks.notifyActiveChanged(); }
  });

  function activeTasks(): TasksApi | null {
    const id = sessions.activeId();
    return id ? tasksBySession.get(id) ?? null : null;
  }

  /**
   * Escape is the panic key, and the co-pilot bar's handler sits on the parent document
   * (`frame/copilotBar.ts`). A keydown inside a same-origin iframe never crosses the frame
   * boundary, so while focus is in the client frame, which is exactly when a run is going
   * wrong, the parent never hears it. Each frame therefore gets its own listener that re-fires
   * a synthetic Escape on the parent document, and `close` takes it away with the frame.
   */
  function forwardEscape(session: CharacterSession): void {
    unescapeBySession.get(session.id)?.();
    unescapeBySession.delete(session.id);
    const inner = session.iframe.contentDocument;
    if (!inner) return;
    const onKey = (event: Event): void => {
      if ((event as KeyboardEvent).key !== 'Escape') return;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    };
    inner.addEventListener('keydown', onKey);
    unescapeBySession.set(session.id, () => inner.removeEventListener('keydown', onKey));
  }

  /** A freshly booted frame must catch up with the client-tier plugins the user already enabled. */
  function syncClientPlugins(session: CharacterSession): void {
    const plugins = pluginsOf(session);
    if (!plugins) return;
    for (const { id, settings } of deps.enabledClientPlugins()) void plugins.enable(id, settings);
  }

  /**
   * A tab switch must carry the chrome with it: the hooks only report changes, so a session that
   * logged in while another tab was showing has to be read back from its state here.
   */
  function syncChrome(session: CharacterSession | null): void {
    if (!session) {
      // Nothing is active (the last tab just closed): the chrome must not keep describing a
      // character that is no longer on screen.
      deps.title.textContent = '';
      deps.overlays.setStatus('', 'muted');
      deps.overlays.setXpLine(null);
      return;
    }
    const name = session.character.gameName;
    deps.title.textContent = session.state === 'online' ? siteLabel(name) : '';
    // Online says nothing here any more. The pairing pill is its own node, painted from the
    // pairing store and the run status by `wireOverlays`, and this line used to write a literal
    // that was true of an account with no Claude session and of nothing else (plan ruling R6).
    if (session.state === 'online') deps.overlays.setStatus('', 'muted');
    else if (session.state === 'connecting') deps.overlays.setStatus('connecting…', 'muted');
    else if (session.state === 'booting') deps.overlays.setStatus('starting…', 'muted');
    // A dropped connection is not the title screen: say so, and say what gets the player back.
    else if (session.state === 'offline') deps.overlays.setStatus('offline · press Login to reconnect', 'muted');
    else deps.overlays.setStatus('press Login to play', 'muted');
    const [top] = xpFor(session.id).rows(Date.now());
    deps.overlays.setXpLine(top ? `${top.name} · ${top.perHour.toLocaleString()} xp/h` : null);
  }

  function layout(): void {
    const panelOpen = !deps.sidePanel.classList.contains('hidden');
    const reserved = pxToken('--strip-w', STRIP_W)
      + (panelOpen && deps.stage.clientWidth > 1100 ? pxToken('--panel-w', PANEL_W) : 0)
      + 16;
    const size = computeCanvasSize({ available: deps.stage.clientWidth - reserved, mode: deps.getSize() });
    // Hidden frames are sized too, so switching tabs never reflows the stage.
    for (const session of sessions.list()) applyFrameSize(session.iframe, size, deps.getFilter());
  }

  function renderTabs(): void {
    tabs.render({
      characters: roster ?? deps.characters(),
      limit: rosterLimit ?? deps.characterLimit(),
      states: sessions.states(),
      // The same walk as `states()`, kept a separate record so `computeSlots` stays pure.
      onlineSince: Object.fromEntries(sessions.list().map(s => [s.id, s.onlineSince])),
      activeId: sessions.activeId()
    });
  }

  async function activate(characterId: string): Promise<void> {
    await sessions.activate(characterId);
    layout();
    renderTabs();
    // Whatever is on screen now (a newer activate may have won) gets the chrome.
    const active = sessions.active();
    if (active) syncChrome(active);
  }

  async function selectCharacter(characterId: string): Promise<void> {
    try {
      await activate(characterId);
      deps.restorePanel();
    } catch (err) {
      // Deleting a character whose frame is still booting closes its session, and the manager
      // rejects the in-flight open with its cancellation reason. That is the delete working;
      // the strip has to follow it, but the player has nothing to read about.
      if ((err as Error).message !== SESSION_CLOSED_MESSAGE) deps.notify((err as Error).message, 'error');
      // The manager already dropped the failed session; the strip must show that.
      renderTabs();
    }
  }

  function close(characterId: string): void {
    unwireBySession.get(characterId)?.();
    unwireBySession.delete(characterId);
    unescapeBySession.get(characterId)?.();
    unescapeBySession.delete(characterId);
    unrunBySession.get(characterId)?.();
    unrunBySession.delete(characterId);
    deps.tasks.detach(characterId);
    tasksBySession.get(characterId)?.dispose();
    tasksBySession.delete(characterId);
    xpByCharacter.delete(characterId);
    lootByCharacter.delete(characterId);
    // `sessions.close` emits, and `onChange` re-points the run banner at whatever is active now.
    sessions.close(characterId);
    // The closed tab may have been the one in front; whatever is showing now owns the chrome.
    syncChrome(sessions.active());
  }

  return {
    sessions,
    activeXp: () => xpFor(sessions.activeId() ?? NO_CHARACTER),
    activeLoot: () => lootFor(sessions.activeId() ?? NO_CHARACTER),
    activeTasks,
    activePlugins: () => pluginsOf(sessions.active()),
    activeCanvas: () => canvasOf(sessions.active()),
    layout,
    syncChrome,
    renderTabs,
    setCharacters(characters, limit) {
      roster = characters;
      rosterLimit = limit ?? null;
      sessions.setCharacters(characters);
      renderTabs();
    },
    activate,
    selectCharacter,
    close,
    closeAll() {
      for (const session of sessions.list()) close(session.id);
      // `close` forgets each session's trackers; the sentinel pair goes too.
      xpByCharacter.clear();
      lootByCharacter.clear();
      renderTabs();
    },
    dispose() { clearInterval(tabClock); },
    toggleClientPlugin(id, enabled, settings) {
      for (const session of sessions.list()) {
        const plugins = pluginsOf(session);
        if (!plugins) continue; // that frame is still booting; syncClientPlugins catches it up
        if (enabled) void plugins.enable(id, settings);
        else plugins.disable(id);
      }
    }
  };
}
