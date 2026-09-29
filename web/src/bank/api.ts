// web/src/bank/api.ts -- the two routes the browser is allowed to call.
// Reordering is the ONLY thing the browser may change: server/src/bank/routes.ts answers 403
// layout_only to a delta op, and Contracts moves items server-side through the management
// client instead. Nothing here ever builds a delta.
import { MAX_OPS_PER_BATCH, type BankOp, type BankSnapshot } from './types';

export type OpsResult =
  | { ok: true; version: number }
  /** 409: the server hands back the version it actually holds. Refetch at it and re-issue. */
  | { ok: false; kind: 'conflict'; version: number }
  /** Anything else, already turned into player-facing copy. */
  | { ok: false; kind: 'error'; message: string };

export interface BankApi {
  get(): Promise<BankSnapshot>;
  ops(expectedVersion: number, ops: BankOp[]): Promise<OpsResult>;
}

const UNREACHABLE = 'The bank is not reachable right now. Try again in a moment.';
const GENERIC = 'Something went wrong. Try again.';

/**
 * How long either route may hang before it is aborted. Neither had a timeout, so a socket that
 * accepted the connection and then went silent left the store's `inFlight` set for the life of
 * the session (store.stop() clears it, but only if the player closes the window) and left
 * `loading` set, which the stream's onVersion guard reads as "a read is in flight" and drops
 * every event behind. A hang now fails loudly, on the same copy as any other network failure.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

// Every code server/src/bank/routes.ts can emit for these two routes (human_only, layout_only,
// bad_ops, bad_version, bad_body, unavailable), plus engine-custom/src/idlescape/types.ts's
// BankApplyError union (bad_slot, bad_tab, tab_invariant, bad_op, full, insufficient), which
// arrives as the 422 body's `error`. The 409 `version` code is handled separately below and
// never reaches this table.
const FRIENDLY: Record<string, string> = {
  human_only: 'Sign in again to open your bank.',
  layout_only: 'The web bank can only re-order items, never move them.',
  bad_ops: 'That change was not understood. Try again.',
  bad_version: 'That change was not understood. Try again.',
  bad_body: 'That change was not understood. Try again.',
  unavailable: UNREACHABLE,
  bad_slot: 'That slot is not part of your bank.',
  bad_tab: 'That tab does not exist.',
  tab_invariant: 'That move would break the bank tabs.',
  bad_op: 'That change was not understood. Try again.',
  full: 'Your bank is full.',
  insufficient: 'You do not have that many.'
};

/** Server and engine error codes rendered as copy. Anything unknown becomes the generic line. */
export function friendlyBankError(code: string): string {
  return FRIENDLY[code] ?? GENERIC;
}

async function errorCode(res: Response): Promise<string> {
  try { return String(((await res.json()) as { error?: unknown }).error ?? ''); } catch { return ''; }
}

/** Either the headers, or the copy for why there are none. Kept apart from the network failure
 *  below because they send the player to two different places: a token that will not refresh is a
 *  sign-in problem, and telling someone with an expired session to check their connection is a
 *  dead end. */
type Auth = { ok: true; headers: Record<string, string> } | { ok: false; message: string };

export function createBankApi(deps: { idToken(): Promise<string>; fetchImpl?: typeof fetch }): BankApi {
  const call = deps.fetchImpl ?? fetch;
  const auth = async (): Promise<Auth> => {
    try {
      return {
        ok: true,
        headers: { authorization: `Bearer ${await deps.idToken()}`, 'content-type': 'application/json' }
      };
    } catch {
      return { ok: false, message: friendlyBankError('human_only') };
    }
  };

  return {
    async get() {
      const headers = await auth();
      if (!headers.ok) throw new Error(headers.message);
      let res: Response;
      try {
        res = await call('/api/bank', {
          headers: headers.headers,
          credentials: 'same-origin',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
      } catch {
        // This was the leak. get() issued its fetch bare, so a dropped connection, a CORS
        // failure or the timeout above escaped as the browser's own DOMException; store.refresh
        // catches and does emit({ error: err.message }), and messageOf prefers err.message, so
        // "Failed to fetch" was rendered verbatim into #bank-error (role=alert) and into the
        // panel's error alert. ops() has always mapped the same throw to copy; so does this now.
        throw new Error(UNREACHABLE);
      }
      if (!res.ok) throw new Error(friendlyBankError(await errorCode(res)));
      try {
        return (await res.json()) as BankSnapshot;
      } catch {
        // A 200 with a body that isn't JSON (a captive portal, a stale cache, a load-balancer
        // health page in front of the front server) is a known failure mode; the caller already
        // expects get() to reject on failure, so keep that contract rather than throwing a raw
        // SyntaxError.
        throw new Error(GENERIC);
      }
    },

    async ops(expectedVersion, ops) {
      // The server caps a batch at 200 and answers 400 bad_ops past it; catching it here keeps
      // the store's queue honest instead of losing a whole flush to a round trip.
      if (ops.length > MAX_OPS_PER_BATCH) {
        return { ok: false, kind: 'error', message: 'Too many changes at once. Try again.' };
      }

      // Resolved before the request and reported on its own: a token that will not refresh used
      // to be reported as "not reachable", which sends the player to look at their network for
      // what is really an expired session.
      const headers = await auth();
      if (!headers.ok) return { ok: false, kind: 'error', message: headers.message };

      let res: Response;
      try {
        res = await call('/api/bank/ops', {
          method: 'POST',
          headers: headers.headers,
          credentials: 'same-origin',
          body: JSON.stringify({ expectedVersion, ops }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
      } catch {
        // A dropped connection, a CORS failure or the timeout above throws from fetch itself;
        // turn it into the same player-facing copy as a 503 rather than letting it escape as an
        // unhandled rejection.
        return { ok: false, kind: 'error', message: UNREACHABLE };
      }

      if (res.ok) {
        // A 200 with a non-JSON body (the same proxy/gateway failure modes as above) must not
        // throw here: OpsResult's contract is that ops() never rejects, and the store (Task 6)
        // sets inFlight = false on the line after this call with no try/catch around it, so an
        // uncaught throw would wedge the flush loop for the rest of the session.
        let body: { version?: unknown };
        try {
          body = (await res.json()) as { version?: unknown };
        } catch {
          return { ok: false, kind: 'error', message: GENERIC };
        }
        if (typeof body.version !== 'number') return { ok: false, kind: 'error', message: GENERIC };
        return { ok: true, version: body.version };
      }

      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as { version?: unknown };
        // A 409 without a usable version can't be retried against; fall back to the generic
        // line so the store refetches instead of re-issuing against a made-up number.
        if (typeof body.version !== 'number') return { ok: false, kind: 'error', message: GENERIC };
        return { ok: false, kind: 'conflict', version: body.version };
      }

      return { ok: false, kind: 'error', message: friendlyBankError(await errorCode(res)) };
    }
  };
}
