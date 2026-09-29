import { describe, expect, test, vi } from 'vitest';

// Both fakes name the parameters their callers actually pass. Declared bare, `mock.calls[0]` was
// the empty tuple and the wrappers below could not spread into them. Audit C16.
const setDoc = vi.fn(async (_ref: unknown, _payload: unknown, _options: unknown) => {});
const getDocs = vi.fn(async (_ref: unknown) => ({
  docs: [
    { id: 'xp', data: () => ({ enabled: true, settings: { rate: 3 }, updatedAt: { seconds: 1 } }) },
    { id: 'notes', data: () => ({ enabled: false, settings: { text: 'x' } }) }
  ]
}));
vi.mock('firebase/firestore', () => ({
  collection: (..._a: unknown[]) => ({ _c: true }),
  doc: (..._a: unknown[]) => ({ _d: true }),
  getDocs: (ref: unknown) => getDocs(ref),
  setDoc: (ref: unknown, payload: unknown, options: unknown) => setDoc(ref, payload, options),
  serverTimestamp: () => 'TS'
}));
vi.mock('../firebase', () => ({ db: {} }));

import { createFirestoreBackend } from './firestoreBackend';

describe('firestore settings backend', () => {
  test('load strips updatedAt and returns id-keyed docs', async () => {
    const backend = createFirestoreBackend();
    const map = await backend.load('u1');
    expect(map).toEqual({ xp: { enabled: true, settings: { rate: 3 } }, notes: { enabled: false, settings: { text: 'x' } } });
  });

  test('write sends enabled, settings and a server timestamp with merge', async () => {
    setDoc.mockClear();
    const backend = createFirestoreBackend();
    await backend.write('u1', 'xp', { enabled: true, settings: { rate: 9 } });
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [, payload, options] = setDoc.mock.calls[0];
    expect(payload).toEqual({ enabled: true, settings: { rate: 9 }, updatedAt: 'TS' });
    expect(options).toEqual({ merge: true });
  });
});
