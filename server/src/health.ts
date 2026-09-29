import type { HealthSnapshot } from './types';

export const SERVER_VERSION = '0.1.0';

export interface Health {
  start(): void;
  stop(): void;
  probe(): Promise<void>;
  setFetch(f: typeof fetch): void;
  snapshot(): HealthSnapshot;
}

export function parsePlayerGauge(text: string): number | null {
  const m = text.match(/^lostcity_active_players(?:\{[^}]*\})?\s+(\d+(?:\.\d+)?)/m);
  return m ? Math.round(Number(m[1])) : null;
}

export function createHealth(opts: { engineHttp: string; engineManagementHttp: string; engineManagementSecret: string; intervalMs: number; wikiUp: () => boolean; fetchImpl?: typeof fetch }): Health {
  let fetchImpl: typeof fetch = opts.fetchImpl ?? fetch;
  let up = false;
  let upSince = 0;
  let players: number | null = null;
  let management: HealthSnapshot['management'] = 'unconfigured';
  let timer: ReturnType<typeof setInterval> | null = null;

  async function probe(): Promise<void> {
    let ok = false;
    try {
      const res = await fetchImpl(`${opts.engineHttp}/rs2.cgi`, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
      ok = res.status >= 200 && res.status < 300;
    } catch {
      ok = false;
    }
    if (ok && !up) upSince = Date.now();
    if (!ok) upSince = 0;
    up = ok;

    try {
      const res = await fetchImpl(`${opts.engineManagementHttp}/prometheus`, { signal: AbortSignal.timeout(3000) });
      players = res.ok ? parsePlayerGauge(await res.text()) : null;
    } catch {
      players = null;
    }

    // The overlay's own route, which upstream 274 does not have. /prometheus above proves the
    // management PORT is reachable, but upstream binds that port itself, so it is not proof of the
    // overlay (decision D75). This is.
    if (opts.engineManagementSecret === '') {
      management = 'unconfigured';
    } else {
      try {
        const res = await fetchImpl(`${opts.engineManagementHttp}/owner/health`, {
          headers: { 'x-idlescape-mgmt': opts.engineManagementSecret },
          signal: AbortSignal.timeout(3000)
        });
        if (res.status === 200) management = 'up';
        else if (res.status === 401 || res.status === 404) management = 'unauthorized';
        else management = 'down';
      } catch {
        management = 'down';
      }
    }
  }

  return {
    start() {
      if (timer) return;
      void probe();
      timer = setInterval(() => void probe(), opts.intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    probe,
    setFetch(f) { fetchImpl = f; },
    snapshot() {
      return { engine: up ? 'up' : 'down', engineUptimeMs: up ? Date.now() - upSince : 0, version: SERVER_VERSION, gateway: 'not_deployed', players, wiki: opts.wikiUp() ? 'up' : 'missing', management };
    }
  };
}
