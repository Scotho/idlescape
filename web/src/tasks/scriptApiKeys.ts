// The declared member set, as a value. It is a leaf on purpose: web/src/agent/worker.ts imports
// it for its VALUE, and a value import drags the imported module's whole export graph into the
// Worker chunk. scriptApi.ts is where the docs generator's entry and (entry 7) P17's
// createTestContext live, and P17 says that harness must never reach the Worker.
//
// The Record type is the gate: adding a member to ScriptContext without adding it here is a
// compile error in `npm run typecheck`'s FIRST program, because this file ships. Removing one
// that no longer exists is the same error from the other direction.
import type { ScriptContext } from './scriptContext';

export const SCRIPT_CONTEXT_KEYS: Record<keyof ScriptContext, true> = {
  state: true, bot: true, sdk: true, wait: true, tutorial: true, params: true, log: true,
  status: true, memory: true, signal: true, travel: true, find: true, anchor: true, health: true,
  dialog: true, retry: true, screenshot: true
};
