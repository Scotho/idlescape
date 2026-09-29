// Mirror of client/src/hooks/types.ts; keep identical.
//
// The client sources `BotAction` / `ActionResult` / `BotWorldState` from its own
// vendored copy of the rs-sdk bot module (`client/src/vendor/rs-sdk/bot/types.ts`);
// we source them from the vendored sdk copy (`src/vendor/rs-sdk/sdk/types.ts`),
// which is the same rs-sdk commit describing the same wire state. The two BotAction
// unions are identical; the sdk BotWorldState is the client's minus `menuActions`.
import type { BotAction, ActionResult, BotWorldState } from './vendor/rs-sdk/sdk/types';

export type { BotAction, ActionResult };

export type LoginResult = { ok: true } | { ok: false; code: number; reason: string };
export type ChatColour = 'orange' | 'white' | 'green' | 'red';

// ---- idlescape extras, published FLAT on WorldState (client/src/hooks/worldExtras.ts) ----

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

/** The vendored bot world state plus the idlescape-only extras (SP4 4.2). */
export type WorldState = BotWorldState & WorldExtras;

export interface ClientState {
  loggedIn: boolean;
  gameName: string | null;
  skills: { xp: number[]; level: number[] };
  inventory: { id: number; count: number }[];
  fps: number;
  rttMs: number | null;
  hp: { current: number; max: number };
  prayer: { current: number; max: number };
  energy: number;
  boosts: number[];
  /** Absolute world tile of the local player (0,0,0 before login). */
  position: { x: number; z: number; level: number };
  /** Selected sidebar tab (0-13); 3 = inventory. */
  activeTab: number;
  /** True once the 3D scene for the current region is built (the loading bar is gone). */
  sceneReady: boolean;
}

export interface XpEvent { skill: number; xp: number; level: number; delta: number }
export interface InventoryEvent {
  added: { id: number; count: number }[];
  removed: { id: number; count: number }[];
}

export type HookEvents = {
  login: { gameName: string };
  logout: Record<string, never>;
  disconnect: { code: number };
  xp: XpEvent;
  inventory: InventoryEvent;
  chat: { kind: 'game' | 'public' | 'private'; sender: string | null; text: string };
  tick: { cycle: number };
  /** One per server tick (PLAYER_INFO), not per client cycle. */
  state: { tick: number };
  action: { id: string; action: BotAction; result: ActionResult };
};

/** Static obj facts the web bank needs. Null for an id this pack has never heard of. */
export interface ObjInfo {
  name: string;
  /** Examine text, or null when the obj has none. */
  examine: string | null;
  /** ObjType.cost. The engine's `sort by value` is max(floor(cost * 6 / 10), 1). */
  cost: number;
  stackable: boolean;
  /** True for a bank note (certtemplate !== -1); notes are their own obj ids. */
  noted: boolean;
}

export interface ClientHooks {
  login(gameName: string, secret: string): Promise<LoginResult>;
  logout(): void;
  /** Stores credentials for the title screen's Login button. Does not log in. */
  armLogin(gameName: string, secret: string, label?: string): void;
  /** Runs the login the parent armed with `armLogin`; same result contract as `login`. */
  loginArmed(): Promise<LoginResult>;
  /** Skips `mainredraw()` while true; resuming forces a full repaint. */
  setRenderSuspended(suspended: boolean): void;
  /** Suppresses the client's own 90 s idle-logout packet while true. */
  setAttended(attended: boolean): void;
  echoChat(text: string, colour?: ChatColour): void;
  getState(): ClientState;
  getObjName(id: number): string | null;
  /** 32x32 PNG data URL of the inventory sprite, or null (unknown id, or model not streamed yet). */
  getObjIcon(id: number, count?: number): string | null;
  getObjInfo(id: number): ObjInfo | null;
  getWorldState(): WorldState;
  dispatch(action: BotAction): Promise<ActionResult>;
  /**
   * Drop every queued bot action. The action already executing is kept as a quiescence
   * barrier (`BotActionQueue.beginGeneration`), so this means "nothing new starts and the
   * caller stops waiting", not "the client forgets what it is doing". Callers must re-read
   * the world state afterwards rather than assume it is untouched.
   */
  cancelAll(): void;
  on<E extends keyof HookEvents>(event: E, handler: (payload: HookEvents[E]) => void): () => void;
}

// Calling surface the web shell needs against the client's plugin registry (client/src/plugins/registry.ts).
export interface ClientPluginRegistry {
  register(plugin: unknown): void;
  enable(id: string, settings?: Record<string, unknown>): Promise<void>;
  disable(id: string): void;
  isEnabled(id: string): boolean;
}

// The one namespace the page publishes for everything outside the module graph — the client
// bundle's hooks and plugin registry, and (SP4a Task 10) the script-runtime api Playwright and
// the tab socket drive. Type-only import so `tasks/api.ts` importing back here stays erased.
declare global {
  interface Window {
    idlescape?: {
      client?: ClientHooks;
      plugins?: ClientPluginRegistry;
      tasks?: import('./tasks/api').TasksApi;
    };
  }
}
