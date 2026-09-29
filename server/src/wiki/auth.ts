export interface WikiAuth { allowed(req: Request, kind: 'wiki' | 'wikiApi'): Promise<boolean> }

/** The wiki reader and query API are public. `verifyBearer` is the seam SP4 wires once `PairStore`
 * can verify an agent token by its secret: when it is given, an API call that PRESENTS a bearer
 * token must pass it. Without it (today), every call is allowed, and the API's only limit is the
 * per-credential rate limit in routes.ts. */
export function createWikiAuth(opts: { verifyBearer?: (token: string) => Promise<boolean> } = {}): WikiAuth {
  return {
    async allowed(req, kind) {
      if (kind !== 'wikiApi' || !opts.verifyBearer) return true;
      const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '');
      return m ? opts.verifyBearer(m[1]!) : true;
    }
  };
}
