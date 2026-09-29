import type { ClientHooks } from '../src/clientTypes';
import type { TasksApi } from '../src/tasks/api';

declare global {
  interface Window {
    /**
     * `client` is the parent's façade over the *active* character session's hooks (SP7): a
     * getter that is `undefined` whenever no session is active or the active frame is still
     * booting (`main.ts` coalesces the null away), never null. `tasks` is the script runtime
     * router, published for the whole life of the page (spec section 10).
     */
    idlescape?: { client?: ClientHooks; tasks?: TasksApi };
    /** Event recorder installed by e2e/helpers.ts installRecorder(). */
    __e2e?: { chat: { kind: string; sender: string | null; text: string }[]; events: string[] };
  }
}

export {};
