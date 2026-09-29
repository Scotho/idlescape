// web/src/agent/workerContext.harness.ts
// One thing only: an exhaustive list of `Transport`'s members, so a test can ask which of them
// the scoped transport a script reaches through `c.sdk.transport` swaps out.
//
// It lives in a `.harness.ts` because that is what tsconfig compiles and `*.test.ts` is what it
// excludes. `Record<keyof Transport, true>` is therefore checked here: adding a member to
// `Transport` without adding it below breaks `npm run typecheck`, which is the only mechanical
// pressure that exists on this - a test file could not supply it, and the fake transports are all
// `as unknown as Transport` double casts the compiler never looks inside.
//
// It imports NOTHING from vitest, for the reason bank/grid.harness.ts documents: vitest's ambient
// types reach the shipped program from here and clobber the global `setTimeout` signature.
import type { Transport } from './types';

/**
 * Every member of `Transport`, as a key set. The value is meaningless; the exhaustiveness is the
 * whole point, and `Record<keyof Transport, true>` is what enforces it.
 */
const TRANSPORT_MEMBERS: Record<keyof Transport, true> = {
  getState: true,
  onState: true,
  onEvent: true,
  dispatch: true,
  cancel: true,
  say: true,
  echo: true,
  screenshot: true,
  relogin: true,
  logout: true,
  humanInput: true
};

/** Ordered so a test can compare it against a sorted list of its own. */
export const transportMembers = (): (keyof Transport)[] =>
  (Object.keys(TRANSPORT_MEMBERS) as (keyof Transport)[]).sort();
