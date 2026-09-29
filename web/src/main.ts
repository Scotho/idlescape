import { createBoot, createHealthWatcher, createPageHideHandler, showBootError } from './boot';
import { byId, hide, show } from './dom';
import { createAppState } from './state';
import { health } from './api';
import { attachEmail, currentIdToken, reauthEmail, signOutUser } from './auth';
import { mintSession } from './characters/api';
import type { SizeMode } from './frame/canvasSize';
import { createOverlays, wireOverlays } from './frame/overlays';
import { createPluginRegistry, paintPanelIcon } from './frame/panels';
import { registerShellPanels } from './frame/registerPanels';
import { createCopilotBar } from './frame/copilotBar';
import { createPinnedTracker, pinGuards } from './frame/pinnedTracker';
import { createFrameSingletons } from './frame/singletons';
import { createStage } from './frame/stage';
import { createHomeController } from './home/controller';
import { createAccountPanel, setAccountError } from './panels/account';
import type { CharacterSectionDeps } from './panels/accountCharacters';
import { createConfigPanel } from './panels/config';
import { createConnectPanel } from './panels/connect';
import { createShellRegistry } from './plugins/registry';
import { createSettingsStore, migratePluginKeys } from './plugins/settings';
import { createFirestoreBackend } from './plugins/firestoreBackend';
import { createPluginsPanel } from './plugins/pluginsPanel';
import { type PluginContext, type PluginManifest, type SettingsValues } from './plugins/types';
import { createStageWindows } from './frame/stageWindows';
import type { ObjInfo } from './clientTypes';
import { applyTabListA11y, buildStrip } from './ui/strip';
import { createToastHost } from './ui/toast';
import { createTasksRouter } from './tasks/router';
import { migrateScriptKeys } from './tasks/toggles';
import type { AppState, CharacterSummary, Identity, PanelId } from './types';

// Audit C10: pre-scoping `cs.plugin.<id>` and `cs.script.<id>` keys move into the signed-out
// bucket before any store reads them. Idempotent and guarded, so it is safe on every load and on a
// browser with storage blocked. See web/src/storage/scoped.ts for why anon and not the account.
migratePluginKeys();
migrateScriptKeys();

const state = createAppState();
const screens: Record<AppState, string> = { boot: 'screen-boot', home: 'screen-home', characters: 'screen-characters', playing: 'screen-frame', offline: 'screen-frame' };

state.onChange(s => {
  for (const id of Object.values(screens)) hide(id);
  show(screens[s]);
});

// A private window can block localStorage outright, and these two run at module scope: an
// unguarded throw here blanks the page before createBoot can paint anything, which is exactly
// the failure audit C18 exists to remove. Reading is guarded; the setters below run inside a
// handler, where a throw costs one settings change rather than the whole page.
const readPref = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
let sizeMode: SizeMode = (readPref('cs.size') as SizeMode | null) ?? 'auto';
let filter: 'auto' | 'pixelated' = (readPref('cs.filter') as 'auto' | 'pixelated' | null) ?? 'auto';

const overlays = createOverlays(byId('overlays'));
const pluginOverlayHost = byId('plugin-overlays');
// Low-level open/close controller (SP1). We (re)register only enabled panel plugins into it.
const panelCtl = createPluginRegistry({ strip: byId('icon-strip'), panel: byId('side-panel'), title: byId('panel-title'), body: byId('panel-body'), onChange: open => { onPanelChange(open); stage.layout(); } });
const stripA11y = applyTabListA11y(byId('icon-strip'));
const toasts = createToastHost(byId('toasts'));
byId('panel-back').addEventListener('click', () => panelCtl.close());

/** Mirrors the open panel into the header icon and the strip's ARIA state. */
function onPanelChange(open: PanelId | null): void {
  paintPanelIcon(byId('panel-icon'), open === null ? undefined : shell.manifests().find(p => p.id === open));
  stripA11y.syncSelected();
  // The mock's two pin guards (map-design 3.8), in a module a test can import; see `pinGuards`.
  const { canPin, showCard } = pinGuards(open, pinnedPanel);
  byId('panel-pin').classList.toggle('hidden', !canPin);
  pinnedTracker.setPinned(showCard);
}
// Only the XP panel is pinnable, and the state is a module variable and NOT a `cs.` key: the mock
// treats it as UI state and this entry's constraint list sanctions no new one.
let pinnedPanel: 'xp' | null = null;
byId('panel-pin').addEventListener('click', () => { pinnedPanel = 'xp'; onPanelChange(panelCtl.current()); });

