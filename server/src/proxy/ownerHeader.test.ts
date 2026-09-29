import { describe, expect, test } from 'bun:test';
import { OWNER_HEADER, ownerHeaderFor } from './ws';
import { OWNER_ASSERTION_MAX_ENTRIES, signOwnerAssertion } from '../auth/ownerAssertion';

const SECRET = 'q'.repeat(32);
const entry = (name: string) => signOwnerAssertion(SECRET, { uid: 'u1', character: name, exp: Date.now() + 60_000 });

function upgrade(cookie: string | null): Request {
  return new Request('http://localhost:8787/', { headers: cookie ? { cookie } : {} });
}

describe('owner header extraction', () => {
  test('the header name is the one the engine overlay reads', () => {
    expect(OWNER_HEADER).toBe('x-idlescape-owner');
  });

  test('forwards the cs_owner cookie value verbatim', () => {
    const value = `${entry('one')}~${entry('two')}`;
    expect(ownerHeaderFor(upgrade(`cs_other=abc.def; cs_owner=${value}`))).toBe(value);
  });

  test('returns null with no cookie, an empty cookie, or a different cookie', () => {
    expect(ownerHeaderFor(upgrade(null))).toBeNull();
    expect(ownerHeaderFor(upgrade('cs_owner='))).toBeNull();
    expect(ownerHeaderFor(upgrade('cs_other=abc.def'))).toBeNull();
  });

  test('refuses a cookie with header-injection characters or an absurd length', () => {
    // A raw CR/LF can never reach ownerHeaderFor: fetch's header validation refuses to build
    // the Request at all, and Bun's HTTP parser refuses the header on the wire for the same
    // reason. The alphabet check is the defence-in-depth behind that -- it drops anything
    // signOwnerAssertion could not have emitted, before the value becomes a header.
    expect(() => upgrade('cs_owner=abc\r\nX-Evil: 1')).toThrow();
    for (const bad of ['abc def', 'abc"def', 'a/b', 'a+b', 'a=b', 'a%0d%0aX-Evil:1']) {
      expect(ownerHeaderFor(upgrade(`cs_owner=${bad}`))).toBeNull();
    }
    expect(ownerHeaderFor(upgrade(`cs_owner=${'a'.repeat(4001)}`))).toBeNull();
  });

  test('caps the number of entries it is willing to forward', () => {
    const many = Array.from({ length: OWNER_ASSERTION_MAX_ENTRIES + 3 }, (_, i) => entry(`c${i}`)).join('~');
    expect(ownerHeaderFor(upgrade(`cs_owner=${many}`))).toBeNull();
  });
});
