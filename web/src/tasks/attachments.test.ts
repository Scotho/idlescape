import { describe, expect, test } from 'vitest';
import { createAttachments } from './attachments';

describe('the run attachment store', () => {
  test('hands back an id and keeps the blob out of anything that is persisted', () => {
    const a = createAttachments();
    const id = a.put('run-1', 'stuck at the bank', new Blob(['png']));
    expect(id).toMatch(/^[a-z0-9]{8,}$/);
    expect(a.list('run-1')).toEqual([{ id, label: 'stuck at the bank' }]);
    expect(a.get(id)).toBeInstanceOf(Blob);
  });

  test('caps at eight per run, dropping the oldest, so a loop cannot fill the tab', () => {
    const a = createAttachments(8);
    const ids = Array.from({ length: 10 }, (_, i) => a.put('run-1', `shot ${i}`, new Blob([`${i}`])));
    expect(a.list('run-1')).toHaveLength(8);
    expect(a.get(ids[0])).toBeNull();
    expect(a.get(ids[9])).toBeInstanceOf(Blob);
  });

  // The cap is a public parameter. At zero or below the drop loop's condition is still true at
  // an empty list, `shift()` hands back undefined, the guarded delete is skipped and `put` spins
  // for ever inside the Worker. One is the floor.
  test('a cap below one is floored rather than spun on', () => {
    const a = createAttachments(-1);
    const first = a.put('run-1', 'one', new Blob(['1']));
    const second = a.put('run-1', 'two', new Blob(['2']));
    expect(a.list('run-1')).toEqual([{ id: second, label: 'two' }]);
    expect(a.get(first)).toBeNull();
    expect(a.get(second)).toBeInstanceOf(Blob);
  });

  test('clear releases a finished run', () => {
    const a = createAttachments();
    const id = a.put('run-1', 'x', new Blob(['x']));
    a.clear('run-1');
    expect(a.list('run-1')).toEqual([]);
    expect(a.get(id)).toBeNull();
  });

  // The cap is per run and the store outlives a run, which is the whole reason `clear` has to
  // have a caller: two runs in one tab hold sixteen images between them, not eight, and one
  // run's `clear` must not take the other's.
  test('one run does not spend another run\'s budget, and clearing one leaves the other alone', () => {
    const a = createAttachments(2);
    const first = Array.from({ length: 2 }, (_, i) => a.put('run-1', `a${i}`, new Blob([`a${i}`])));
    const second = a.put('run-2', 'b0', new Blob(['b0']));
    expect(a.list('run-1')).toHaveLength(2);
    expect(a.get(first[0])).toBeInstanceOf(Blob);
    a.clear('run-1');
    expect(a.get(first[0])).toBeNull();
    expect(a.list('run-2')).toEqual([{ id: second, label: 'b0' }]);
    expect(a.get(second)).toBeInstanceOf(Blob);
  });

  test('an id nobody issued reads as nothing rather than throwing', () => {
    const a = createAttachments();
    expect(a.get('nope')).toBeNull();
    expect(a.list('run-never-started')).toEqual([]);
  });
});
