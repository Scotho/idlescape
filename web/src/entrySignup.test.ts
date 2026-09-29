import { describe, expect, test, vi } from 'vitest';
import { pickSignupFn, submitEntrySignup } from './entrySignup';
import type { Identity } from './types';

describe('pickSignupFn', () => {
  test('picks attach (linkWithCredential) for an anonymous guest, preserving the character', () => {
    const attach = vi.fn();
    const signUp = vi.fn();
    expect(pickSignupFn(true, attach, signUp)).toBe(attach);
  });

  test('picks signUp (a fresh account) for a non-anonymous or unknown identity', () => {
    const attach = vi.fn();
    const signUp = vi.fn();
    expect(pickSignupFn(false, attach, signUp)).toBe(signUp);
    expect(pickSignupFn(undefined, attach, signUp)).toBe(signUp);
  });
});

describe('submitEntrySignup', () => {
  function fakeDeps() {
    return {
      setIdentity: vi.fn(),
      renderIdentityStrip: vi.fn(),
      closeForm: vi.fn(),
      clearError: vi.fn()
    };
  }

  test('a resolving link (guest -> real account) updates identity, re-renders the strip, and closes the form', async () => {
    // Regression for the bug where the entry screen discarded the Identity returned by
    // attachEmail/signUpEmail: a guest who signed up stayed stuck as `identity.isAnonymous
    // === true`, so a later Login sent `desired: undefined` to the bridge and minted a random
    // guest name instead of the chosen display name.
    const linked: Identity = { uid: 'u1', isAnonymous: false, email: 'bob@example.com', displayName: 'Bob' };
    const fn = vi.fn(async () => linked);
    const deps = fakeDeps();

    const result = await submitEntrySignup(fn, 'bob@example.com', 'secret1', 'Bob', deps);

    expect(result).toBe(linked);
    expect(fn).toHaveBeenCalledWith('bob@example.com', 'secret1', 'Bob');
    expect(deps.setIdentity).toHaveBeenCalledWith(linked);
    expect(deps.renderIdentityStrip).toHaveBeenCalledTimes(1);
    expect(deps.closeForm).toHaveBeenCalledTimes(1);
    expect(deps.clearError).toHaveBeenCalledTimes(1);
    // Effects must land in this order: identity is updated before the strip re-renders,
    // otherwise the strip would render against the stale (still-anonymous) identity.
    const setIdentityOrder = deps.setIdentity.mock.invocationCallOrder[0];
    const renderOrder = deps.renderIdentityStrip.mock.invocationCallOrder[0];
    expect(setIdentityOrder).toBeLessThan(renderOrder);
  });

  test('a rejection propagates and touches none of the success-path deps', async () => {
    const err = new Error('auth/email-already-in-use');
    const fn = vi.fn(async () => { throw err; });
    const deps = fakeDeps();

    await expect(submitEntrySignup(fn, 'a@b.com', 'pw123456', 'Name', deps)).rejects.toBe(err);

    expect(deps.setIdentity).not.toHaveBeenCalled();
    expect(deps.renderIdentityStrip).not.toHaveBeenCalled();
    expect(deps.closeForm).not.toHaveBeenCalled();
    expect(deps.clearError).not.toHaveBeenCalled();
  });
});
