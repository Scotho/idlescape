// web/src/sessions/wire.ts -- everything the shell subscribes to per character.
//
// SP6 wired one `hooks` once; with one client per character the XP tracker, the loot log and the
// hook subscriptions are keyed by character id, and only the *active* session is allowed to write
// the shared chrome (the overlay status line, the XP line and the title bar).
import { siteLabel } from '../frame/siteLabel';
import type { InventoryEvent, XpEvent } from '../clientTypes';
import type { createLootLog } from '../stats/loot';
import type { createXpTracker } from '../stats/xp';
import type { CharacterSession } from './types';

export interface SessionWiringDeps {
  xpFor(characterId: string): ReturnType<typeof createXpTracker>;
  lootFor(characterId: string): ReturnType<typeof createLootLog>;
  isActive(characterId: string): boolean;
  setXpLine(text: string | null): void;
  setStatus(text: string, tone: 'muted' | 'error'): void;
  setTitle(text: string): void;
  /**
   * The frame's event producers (frame/eventProducers.ts), as callbacks rather than as the bus
   * itself: wireSession stays a unit with no frame in it, and frame/stage.ts supplies them from
   * the bus it is handed. Both are optional, so a session wired without a feed still works.
   */
  onXp?(ev: XpEvent): void;
  onLoot?(ev: InventoryEvent): void;
  now?(): number;
}

/** Subscribes one session's hooks; the returned function detaches every handler. */
export function wireSession(session: CharacterSession, deps: SessionWiringDeps): () => void {
  const hooks = session.hooks;
  if (!hooks) return () => {};
  const now = deps.now ?? (() => Date.now());
  const id = session.id;
  // Resolved once, up front: a wired session owns its trackers from the moment its tab exists,
  // so the XP and loot panels find an empty tracker for it rather than none at all.
  const tracker = deps.xpFor(id);
  const loot = deps.lootFor(id);
  const offs = [
    hooks.on('xp', ev => {
      // The producer runs BEFORE the tracker, not after: the level-up half of it reads the level
      // this skill was last seen at, and onXp has already overwritten that by the line below.
      deps.onXp?.(ev);
      tracker.onXp(ev, now());
      if (!deps.isActive(id)) return;
      const [top] = tracker.rows(now());
      deps.setXpLine(top ? `${top.name} · ${top.perHour.toLocaleString()} xp/h` : null);
    }),
    hooks.on('inventory', ev => { deps.onLoot?.(ev); loot.onInventory(ev, now()); }),
    hooks.on('login', ev => {
      if (!deps.isActive(id)) return;
      // The login edge CLEARS the status line and says nothing about pairing. It used to write
      // the literal 'not paired' pill, which the canvas now takes from the pairing store instead
      // (plan ruling R6); clearing rather than deleting the write is what still retires
      // main.ts's `connecting...` line, since syncChrome only runs on a tab switch or a close.
      deps.setStatus('', 'muted');
      deps.setTitle(siteLabel(ev.gameName));
    }),
    hooks.on('logout', () => {
      if (!deps.isActive(id)) return;
      deps.setStatus('logged out', 'muted');
      deps.setTitle('');
    }),
    hooks.on('disconnect', () => {
      if (!deps.isActive(id)) return;
      deps.setStatus('reconnecting…', 'error');
    })
  ];
  return () => { for (const off of offs) off(); };
}
