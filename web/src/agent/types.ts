// The agent runtime's boundary with the game. Everything above this file (the SDK,
// the executor, the panels) talks to a `Transport`; only `localTransport.ts` knows
// that today's game is a client in the same document (SP7 moves it into an iframe,
// SP-later behind a socket — both are new Transport implementations, not edits here).
import type { BotAction, ActionResult, WorldState, ChatColour, HookEvents } from '../clientTypes';
// Type-only, so the cycle with `tasks/types.ts` (which imports WorldState from here) is erased.
import type {
  Actor, BehaviourSettings, ParamValues, PauseReason, RunOutcome, RunStatus, RunSummary, ScriptManifest, TraceEvent
} from '../tasks/types';
import type { RunStatusLite } from '../tasks/runner';

export type { BotAction, ActionResult, WorldState };

export type Unsub = () => void;

/** A hook event as a discriminated union, so `onEvent` can hand out one callback. */
export type HookEvent = { [K in keyof HookEvents]: { name: K; payload: HookEvents[K] } }[keyof HookEvents];

export interface Transport {
  /** Latest tick snapshot, synchronously. Null before the first state arrives. */
  getState(): WorldState | null;
  onState(cb: (s: WorldState) => void): Unsub;
  onEvent(cb: (e: HookEvent) => void): Unsub;
  /**
   * Send one action and wait for the client's result.
   *
   * A timeout resolves `{ success: false, reason: 'timeout' }` but does NOT cancel the
   * action: the client's queue keeps running it, and it may still complete (or fail)
   * afterwards. Callers must not retry blindly on a timeout; re-read the world state and
   * decide. To stop waiting on everything at once, see `cancel` below.
   */
  dispatch(action: BotAction, timeoutMs?: number): Promise<ActionResult>;
  /**
   * Stop waiting on everything in flight. Drains the client's queued actions and settles every
   * outstanding `dispatch` with `{ success: false, reason: 'cancelled' }`; the action already
   * executing runs to completion inside the client, so a caller must re-read the world rather
   * than assume nothing moved.
   */
  cancel(): void;
  say(text: string): Promise<ActionResult>;
  echo(text: string, colour?: ChatColour): void;
  screenshot(): Promise<Blob>;
  /**
   * Log this character back in through the SP7 armed credentials. The session manager owns the
   * flow (it refuses a second login while one is in flight and reports success for a session
   * that is already online), so the transport only forwards.
   *
   * Deliberately absent from `ScriptContext`: a recovery may log the account back in, a script
   * may not log it in and out.
   */
  relogin(): Promise<{ ok: boolean; reason?: string }>;
  /**
   * Log this character out, for the `logout` and `loot-and-logout` endings. Fire and forget: the
   * client's own logout packet is the whole of it, and there is nothing to wait for.
   *
   * Deliberately absent from `ScriptContext` for the same reason as `relogin`: a recovery may end
   * the session, a script may not log the account in and out.
   */
  logout(): void;
  /** Fires when a human touches the game canvas — the run loop yields to them. */
  humanInput(cb: () => void): Unsub;
}

// ---- Worker protocol (SP4a Task 7) -------------------------------------------------
// Script code runs only inside `worker.ts` (spec section 3), so every interaction with
// the game crosses `postMessage` as one of these two unions: the host pushes world
// state, hook events and run control down; the Worker asks for actions and reports
// trace, status and results back.
/** What to run: a bundled library script by id, or user code compiled in the Worker. */
export type ScriptRef = { kind: 'library'; id: string } | { kind: 'user'; code: string };

/** Transport methods the Worker can ask the main thread to perform on its behalf. */
export type RpcMethod = 'dispatch' | 'say' | 'echo' | 'screenshot' | 'relogin' | 'logout';

/**
 * A `Blob` cannot survive `postMessage` from a context that may be torn down mid-flight,
 * and transferring the buffer avoids a copy; the Worker rebuilds the Blob from this.
 */
export interface TransferredBlob { __blob: true; type: string; buffer: ArrayBuffer }

export type MainToWorker =
  | { t: 'state'; state: WorldState }
  | { t: 'event'; event: HookEvent }
  | { t: 'human_input' }
  | { t: 'run'; runId: string; scriptRef: ScriptRef; params: ParamValues; startedBy: Actor; characterId: string | null; characterName: string | null; behaviour: BehaviourSettings }
  | { t: 'execute'; callId: string; code: string; params: ParamValues }
  | { t: 'pause'; reason: PauseReason; by: Actor }
  | { t: 'resume'; by: Actor }
  | { t: 'stop'; by: Actor }
  | { t: 'rpc_result'; callId: string; ok: boolean; value?: unknown; error?: string }
  | { t: 'compile'; callId: string; code: string };

/**
 * The runner's own status, plus the identity the panels label it with and the three live fields
 * only the Worker can fill. Those three are picked off `RunStatus` rather than restated so the
 * two shapes cannot drift; they are deliberately NOT on `RunStatusLite`, because the runner
 * produces that and can see neither the health monitor nor the trace.
 */
export type WorkerStatus = RunStatusLite & Pick<RunStatus, 'target' | 'health' | 'xpPerHour'> & {
  runId: string | null; scriptId: string | null; scriptName: string | null; statusLine: string;
};

export type WorkerToMain =
  | { t: 'ready' }
  | { t: 'rpc'; callId: string; target: 'transport'; method: RpcMethod; args: unknown[] }
  | { t: 'trace'; event: TraceEvent }
  | { t: 'status'; status: WorkerStatus }
  | { t: 'run_end'; runId: string; outcome: RunOutcome; summary: RunSummary }
  | { t: 'execute_result'; callId: string; ok: boolean; value?: unknown; error?: string; logs: string[] }
  | { t: 'compile_result'; callId: string; ok: boolean; manifest?: ScriptManifest; message?: string; line?: number }
  | { t: 'resume_result'; ok: boolean; reason?: 'paused_by_player' | 'not_paused' }
  /** The Worker aborted a task: drain the client queue on its behalf (plan ruling R3). */
  | { t: 'cancel' };
