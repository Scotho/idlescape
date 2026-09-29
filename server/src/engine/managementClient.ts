import type { BankOp, BankSnapshot } from '../types';

export type ApplyResult =
  | { ok: true; version: number }
  | { ok: false; kind: 'conflict'; version: number }
  | { ok: false; kind: 'rejected'; error: string }
  | { ok: false; kind: 'unavailable' };

export interface ManagementClient {
  getBank(ownerKey: string): Promise<BankSnapshot | null>;
  applyBank(ownerKey: string, expectedVersion: number | null, ops: BankOp[]): Promise<ApplyResult>;
}

const TIMEOUT_MS = 3000;

/**
 * Typed client for the engine overlay's owner-bank routes (engine-custom/src/idlescape/
 * management.ts), reached over ENGINE_MANAGEMENT_HTTP on loopback. SP8b's spec calls this
 * module `server/src/bank/engine.ts`; it is this file -- SP8b imports it rather than adding a
 * second client. SP9's Contracts settlement uses `applyBank` directly with `delta` ops, which
 * the browser-facing route refuses.
 */
export function createManagementClient(opts: { baseUrl: string; secret: string; fetchImpl?: typeof fetch }): ManagementClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const headers = { 'content-type': 'application/json', 'x-idlescape-mgmt': opts.secret };

  return {
    async getBank(ownerKey) {
      try {
        const res = await fetchImpl(`${opts.baseUrl}/owner/${encodeURIComponent(ownerKey)}/bank`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) return null;
        return (await res.json()) as BankSnapshot;
      } catch {
        return null;
      }
    },

    async applyBank(ownerKey, expectedVersion, ops) {
      let res: Response;
      try {
        res = await fetchImpl(`${opts.baseUrl}/owner/${encodeURIComponent(ownerKey)}/bank/apply`, {
          method: 'POST', headers, body: JSON.stringify({ expectedVersion, ops }), signal: AbortSignal.timeout(TIMEOUT_MS)
        });
      } catch {
        return { ok: false, kind: 'unavailable' };
      }

      try {
        if (res.ok) {
          const body = (await res.json()) as { version: number };
          return { ok: true, version: body.version };
        }
        if (res.status === 409) {
          const body = (await res.json()) as { version: number };
          return { ok: false, kind: 'conflict', version: body.version };
        }
        if (res.status === 422 || res.status === 400) {
          const body = (await res.json()) as { error?: string };
          return { ok: false, kind: 'rejected', error: body.error ?? 'rejected' };
        }
      } catch {
        return { ok: false, kind: 'unavailable' };
      }
      // 503 means the engine has suspended this owner's bank writes (Task 8); 401 means our
      // secret is wrong. Neither is the caller's fault, so both read as unavailable.
      return { ok: false, kind: 'unavailable' };
    }
  };
}
