// Request/response framing over `postMessage`: both sides of the Worker boundary are
// one-way message ports, so every call that needs an answer carries a `callId` the
// other side echoes back. Deliberately transport-agnostic — the caller supplies the
// `send` function and builds its own message shape around the id.

export interface Pending<T> {
  resolve: (v: T) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface RpcClient<Req, Res> {
  /** Send a request built around a fresh call id; resolves when `settle` names that id. */
  call(make: (callId: string) => Req, timeoutMs?: number): Promise<Res>;
  /** Deliver a reply. Returns false when the id is unknown (late reply after a timeout). */
  settle(callId: string, ok: boolean, value: Res | undefined, error?: string): boolean;
  /** Fail everything outstanding — the Worker died, or the run was stopped. */
  rejectAll(reason: string): void;
  readonly size: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export function createRpcClient<Req, Res>(
  send: (m: Req) => void,
  opts: { timeoutMs?: number } = {}
): RpcClient<Req, Res> {
  const pending = new Map<string, Pending<Res>>();
  let n = 0;

  return {
    call(make, timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS) {
      const callId = `c${++n}`;
      return new Promise<Res>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(callId);
          reject(new Error(`rpc ${callId} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        pending.set(callId, { resolve, reject, timer });
        send(make(callId));
      });
    },
    settle(callId, ok, value, error) {
      const p = pending.get(callId);
      if (!p) return false;
      clearTimeout(p.timer);
      pending.delete(callId);
      if (ok) p.resolve(value as Res);
      else p.reject(new Error(error ?? 'rpc failed'));
      return true;
    },
    rejectAll(reason) {
      for (const [id, p] of pending) {
        clearTimeout(p.timer);
        pending.delete(id);
        p.reject(new Error(reason));
      }
    },
    get size() {
      return pending.size;
    }
  };
}
