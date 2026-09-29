// web/src/plugins/builtin/notes.ts
import { definePlugin, type PluginContext, type ShellPlugin } from '../types';
import type { PanelView } from '../../frame/panels';

function panel(ctx: PluginContext): PanelView {
  return {
    title: 'Notes',
    mount(body) {
      const ta = document.createElement('textarea');
      // `.textarea` and not `.input`: the input rule carries a fixed 27px height, which a 12-row
      // scratchpad only escapes today because `.notes-body`'s min-height happens to beat it.
      ta.className = 'textarea notes-body';
      ta.rows = 12;
      ta.placeholder = 'Notes for this character (synced to your account).';
      ta.value = ctx.settings.get<string>('content') ?? '';
      ta.addEventListener('input', () => ctx.settings.set('content', ta.value));
      body.replaceChildren(ta);
    }
  };
}

export const notesPlugin: ShellPlugin = definePlugin({
  manifest: {
    id: 'notes', name: 'Notes', icon: 'notes', tier: 'shell',
    description: 'A per-character scratchpad, synced to your account.'
  },
  panel
});