/** Plugin and shell notices as toasts over the game view; the overlay status line is left to connection state. */
function notify(message: string, kind: 'info' | 'error' | 'ok' = 'info'): void {
  toasts.show(message, kind === 'error' ? 'error' : kind === 'ok' ? 'ok' : 'info');
}

// `window.idlescape.tasks` (SP7): one object over one runtime per character. It forwards to the
// active session's api, except calls that name a run, which go to the api that owns it, so a run
// keeps driving the character it started on after the player switches tabs.
const tasksRouter = createTasksRouter({ activeId: () => stage.sessions.activeId() });

/** Tracks the uid the shell registry was last init()'d for; `undefined` = never initialized. */
let shellUid: string | null | undefined;

// Owns the home screen, the email forms, the pairing card and the characters gate; main.ts
// stays the composition root that wires it to the frame, the plugins and the client sessions.
const homeCtl = createHomeController({
  setState: s => state.set(s),
  gameName: () => stage.sessions.active()?.character.gameName ?? null,
  enterFrame: (characters, chosen, created) => { void enterFrame(characters, chosen, created); },
  onIdentity: id => {
    const uid = id?.uid ?? null;
    if (uid === shellUid) return;
    shellUid = uid;
    // The frame-lifetime singletons follow the ACCOUNT, not a panel: signing in starts the
    // pairing listener and the bank store, and signing out stops both.
    if (uid) singletons.start(uid); else singletons.stop();
    void shell.init();
  }
});

const identity = (): Identity | null => homeCtl.identity();

// SP8b: one bank per ACCOUNT. The obj facts and the icon cache come from whichever character
// frame is in front; the bank itself does not care which, because it is keyed by the uid.
const bankObjInfo = (obj: number): ObjInfo | null => stage.sessions.active()?.hooks?.getObjInfo(obj) ?? null;
// Everything in the shell that outlives a panel: the event feed, the pairing truth and the bank
// store (plan ruling R10). Both stores used to be owned by a surface that opens and closes, which
// left the co-pilot bar blind and the event feed with a hole in the middle of every session.
// main.ts builds the set once, hands the pieces down, and feeds it the health snapshots the
// watcher at the foot of this file already polls for.
const singletons = createFrameSingletons({
  info: bankObjInfo,
  notify: (message, kind) => notify(message, kind === 'error' ? 'error' : 'info'),
  idToken: currentIdToken
});
const bankStore = singletons.bank;
// The pinned XP card. It outlives every panel mount, which is the whole point: it is on screen
// exactly when the XP panel is not, so it cannot live in the plugin that draws the same numbers.
const pinnedTracker = createPinnedTracker(byId('pinned-tracker'), {
  rows: () => stage.activeXp().rows(Date.now()),
  onUnpin: () => { pinnedPanel = null; onPanelChange(panelCtl.current()); }
});

