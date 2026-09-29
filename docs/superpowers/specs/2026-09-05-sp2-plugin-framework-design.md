# Idlescape — SP2: Plugin framework and Tier 1 plugins

Date: 2026-09-05
Status: approved 2026-09-05. **Amended 2026-09-07 (decision D18): the client plugin tier described
in section 3 and built out in section 4 is dormant for the Dragon Slayer sprint.** SP2b-1's registry
shipped and nothing consumes it: no `tier: 'client'` manifest exists outside two test fixtures, the
frame capability behind it (`_fireBeforeDraw` / `_fireAfterDraw`) is a known stub, the GPU renderer
that justified the tier was never built, and SP5 (sprint entry 17) plans against the scene and menu
halves only. SP2b-2 and the `advanced-controls` plugin are candidates for the after-sprint row, not
commitments. Also note that of the nine Tier 1 plugins in section 5, five exist: `xp-tracker`,
`loot-tracker`, `status-hud`, `notes` and `screenshot`.
Scope: turn the SP1 side panel into a RuneLite-style plugin system with two tiers, persist
per-user plugin settings, and ship the first set of plugins, the GPU renderer among them.
Depends on SP1b (revision 274) and SP1 Task 14 (client host in the shell).

## 1. Goals and non-goals

Goals

- A player opens the Plugins panel, sees a list with toggles and a gear per plugin, enables
  the GPU renderer, and the game re-renders through WebGL without a page reload.
- Plugin authors (us, later contributors) add a plugin by adding one directory with a
  manifest, without touching the frame.
- Settings follow the user across devices (Firestore) and work offline (localStorage).
- The Tier 1 plugins listed in section 5 ship, each small and independently testable.

Non-goals

- Plugins that need world-to-screen projection or menu interception (SP5).
- Third-party plugin loading from URLs (later; the manifest shape allows it).
- The agent's Tasks and Claude panels (SP4), though they are plugins in this framework.

## 2. Approaches considered

1. Shell-only plugins: panels and DOM overlays over the canvas using the public hooks API.
   Cheap, but cannot swap the renderer or read the scene.
2. Two tiers, shell plugins plus client plugins compiled into the client bundle with a
   capability object. Slightly more plumbing; covers everything on the roadmap. Chosen.
3. Fork rs-sdk's client wholesale. Rejected: bot-first UI and gameplay patches we do not want.

## 3. Architecture

```
web/src/plugins/                 shell tier (Vite, runs in the page)
  registry.ts                    PluginRegistry: manifests, enable/disable, settings
  types.ts                       PluginManifest, PluginContext, SettingSchema
  settings.ts                    Firestore users/{uid}/plugins/{id} + localStorage mirror
  <plugin-id>/index.ts           export default definePlugin({...})
client/src/plugins/              client tier (compiled into client.js)
  registry.ts                    ClientPluginRegistry, exposed at window.idlescape.plugins
  capability.ts                  ClientCapability: renderer, scene, menu, draw hooks
  <plugin-id>/index.ts
```

### 3.1 Manifest and lifecycle

```ts
interface PluginManifest {
  id: string;                 // kebab-case, stable, used in Firestore paths
  name: string;
  icon: string;               // sprite id or inline svg name
  tier: 'shell' | 'client';
  description: string;
  settings?: SettingSchema;   // typed fields: boolean, number(min,max,step), select, color, text
  defaultEnabled?: boolean;
  requires?: string[];        // other plugin ids that must be enabled
}

interface ShellPlugin {
  manifest: PluginManifest;
  onEnable(ctx: PluginContext): void | Promise<void>;
  onDisable(): void;
  panel?: (ctx: PluginContext) => HTMLElement;     // side panel body when its icon is active
  overlay?: (ctx: PluginContext) => HTMLElement;   // absolutely positioned over the canvas
  onTick?(cycle: number): void;                    // from the hooks tick event
}
```

`PluginContext` gives a shell plugin: `client` (the SP1 `ClientHooks`), `settings` (typed get,
set, subscribe), `storage` (namespaced localStorage), `notify` (toast and browser
notification), `openPanel(id)`, `user` (uid, gameName), and in SP4 `agent`.

