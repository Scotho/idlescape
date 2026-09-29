import type { BotAction, BotWorldState } from '#/vendor/rs-sdk/bot/types.js';
import type { ActionExecutor, ActionResult } from '#/vendor/rs-sdk/bot/ActionExecutor.js';
import type { BotStateCollector } from '#/vendor/rs-sdk/bot/StateCollector.js';
import type { ClientExtrasBridge, WorldExtras } from './worldExtras';

export type { BotAction, ActionResult, WorldExtras };

/** The vendored bot world state plus the idlescape-only extras (SP4 4.2). */
export type WorldState = BotWorldState & WorldExtras;

export type LoginResult = { ok: true } | { ok: false; code: number; reason: string };
export type ChatColour = 'orange' | 'white' | 'green' | 'red';

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

/** Closures the Client class provides; keeps its private fields private. */
export interface HookBridge {
  login(gameName: string, secret: string): Promise<LoginResult>;
  armLogin(gameName: string, secret: string, label: string): void;
  loginArmed(): Promise<LoginResult>;
  setRenderSuspended(suspended: boolean): void;
  setAttended(attended: boolean): void;
  logout(): void;
  addChat(type: number, text: string, sender: string): void;
  getState(): ClientState;
  getObjName(id: number): string | null;
  /** 32x32 PNG data URL of the inventory sprite, or null (unknown id, or model not streamed yet). */
  getObjIcon(id: number, count: number): string | null;
  getObjInfo(id: number): ObjInfo | null;
  world(): WorldBridge;
}

/**
 * The vendored bot module, wired to the live client (Client.ts patch 21).
 * `Pick<...>` rather than the classes themselves: the real `BotStateCollector` /
 * `ActionExecutor` instances satisfy it, and it states exactly what `world.ts` may use.
 */
export interface WorldBridge {
  collector: Pick<BotStateCollector, 'collectState'>;
  executor: Pick<ActionExecutor, 'execute'>;
  extras: ClientExtrasBridge;
  /** Monotonic server-tick count (one per PLAYER_INFO). What the collector stamps on events. */
  tick(): number;
  /** Client cycles (~20ms). Only the `getWorldState()` snapshot cache uses it. */
  cycle(): number;
}

export const CHAT_COLOUR_TAG: Record<ChatColour, string> = {
  orange: '@or1@',
  white: '@whi@',
  green: '@gre@',
  red: '@red@'
};

/** Interface component id of the player inventory (content pack: 3214 = inventory:inv). */
export const INVENTORY_COM_ID = 3214;
