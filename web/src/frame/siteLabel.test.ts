import { expect, test } from 'vitest';
import { siteLabel, WORLD } from './siteLabel';

test('the label names the host the shell is actually served from', () => {
  // jsdom serves about:blank at localhost by default; whatever it is, the label must quote it
  // rather than a compiled-in production hostname (audit C17).
  expect(siteLabel('Zezima')).toBe(`${location.host} · world ${WORLD} · Zezima`);
  expect(siteLabel('Zezima')).not.toContain('osrs.scotho.com');
});

test('there is one world and it is named once', () => {
  expect(WORLD).toBe(1);
});
