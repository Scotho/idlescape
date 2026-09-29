import { BotActionQueue } from '#/vendor/rs-sdk/bot/ActionQueue.js';
import { collectWorldExtras } from './worldExtras';
import type { ActionResult, BotAction, HookBridge, HookEvents, WorldState } from './types';
import type { Emitter } from './emitter';

export interface WorldHooks {
  getWorldState(): WorldState;
  dispatch(action: BotAction): Promise<ActionResult>;
  cancelAll(): void;
}

export function createWorldHooks(bridge: HookBridge, emitter: Emitter<HookEvents>): WorldHooks {
  const queue = new BotActionQueue();
  // One collect per client cycle: the vendored collector walks the whole scene,
  // and every caller in a cycle must see the same snapshot. The snapshot is stamped
  // with the *server* tick (`w.tick()`), which is what the collector's own expiry
  // windows are measured in — `w.cycle()` only keys the cache. Note the snapshot's
  // player position trails by one server tick — `onGameTickCallback()` fires as
  // the first statement of the PLAYER_INFO handler (patch 20), before
  // `getPlayerPos()` has applied this tick's movement.
  let cached: { cycle: number; state: WorldState } | null = null;
  let seq = 0;

  function getWorldState(): WorldState {
    const w = bridge.world();
    const cycle = w.cycle();
    if (cached && cached.cycle === cycle) return cached.state;
    const tick = w.tick();
    // `revision` is stamped with the server tick rather than left as the collector wrote it.
    // `collectState(tick)` takes the `publish = false` path, which never advances the collector's
    // own `publicationRevision`, so the field reads 0 for the life of the session — consumers
    // that treat it as "which snapshot is this" (the Worker host's de-duplication, the SDK's
    // `revision ?? tick` event baselines) saw one frozen value and never moved. The tick is the
    // monotonic publication counter here: one `state` hook event per PLAYER_INFO packet.
    const state = {
      ...w.collector.collectState(tick), ...collectWorldExtras(w.extras), revision: tick
    } as WorldState;
    cached = { cycle, state };
    return state;
  }

  async function dispatch(action: BotAction): Promise<ActionResult> {
    const id = `a${++seq}`;
    const entry = queue.enqueue({ action, actionId: id });
    if (!entry) return { success: false, message: 'action queue full', reason: 'busy' };
    // Wait for our turn. Test `queue.active`, not `startNext()`'s return value:
    // any waiter's poll may be the one that promotes the head of the queue, and
    // the promoted entry's own poll must still recognise that it is now active.
    while (queue.active !== entry) {
      queue.startNext();
      if (queue.active === entry) break;
      // cancelAll() bumps the generation; strand nothing on a cancelled queue.
      if (!queue.isCurrentGeneration(entry)) return { success: false, message: 'action cancelled', reason: 'cancelled' };
      await new Promise(r => setTimeout(r, 20));
    }
    try {
      const result = await bridge.world().executor.execute(action);
      emitter.emit('action', { id, action, result });
      return result;
    } finally { queue.complete(entry); }
  }

  /**
   * Human input cancels queued work (SP4 4.4). `beginGeneration()`, not `clear()`:
   * it drops everything still pending but keeps the in-flight action as a quiescence
   * barrier, so the next dispatch cannot run alongside an action that is still going.
   * Cancelling the in-flight action itself is not possible here — the executor's promise
   * is not abortable — and is deferred to the Transport layer.
   */
  function cancelAll(): void { queue.beginGeneration(); }

  return { getWorldState, dispatch, cancelAll };
}
