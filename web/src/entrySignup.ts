import type { Identity } from './types';

export type SignupFn = (email: string, password: string, displayName: string) => Promise<Identity>;

/**
 * Spec 2.1: "For a guest, sign-up uses linkWithCredential so the character carries over."
 * An anonymous guest's "Create an account" submit must link (keeping the uid/character);
 * anyone else creates a fresh account as before.
 */
export function pickSignupFn(isAnonymous: boolean | undefined, attach: SignupFn, signUp: SignupFn): SignupFn {
  return isAnonymous ? attach : signUp;
}

export interface EntrySignupDeps {
  /** Replace the module-level `identity` with the now-non-anonymous user returned by `fn`. */
  setIdentity: (identity: Identity) => void;
  /** Re-render the identity strip (also hides the guest warning, since it reads `identity`). */
  renderIdentityStrip: () => void;
  /** Dismiss the signup form and show success feedback. Only called after `fn` resolves. */
  closeForm: () => void;
  /** Clear any previously shown signup error. */
  clearError: () => void;
}

/**
 * Runs the entry screen's signup submit against `fn` (either `attachEmail` or `signUpEmail`,
 * see `pickSignupFn`) and, only on success, drives every downstream effect a completed sign-up
 * requires: the module `identity` must reflect the new non-anonymous user (so a later Login
 * sends the real display name, not `undefined`), the identity strip must re-render, and the
 * form must close. A rejection leaves all of that untouched -- the caller's catch block is
 * responsible for surfacing the error.
 */
export async function submitEntrySignup(
  fn: SignupFn, email: string, password: string, displayName: string, deps: EntrySignupDeps
): Promise<Identity> {
  const identity = await fn(email, password, displayName);
  deps.setIdentity(identity);
  deps.renderIdentityStrip();
  deps.closeForm();
  deps.clearError();
  return identity;
}
