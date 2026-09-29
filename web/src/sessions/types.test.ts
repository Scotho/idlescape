import { describe, expect, test } from 'vitest';
import { deriveSessionState, displayStatus } from './types';

const inputs = (over: Partial<Parameters<typeof deriveSessionState>[0]> = {}) =>
  ({ hooks: true, loggedIn: false, pendingLogin: false, disconnected: false, ...over });

describe('deriveSessionState', () => {
  test('no hooks yet is booting, whatever else is set', () => {
    expect(deriveSessionState(inputs({ hooks: false }))).toBe('booting');
    expect(deriveSessionState(inputs({ hooks: false, pendingLogin: true }))).toBe('booting');
  });
  test('logged in wins over everything else', () => {
    expect(deriveSessionState(inputs({ loggedIn: true, pendingLogin: true, disconnected: true }))).toBe('online');
  });
  test('a login in flight is connecting', () => {
    expect(deriveSessionState(inputs({ pendingLogin: true }))).toBe('connecting');
  });
  test('a dropped connection is offline until the login or logout event lands', () => {
    expect(deriveSessionState(inputs({ disconnected: true }))).toBe('offline');
  });
  test('an armed but unpressed title screen is title', () => {
    expect(deriveSessionState(inputs())).toBe('title');
  });
});

describe('displayStatus', () => {
  test('collapses the five internal states onto the three the strip shows', () => {
    expect(displayStatus('booting')).toBe('offline');
    expect(displayStatus('title')).toBe('offline');
    expect(displayStatus('offline')).toBe('offline');
    expect(displayStatus('connecting')).toBe('connecting');
    expect(displayStatus('online')).toBe('online');
  });
});