// The game stage (SP7): one `/play.html` iframe per character, the tab strip, one XP tracker,
// loot log and script runtime per character. Everything below reads the *active* session
// through it; no module outside `frame/stage.ts` holds a session's hooks.
const stage = createStage({
  frames: byId('client-frames'), tabs: byId('character-tabs'), stage: byId('stage'), sidePanel: byId('side-panel'), title: byId('title-centre'),
  mintSession: async characterId => mintSession(await currentIdToken(), characterId),
  uid: () => identity()?.uid ?? null,
  characters: () => homeCtl.characters(),
  characterLimit: () => homeCtl.characterLimit(),
  overlays, notify, tasks: tasksRouter, events: singletons.bus,
  openPanel: id => panelCtl.open(id),
  restorePanel: () => panelCtl.restore(),
  enabledClientPlugins: () => shell.manifests()
    .filter(m => m.tier === 'client' && shell.isEnabled(m.id))
    .map(m => ({ id: m.id, settings: settingsStore.get(m.id)?.settings ?? {} })),
  getSize: () => sizeMode,
  getFilter: () => filter
});
window.addEventListener('resize', () => stage.layout());
// The co-pilot bar (plan Task 14): run state AND pairing state, Escape to pause, the strip dot. All
// three nodes are handed in, because the detail row and the rule are siblings of the live region,
// and `openTrace` opens the trace window Task 16 built, on the run the bar is showing.
const copilotBar = createCopilotBar({
  bar: byId('copilot-bar'), detail: byId('copilot-detail'), rule: byId('copilot-rule'), notify,
  strip: () => byId('icon-strip'), api: () => tasksRouter.api, openPanel: id => panelCtl.open(id),
  pairing: () => singletons.pairing.state(), session: () => stage.sessions.active()?.state ?? 'title', openTrace: () => { const run = tasksRouter.api.status(); if (run.runId !== null) openTrace(run.runId, run.scriptName); }
});
copilotBar.update(tasksRouter.api.status());
tasksRouter.api.onStatus(s => copilotBar.update(s));
singletons.pairing.subscribe(() => copilotBar.refresh());
// The canvas pairing pill and the xp drop, both fed from the frame-lifetime truths rather than
// from a literal written at login (plan ruling R6, and one producer with two consumers for G2).
wireOverlays(overlays, {
  pairing: singletons.pairing, bus: singletons.bus, activeId: () => stage.sessions.activeId(),
  status: () => tasksRouter.api.status(), onStatus: cb => tasksRouter.api.onStatus(cb)
});

/**
 * The parent's `window.idlescape` is a façade over the active session, so plugins, the e2e
 * helpers and the SP4a transport keep reading one place while the real hooks live per iframe.
 * Every getter is nullish until a session exists (the `Window` type says `undefined`).
 */
window.idlescape = {
  get client() { return stage.sessions.active()?.hooks ?? undefined; },
  get plugins() { return stage.activePlugins() ?? undefined; },
  // Not a getter: the router itself is the published object, for the whole life of the page.
  tasks: tasksRouter.api
};

const deps = {
  identity,
  gameName: () => stage.sessions.active()?.character.gameName ?? null,
  hooks: () => stage.sessions.active()?.hooks ?? null,
  activeCharacter: () => stage.sessions.active()?.character ?? null,
  characters: () => homeCtl.characters(),
  refreshCharacters: async () => { const list = await homeCtl.refreshCharacters(); stage.setCharacters(list); return list; },
  startSession: (c: CharacterSummary) => { void stage.selectCharacter(c.id); },
  signOut: async () => { stage.closeAll(); await signOutUser(); },
  attachEmail, openPanel: (id: PanelId) => panelCtl.open(id), notify,
  pairing: singletons.pairing,
  health: () => singletons.health(),
  setSize: (m: SizeMode) => { sizeMode = m; localStorage.setItem('cs.size', m); stage.layout(); },
  setFilter: (f: 'auto' | 'pixelated') => { filter = f; localStorage.setItem('cs.filter', f); stage.layout(); },
  getSize: () => sizeMode, getFilter: () => filter,
  toggleOverlays: () => { const o = byId('overlays'); o.classList.toggle('hidden'); return o.classList.contains('hidden'); },
  // The active character's iframe goes fullscreen (its canvas fills it); the manager marks every
  // frame `allow="fullscreen"`. A refusal is told to the player rather than dropped.
  fullscreen: () => {
    const iframe = stage.sessions.active()?.iframe;
    if (!iframe) { notify('Open a character first.', 'error'); return; }
    Promise.resolve().then(() => iframe.requestFullscreen()).catch((err: unknown) => notify(`Fullscreen refused: ${(err as Error).message}`, 'error'));
  }
};

const settingsStore = createSettingsStore(createFirestoreBackend());

function contextFor(id: string): PluginContext {
  const schema = shell.manifests().find(m => m.id === id)?.settings ?? {};
  return {
    client: () => stage.sessions.active()?.hooks ?? null,
    settings: {
      get: <T,>(key: string) => (settingsStore.get(id)?.settings[key] ?? (schema[key]?.default as unknown)) as T,
      set: (key, value) => shell.setSetting(id, key, value),
      subscribe: () => () => {}
    },
    storage: {
      get: k => { try { return localStorage.getItem(`cs.pl.${id}.${k}`); } catch { return null; } },
      set: (k, v) => { try { localStorage.setItem(`cs.pl.${id}.${k}`, v); } catch { /* blocked */ } }
    },
    notify: (message, kind) => notify(message, kind === 'error' ? 'error' : 'info'),
    openPanel: (pid: string) => panelCtl.open(pid as PanelId),
    user: () => { const u = identity(); return u ? { uid: u.uid, gameName: stage.sessions.active()?.character.gameName ?? null } : null; }
  };
}