Client plugins declare the same manifest with `tier: 'client'`. Their lifecycle runs inside the
client bundle and receives `ClientCapability`:

```ts
interface ClientCapability {
  renderer: { set(mode: 'software' | 'webgl' | 'webgpu'): Promise<void>; current(): string };
  frame: { onBeforeDraw(cb): Unsub; onAfterDraw(cb): Unsub };     // per client frame
  scene: { project(x, z, level, height): { sx, sy } | null };       // SP5 fills; stub here
  menu: { onBuild(cb): Unsub };                                     // SP5 fills; stub here
  state: () => ClientState;                                         // same as hooks
}
```

The shell toggles client plugins through `window.idlescape.plugins.enable(id, settings)` and
`disable(id)`, dispatched by the shell registry when the user flips the toggle. The two
registries never import each other; the shell is the source of truth for enabled state and
settings, and the client registry is a slave that receives commands. The client bundle stays
usable without the shell (upstream behaviour) when no command arrives.

### 3.2 Settings persistence

Firestore `users/{uid}/plugins/{pluginId}` = `{ enabled: boolean, settings: {...}, updatedAt }`.
Rules: read and write own documents only; `settings` values limited to primitives and short
strings; document size under 8 KB. The shell writes localStorage first, then Firestore with
debounce; on load it uses Firestore if present, else localStorage, else manifest defaults.
Guests get the same treatment; their documents live under their anonymous uid, which is why the
Account panel keeps nudging them to attach an email.

### 3.3 Plugins panel

