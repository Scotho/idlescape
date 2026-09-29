// `window.idlescape` itself is declared in clientTypes.ts, alongside the hook types it carries.
import type { ClientHooks } from './clientTypes';

let loading: Promise<ClientHooks> | null = null;

export function loadClient(nodeId: number = 10, members: boolean = true): Promise<ClientHooks> {
  if (loading) return loading;
  loading = new Promise<ClientHooks>((resolve, reject) => {
    const onReady = (): void => {
      const hooks = window.idlescape?.client;
      if (hooks) resolve(hooks); else reject(new Error('client hooks missing'));
    };
    window.addEventListener('idlescape:client-ready', onReady, { once: true });
    // The upstream bundle is an ES module exporting Client; the page constructs it exactly as the engine's rs2.cgi did.
    // A specifier variable keeps Vite from bundling it and tsc from resolving it — the front server serves it at runtime.
    const specifier = '/client/client.js';
    import(/* @vite-ignore */ specifier)
      .then((mod: { Client: new (nodeid: number, lowmem: number, members: boolean) => unknown }) => { new mod.Client(nodeId, 0, members); })
      .catch(reject);
    setTimeout(() => reject(new Error('client did not signal ready in 30s')), 30_000);
  });
  return loading;
}