const shell = createShellRegistry({
  store: settingsStore,
  uid: () => identity()?.uid ?? null,
  contextFor,
  onIconStripChange: rebuildStrip,
  // Every open frame runs its own client-tier registry; a frame still booting is caught up by
  // the stage once its hooks appear.
  onClientToggle: (id, enabled, settings) => stage.toggleClientPlugin(id, enabled, settings as Record<string, unknown>),
  notify: (message, kind) => notify(message, kind === 'error' ? 'error' : 'info')
});

const hasSession = (): boolean => tasksRouter.current() !== null;
// The two windows over the stage, the bank (SP8b) and the trace pop-out (Task 16): both outlive
// the panel that opens them, and both are built in frame/stageWindows.ts (ruling R32). The trace
// follows the ACTIVE character (ruling R12), because the router drops a background run's events.
const windows = createStageWindows({
  bankHost: byId('bank-host'), traceHost: byId('trace-host'),
  store: bankStore, info: bankObjInfo, client: () => stage.sessions.active()?.hooks ?? null,
  api: () => tasksRouter.api, notify, closePanel: () => panelCtl.close()
});
tasksRouter.api.onEvent(e => windows.trace.push(e));
tasksRouter.onActiveChanged(() => windows.trace.close());
const openTrace = (runId: string, scriptName: string | null): void => { void windows.trace.open(runId, scriptName); };

// The character section of the Account panel, which is where the Characters panel went (G5).
const characterDeps: CharacterSectionDeps = {
  idToken: currentIdToken,
  isAnonymous: () => identity()?.isAnonymous ?? true,
  active: () => stage.sessions.active()?.character ?? null,
  stateOf: characterId => stage.sessions.get(characterId)?.state ?? null,
  // No roster rebuild here: the section reports every fresh listing through `onListChanged` before
  // an Open tab button for it can exist, and rebuilding from the home controller's cache would
  // resurrect a character the section had just deleted.
  openTab: c => stage.selectCharacter(c.id),
  // `stage.close` releases the session's trackers and script runtime, not just the iframe.
  closeTab: characterId => stage.close(characterId),
  onListChanged: (characters, limit) => stage.setCharacters(characters, limit),
  reauth: reauthEmail
};

// The strip, in one place: `frame/registerPanels.ts` owns the order, because strip order is
// registration order and a module body is not reachable from a unit test.
registerShellPanels(shell, {
  activeXp: stage.activeXp,
  activeLoot: stage.activeLoot,
  activeCanvas: stage.activeCanvas,
  tasks: {
    api: () => tasksRouter.api,
    hasSession, openTrace,
    onActiveChanged: tasksRouter.onActiveChanged,
    marketplace: { api: () => tasksRouter.api, hasSession, openPanel: (id: string) => panelCtl.open(id as PanelId) }
  },
  bank: { window: () => windows.bank, store: bankStore, closePanel: () => panelCtl.close() },
  // The Events feed reads the frame's bus and names the characters whose tabs are open.
  events: { bus: singletons.bus, characters: () => stage.sessions.list().map(s => s.character.gameName) },
  connect: () => createConnectPanel(deps),
  account: () => createAccountPanel({ ...deps, characters: characterDeps }),
  config: () => createConfigPanel(deps),
  plugins: () => createPluginsPanel(shell, id => settingsStore.get(id)?.settings ?? {} as SettingsValues)
});

// Rebuild the icon strip from enabled panel-bearing plugins, re-registering their views into
// panelCtl. The buttons, the two group separators and the bottom spacer are `buildStrip`'s, in
// ui/strip.ts beside the tab-list behaviour that reads them; this loop owns only the registration.
function rebuildStrip(enabledPanels: PluginManifest[]): void {
  const strip = byId('icon-strip');
  const openNow = panelCtl.current();
  for (const m of enabledPanels) {
    const pv = shell.panelFor(m.id);
    if (pv) panelCtl.register({ id: m.id as PanelId, name: m.name, icon: m.icon, tier: 'shell' }, pv);
  }
  strip.replaceChildren(...buildStrip(enabledPanels));
  stripA11y.syncSelected();
  pluginOverlayHost.replaceChildren(...shell.overlaysFor());
  if (openNow && enabledPanels.some(m => m.id === openNow)) panelCtl.open(openNow);
  copilotBar.refresh();
}