Replaces the gear's role from SP1's Configuration panel for plugin matters. List with search,
toggle, gear (opens the plugin's settings form rendered from `SettingSchema`), and a short
description. Configuration keeps canvas size, filter, fullscreen, hide overlays. The icon strip
shows only enabled plugins that expose a `panel`.

### 3.4 Generated data

Quest steps, XP tables, item names and skill method rates are produced from the Content pack by
`scripts/gen/*.ts` (Bun) reading `engine/content` configs and RuneScript sources, and committed
under `web/src/data/`. No data is copied from third-party projects (see `CREDITS.md`).

## 4. GPU renderer plugin (first client-tier plugin)

**Dormant for this sprint (decision D18).** Nothing below was built beyond SP2b-1's registry; the
spike findings in `2026-09-05-sp2b-gpu-spike-findings.md` revised the approach and the port never
ran. Read this section as a design on the shelf, not as a description of the tree.

Source: Client-TS branch `225-gpu` (17 commits, 41 files). It introduces
`graphics/renderer/Renderer.ts`, a static facade with `startFrame`, `endFrame`,
`renderPixMap`, `fillTriangle`, `fillGouraudTriangle`, `fillTexturedTriangle`, `resize`,
`setBrightness`, `resetRenderer`, and back ends `webgl/RendererWebGL.ts`,
`webgl/RendererWebGLC.ts`, `webgpu/RendererWebGPU.ts` with shaders, plus a
requestAnimationFrame main loop in `GameShell` and hooks in `Pix2D`, `Pix3D`, `PixMap`,
`Model`, `World3D`, `NpcEntity`, `PlayerEntity`, `Canvas`, `JsUtil`.

Plan:

1. Port the branch onto the 274 client as a series of commits mirroring upstream's order.
   Expect conflicts in `World3D.ts`, `Model.ts`, `Pix3D.ts` (dash3d changed in 49 files
   between 225 and 274). Keep the software path byte-identical when the renderer is unset:
   every facade call returns `false` and the caller falls through to the existing code, which
   is how the branch is written.
2. Wrap it as client plugin `gpu-renderer` with settings `mode: select(webgl, webgpu)`,
   `fps-cap: number`, `show-fps: boolean`. `onEnable` creates the renderer on a new canvas
   copied from the software canvas's style; `onDisable` calls `resetRenderer`. Mode switch
   goes through disable then enable.
3. Feature-detect: hide `webgpu` when `navigator.gpu` is absent; if WebGL context creation
   fails, revert to software and surface a toast.
4. Acceptance: Tutorial Island renders identically in software and WebGL at 1x, 2x and auto;
   FPS at least doubles at 2x on the dev machine; toggling ten times leaks no canvases.

## 5. Tier 1 plugins

| id | Tier | Panel | Overlay | Data source | Notes |
|---|---|---|---|---|---|
| `gpu-renderer` | client | settings only | none | — | Section 4 |
| `xp-tracker` | shell | per-skill rows: gained, xp/h, time to level, actions to level | xp/h line top-left | hooks `xp`, XP table from `scripts/gen/xp.ts` | Evolves SP1 Task 13's panel. Actions to level uses the last observed per-action delta. Reset session and reset rates. Emits snapshots for SP3. |
| `status-hud` | shell | settings | HP, prayer, energy bars with numbers, boost countdown | `ClientState` extended with `hp`, `prayer`, `energy`, `boosts` (Task: add to hooks, diffing `statLevel` versus `statBaseLevel`) | LostXP HUD idea, RuneLite Boosts idea |
| `loot-tracker` | shell | grouped by session, item icon, count, first seen | none | hooks `inventory` added events; ground pickup detection via inventory delta while `pickup` menu action was last used (SP5 refines with kill attribution) | Evolves Task 13's panel |
| `quest-helper` | shell | quest list with progress from varps, expandable steps, requirements, items needed | none | `scripts/gen/quests.ts` from Content quest scripts and varp configs, hand-edited step text under `web/src/data/quests/*.md` | RuneLite hub number 1. Text-only in SP2; SP5 adds tile hints. |
| `skill-calc` | shell | skill select, current and target level or XP, method table with actions needed | none | `scripts/gen/skill-methods.ts` from Content (xp per action from scripts) | 2004scape-extension idea, data regenerated |
| `hiscores` | shell | name lookup, rank/level/xp per skill, link to player page | none | SP3 API | Lands with SP3; framework slot reserved |
| `notes` | shell | textarea persisted per user | none | settings storage | LostKit idea |
| `screenshot` | shell | button, history of last 10 thumbnails | none | canvas `toBlob`; download via the browser | LostKit idea. Also used by SP4 for agent screenshots. |

Each plugin is one directory with `index.ts`, `panel.ts` (if any), `overlay.ts` (if any),
`*.test.ts`, under 400 lines per file. Overlays render into the SP1 overlay layer and scale
with the canvas.

## 6. Extension points reserved for later sub-projects

- SP3: `xp-tracker` calls `ctx.snapshots.push(reason)`; the shell forwards to
  `POST /api/tracker/snapshot`.
- Entry-screen spec (SP1 Task 13b): the Claude Connection panel is default plugin
  `claude-connection`, always in the icon strip directly under the `claude` icon, not
  toggleable off. The Plugins panel lists it as "always on".
- SP4: `ctx.agent` (tab link state, `runTask`, `say`), plugins `tasks` and `claude`.
- SP5: `ClientCapability.scene.project` and `menu.onBuild` implemented; plugins
  `tile-markers`, `npc-highlight`, `idle-notifier`, `shortest-path`, `menu-swapper`,
  `world-map`.

## 7. Testing

- Unit: registry enable/disable ordering with `requires`; settings merge precedence;
  `SettingSchema` form rendering; each plugin's pure logic (xp/h maths, quest progress from
  varps, calculator arithmetic) with fixtures.
- Browser (Playwright, extends Task 14): enable `gpu-renderer`, assert a WebGL canvas exists
  and the software canvas is hidden; toggle off, assert reverse; `xp-tracker` shows a row after
  the first XP drop on Tutorial Island; settings survive a reload.
- Visual: screenshot comparison software versus WebGL at the title screen and on Tutorial
  Island, tolerance for dithering.

## 8. Risks

- The GPU port is the long pole. Time-box the first attempt; if conflicts in dash3d exceed a
  day, land the facade and WebGL only and defer WebGPU.
- Quest step text is manual work; ship the six free quests first and mark the rest as
  "steps pending" in the panel.
