// web/src/plugins/builtin/bank.ts -- the Bank panel and the window it opens.
//
// The window is not a side panel: eight columns need about 420 px, so it is a centred window
// over the stage (spec section 3) mounted into #bank-host. The panel is its handle: opening it
// opens the window, closing it closes the window, and the body summarises what the window shows
// so the state is legible even when the window is behind something.
import { alert, h, kv } from '../../ui/el';
import { meter } from '../../ui/parts';
import { definePlugin, type ShellPlugin } from '../types';
import type { BankState, BankStore } from '../../bank/store';
import type { BankWindow } from '../../bank/view';

export interface BankPluginDeps {
  /** The one window instance the shell owns; the plugin never builds it. */
  window(): BankWindow;
  store: BankStore;
  /** The window and the side panel open and close together. */
  closePanel(): void;
}

/** map-design 3.13, verbatim. The second sentence is what the SP8b footer's two disabled deposit
 *  buttons used to say by being there; the v2 footer does not draw them, so the panel says it. */
const NO_DEPOSIT = 'Items only move in and out of the bank in game. One bank per account, shared by every character.';

export function createBankPlugin(deps: BankPluginDeps): ShellPlugin {
  return definePlugin({
    manifest: {
      id: 'bank', name: 'Bank', icon: 'bank', tier: 'shell',
      description: 'Your account bank: view, re-order and sort. Shared by every character.',
      defaultEnabled: true
    },
    panel: () => {
      let body: HTMLElement | null = null;
      let unsubscribe: (() => void) | null = null;

      function render(state: BankState): void {
        if (!body) return;
        const tabs = state.tabs.length === 1 ? '1 tab' : `${state.tabs.length} tabs`;
        const used = state.capacity > 0 ? (state.used / state.capacity) * 100 : 0;
        // map-design 3.13: a FLAT capacity bar under the Used row, no shimmer. `.meter-flat` is
        // the tone that drops the gradient; `meter()` writes it on the fill, which is where the
        // v2 tone rules select from.
        const notice = alert(NO_DEPOSIT, { tone: 'info' });
        notice.classList.add('alert-roomy');
        // map-design 3.13 tucks the bar up under the row it measures (`margin-top:-6px`) against
        // the panel body's own 10px gap, so the two read as one unit. `.bank-meter` in
        // layout/bank.css is the only thing here that is not already a family part.
        const capacity = meter(used, { tone: 'flat' });
        capacity.classList.add('bank-meter');
        const children: HTMLElement[] = [
          kv('Used', `${state.used} / ${state.capacity}`, { num: true, roomy: true }),
          capacity,
          kv('Tabs', tabs, { roomy: true }),
          kv('Updates', state.live ? '● live' : '● polling', { roomy: true, tone: state.live ? 'var(--ok-bright)' : 'var(--text-muted)' }),
          h('button', { class: 'btn btn-primary btn-lg btn-block btn-cta', id: 'bank-panel-open', type: 'button', onclick: () => deps.window().open() }, 'Open bank window'),
          notice
        ];
        if (state.error) children.push(alert(state.error, { tone: 'error' }));
        body.replaceChildren(...children);
      }

      return {
        title: 'Bank',
        mount(el: HTMLElement) {
          body = el;
          unsubscribe = deps.store.subscribe(render);
          deps.window().open();
          render(deps.store.state());
        },
        unmount() {
          unsubscribe?.();
          unsubscribe = null;
          body = null;
          deps.window().close();
        }
      };
    }
  });
}
