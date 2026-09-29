// web/src/plugins/builtin/notes.test.ts
import { describe, expect, test, vi } from 'vitest';
import { notesPlugin } from './notes';
import type { PluginContext } from '../types';

function ctx(initial: string | undefined, set: (k: string, v: unknown) => void): PluginContext {
  return {
    client: () => null,
    settings: { get: ((k: string) => (k === 'content' ? initial : undefined)) as PluginContext['settings']['get'], set, subscribe: () => () => {} },
    storage: { get: () => null, set: () => {} },
    notify: vi.fn(), openPanel: vi.fn(), user: () => null
  };
}

describe('notes plugin', () => {
  test('manifest is a shell plugin, off by default, no settings gear', () => {
    expect(notesPlugin.manifest.id).toBe('notes');
    expect(notesPlugin.manifest.defaultEnabled).toBeUndefined();
    expect(notesPlugin.manifest.settings).toBeUndefined();
  });

  test('textarea loads stored content', () => {
    const view = notesPlugin.panel!(ctx('hello world', () => {}));
    const body = document.createElement('div');
    view.mount(body);
    expect(body.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('hello world');
  });

  // map-design 3.16 is one 12-row textarea that takes the rest of the panel. `.input` carries a
  // fixed 27px height, so the class is the difference between a scratchpad and a one-line field;
  // `.notes-body`'s min-height used to be the only thing hiding that.
  test('the textarea wears the library textarea class and the mock placeholder', () => {
    const view = notesPlugin.panel!(ctx('', () => {}));
    const body = document.createElement('div');
    view.mount(body);
    const ta = body.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(ta.className).toBe('textarea notes-body');
    expect(ta.rows).toBe(12);
    expect(ta.placeholder).toBe('Notes for this character (synced to your account).');
  });

  test('typing persists content through settings.set', () => {
    const set = vi.fn();
    const view = notesPlugin.panel!(ctx('', set));
    const body = document.createElement('div');
    view.mount(body);
    const ta = body.querySelector<HTMLTextAreaElement>('textarea')!;
    ta.value = 'new note';
    ta.dispatchEvent(new Event('input'));
    expect(set).toHaveBeenCalledWith('content', 'new note');
  });
});