// The footer fps line reads whichever client is on screen. The id is held so a teardown stops it:
// audit C18 found both this and the health poll running forever with no handle on them.
const fpsTimer = setInterval(() => {
  const hooks = stage.sessions.active()?.hooks ?? null;
  byId('foot-right').textContent = hooks ? `fps ${hooks.getState().fps}` : '';
}, 1000);

/** Leaves the home screen for the frame and opens the chosen character's tab. */
async function enterFrame(characters: CharacterSummary[], chosen: CharacterSummary, created: boolean): Promise<void> {
  homeCtl.dismissConnect();
  state.set('playing');
  stage.setCharacters(characters);
  stage.layout();
  overlays.setStatus('starting…', 'muted');
  try {
    // `activate` also points the chrome at the tab (a returning player reads "press Login to play").
    await stage.activate(chosen.id);
    // The character the player just named goes straight in; a returning player presses the title
    // screen's Login button themselves (spec section 2, "First-login flow").
    if (created) {
      overlays.setStatus('connecting…', 'muted');
      const result = await stage.sessions.login(chosen.id);
      if (!result.ok) {
        setAccountError(result.reason);
        overlays.setStatus(`login failed (${result.code})`, 'error');
        panelCtl.open('account');
        return;
      }
    }
    setAccountError(null);
    const u = identity();
    byId('foot-left').textContent = u?.isAnonymous ? 'guest · attach an email to keep this character' : u?.email ?? '';
    panelCtl.restore();
  } catch (err) {
    setAccountError((err as Error).message);
    overlays.setStatus('session failed', 'error');
    // The manager dropped the session that failed to boot; the strip must say so.
    stage.renderTabs();
    panelCtl.open('account');
  }
}

let entered = false;
/**
 * Hands the session to the home controller at boot. Nothing signs in automatically: a visitor
 * stays signed out on the home screen until they choose a way in, and from there every
 * signed-in user is routed through the characters gate.
 */
function enterApp(): void {
  if (entered) return;
  entered = true;
  homeCtl.start();
}

// Audit C18: boot lives in web/src/boot.ts behind injected dependencies, because this file calls
// byId() at module scope fourteen times and cannot be imported under jsdom. The composition sits
// at the end because the watcher reads homeCtl, which is constructed above.
const offlineCard = byId('offline-card');
const offlineCount = byId('offline-count');
const healthWatcher = createHealthWatcher({
  health,
  onSnapshot: h => {
    // The one /health poll on the page. The frame singletons read the gateway field out of it
    // (the Claude panel's own 5s poll is gone with plan ruling R10), so a failed poll passes
    // through as null and leaves the last snapshot alone rather than claiming a change.
    singletons.onHealth(h);
    const down = h === null || h.engine === 'down';
    homeCtl.setPlayers({ engine: down ? 'down' : 'up', players: h?.players ?? null });
  },
  onCountdown: (down, secs) => {
    offlineCard.classList.toggle('hidden', !down);
    if (down) offlineCount.textContent = String(secs);
  }
});

void createBoot({
  watcher: healthWatcher,
  enterApp,
  onBootError: showBootError
}).run();

// Flush any debounced plugin-settings write before the page unloads, so a signed-in user's quick
// toggle-then-close is not lost inside the debounce window, and stop every interval this page armed,
// the co-pilot bar's 1 Hz tick and the stage's tab clock included (audit C18: each one has a handle
// and each handle is released here). Skipped on a bfcache freeze: see boot.ts's createPageHideHandler.
window.addEventListener('pagehide', createPageHideHandler({
  teardown: () => { clearInterval(fpsTimer); healthWatcher.stop(); singletons.dispose(); windows.dispose(); pinnedTracker.dispose(); copilotBar.dispose(); stage.dispose(); },
  flush: () => { void settingsStore.flush(); }
}));
