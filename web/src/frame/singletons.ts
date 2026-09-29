// web/src/frame/singletons.ts -- everything in the shell that outlives a panel.
//
// Three of these were owned by a surface that opens and closes (plan ruling R10): the agentTokens
// subscription lived in the Claude panel's mount(), the bank store was started by the bank WINDOW,
// and the /health poll ran only while the Claude panel was open. An append-only feed fed by
// producers that run only while the player is looking at them has a hole in the middle of every
// session, and the co-pilot bar needs the pairing truth with the panel shut.
//
// The health poll did not move HERE: main.ts has run one since audit C18 (boot.ts's
// createHealthWatcher, 1000ms, stopped on pagehide), and a second interval against one endpoint
// is not a fix for a poll that stopped. This module takes its snapshots through onHealth().
//
// It also keeps main.ts under the 400-line ceiling: this task and Tasks 13, 14, 16 and 19 all add
// frame-lifetime state, and main.ts is the composition root, not a place to keep it.
import { createBankApi } from '../bank/api';
import { createBankStream } from '../bank/stream';
import { createBankStore, type BankStore } from '../bank/store';
import { createEventBus, type EventBus } from './events';
import { bankProducer, gatewayProducer, pairingProducer } from './eventProducers';
import { createPairingStore, type PairingStore } from './pairing';
import type { ObjInfo } from '../clientTypes';
import type { HealthSnapshot } from '../types';

export interface FrameSingletonDeps {
  /** Static obj facts for the bank store, read from whichever character frame is in front. */
  info(obj: number): ObjInfo | null;
  notify(message: string, kind?: 'info' | 'error'): void;
  /** A fresh Firebase id token for the bank api and its event stream. */
  idToken(): Promise<string>;
  /** Testing seams: no Firestore, no network, no real bank. */
  createBank?(): BankStore;
  createPairing?(): PairingStore;
}

export interface FrameSingletons {
  bus: EventBus;
  pairing: PairingStore;
  bank: BankStore;
  /** The last /health snapshot, or null before the first one lands. */
  health(): HealthSnapshot | null;
  /**
   * One /health snapshot, from the page-lifetime watcher main.ts already runs (boot.ts's
   * createHealthWatcher, every 1000ms). Null is a poll that failed, and keeps the last snapshot
   * rather than claiming a change. This is an entry point rather than a second interval of our
   * own: the Claude panel's old 5s poll was a THIRD request for a snapshot the shell already had,
   * and the gateway event now lands a second after the gateway comes up instead of five.
   */
  onHealth(snapshot: HealthSnapshot | null): void;
  /** Starts the pairing store and the bank store, and their producers, for one account. */
  start(uid: string): void;
  /** Reverses both stores and all three producers, exactly once each. What sign-out calls. */
  stop(): void;
  /** stop(), plus the bus itself. What the page teardown calls, and it does not come back. */
  dispose(): void;
}

export function createFrameSingletons(deps: FrameSingletonDeps): FrameSingletons {
  const bus = createEventBus();
  const pairing = (deps.createPairing ?? createPairingStore)();
  const bank = (deps.createBank ?? (() => createBankStore({
    api: createBankApi({ idToken: deps.idToken }),
    createStream: handlers => createBankStream({ idToken: deps.idToken, ...handlers }),
    info: deps.info,
    notify: deps.notify
  })))();

  // Page-lifetime, not account-lifetime: /health says what the SERVER is doing and the watcher
  // that feeds it runs from boot to pagehide, so a sign-out does not make it unknown again.
  let snapshot: HealthSnapshot | null = null;
  let started = false;
  let disposed = false;
  /** The pairing and bank producers, attached for exactly as long as their stores run. */
  let unproduce: (() => void)[] = [];
  /** The gateway producer, fed by onHealth() below rather than by a subscription of its own. */
  let onGateway: ((gateway: HealthSnapshot['gateway']) => void) | null = null;

  function stop(): void {
    if (!started) return;
    started = false;
    for (const off of unproduce) off();
    unproduce = [];
    onGateway = null;
    pairing.stop();
    bank.stop();
  }

  return {
    bus,
    pairing,
    bank,
    health: () => snapshot,
    onHealth(next) {
      if (next === null) return;
      snapshot = next;
      // Null until start(), so nothing announces a gateway to a page with nobody signed in.
      onGateway?.(next.gateway);
    },
    start(uid) {
      // dispose() is the end of the page, not a pause: the bus it feeds is fenced, so starting
      // over here would leave a Firestore listener and an SSE stream running for nobody.
      if (disposed) return;
      // A second account in the same page is a stop and a start, never two live listeners.
      stop();
      started = true;
      // Attached BEFORE the stores are started, so each producer sees the first snapshot and
      // takes it as its baseline: a page load is not three pairings and a bank change.
      unproduce = [pairingProducer(bus, pairing), bankProducer(bus, bank)];
      onGateway = gatewayProducer(bus);
      pairing.start(uid);
      bank.start();
    },
    stop,
    dispose() { stop(); disposed = true; bus.dispose(); }
  };
}
