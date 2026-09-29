import { describe, expect, it, vi } from 'vitest';
import { createBankPlugin } from './bank';
import type { BankState, BankStore } from '../../bank/store';
import type { BankWindow } from '../../bank/view';

function fakeStore(over: Partial<BankState> = {}) {
  let state: BankState = { version: 3, capacity: 240, tabs: [2], items: new Array(240).fill(null), used: 5, loading: false, live: true, pending: 0, error: null, ...over };
  const listeners = new Set<(s: BankState) => void>();
  const store: BankStore = {
    state: () => state,
    subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    start: () => {}, stop: () => {}, refresh: async () => {}, submit: () => ({ kind: 'dropped' }), flush: async () => {}
  };
  return {
    store,
    /** So an unsubscribe can be PROVED rather than inferred from "nothing seems to happen". */
    listenerCount: () => listeners.size,
    push(next: Partial<BankState>) { state = { ...state, ...next }; for (const fn of listeners) fn(state); }
  };
}

function fakeWindow() {
  let open = false;
  const calls = { open: 0, close: 0 };
  const win = { el: document.createElement('div'), open: () => { open = true; calls.open++; }, close: () => { open = false; calls.close++; }, isOpen: () => open, destroy: () => {} } as BankWindow;
  return { win, calls };
}

function mount(over: Partial<BankState> = {}) {
  document.body.innerHTML = '';
  const body = document.createElement('div');
  document.body.appendChild(body);
  const store = fakeStore(over);
  const window_ = fakeWindow();
  const closePanel = vi.fn();
  const plugin = createBankPlugin({ window: () => window_.win, store: store.store, closePanel });
  const view = plugin.panel!({} as never);
  return { plugin, view, body, store, window_, closePanel };
}

describe('the bank plugin', () => {
  it('is a shell plugin on by default with its own strip icon', () => {
    const { plugin } = mount();
    expect(plugin.manifest).toMatchObject({ id: 'bank', name: 'Bank', tier: 'shell', defaultEnabled: true });
    expect(plugin.manifest.icon.length).toBeGreaterThan(0);
    expect(plugin.manifest.alwaysOn).toBeUndefined();
  });

  it('opens the window when its panel is opened and closes it on unmount', () => {
    const { view, body, window_ } = mount();
    view.mount(body);
    expect(window_.calls.open).toBe(1);
    view.unmount?.();
    expect(window_.calls.close).toBe(1);
  });

  it('summarises the bank and follows the store', () => {
    const { view, body, store } = mount();
    view.mount(body);
    expect(body.textContent).toContain('5 / 240');
    expect(body.textContent).toContain('1 tab');
    store.push({ used: 9, tabs: [2, 2] });
    expect(body.textContent).toContain('9 / 240');
    expect(body.textContent).toContain('2 tabs');
  });

  it('says plainly that the web bank never moves items (owner decision 1)', () => {
    const { view, body } = mount();
    view.mount(body);
    // The whole sentence, not the first half. The v2 footer draws no deposit buttons, so this
    // alert is the only place the rule is stated, and it is map-design 3.13's copy verbatim.
    expect(body.textContent).toContain('Items only move in and out of the bank in game. One bank per account, shared by every character.');
  });

  it('composes the panel out of the library at the mock geometry (map-design 3.13)', () => {
    const { view, body } = mount({ used: 27 });
    view.mount(body);
    // Three KV rows on the bank's own 4px rhythm, and nothing hand-rolled between them.
    expect([...body.querySelectorAll('.kv')].map(row => row.className)).toEqual(['kv kv-roomy', 'kv kv-roomy', 'kv kv-roomy']);
    // The capacity bar is FLAT: the tone rides on the fill, which is where the v2 rules select.
    const bar = body.querySelector('.meter') as HTMLElement;
    // `.bank-meter` is map-design 3.13's `margin-top:-6px`, which hangs the bar off the Used row
    // it measures against the panel body's own 10px gap. No family rule supplies it: without the
    // class the bar sits a full gap below the row and the two stop reading as one unit.
    expect([...bar.classList]).toEqual(['meter', 'bank-meter']);
    const fill = bar.querySelector('.meter-fill') as HTMLElement;
    expect(fill.className).toBe('meter-fill meter-flat');
    expect(fill.style.width).toBe('11.25%');
    // A panel-width call to action at the .25 resting glow, not the co-pilot bar's .28.
    expect([...body.querySelector('#bank-panel-open')!.classList]).toEqual(['btn', 'btn-primary', 'btn-lg', 'btn-block', 'btn-cta']);
    expect([...body.querySelector('.alert')!.classList]).toEqual(['alert', 'alert-info', 'alert-roomy']);
  });

  it('paints the Updates row as a toned dot and word', () => {
    const { view, body, store } = mount();
    view.mount(body);
    const value = (): HTMLElement => body.querySelectorAll<HTMLElement>('.kv-value')[2];
    expect(value().textContent).toBe('● live');
    expect(value().style.color).toBe('var(--ok-bright)');
    store.push({ live: false });
    expect(value().textContent).toBe('● polling');
    expect(value().style.color).toBe('var(--text-muted)');
  });

  it('reopens the window from the panel after the player closed it', () => {
    const { view, body, window_ } = mount();
    view.mount(body);
    window_.win.close();
    body.querySelector<HTMLButtonElement>('#bank-panel-open')!.click();
    expect(window_.calls.open).toBe(2);
  });

  it('shows the live state and a load error', () => {
    const { view, body, store } = mount();
    view.mount(body);
    expect(body.textContent).toContain('live');
    store.push({ live: false, error: 'The bank is not reachable right now. Try again in a moment.' });
    expect(body.textContent).toContain('polling');
    expect(body.textContent).toContain('not reachable');
  });

  /**
   * FINAL REVIEW, residual 18. This used to assert only that the body stopped changing, which
   * removing `unsubscribe?.()` also produces: render() opens with `if (!body) return`, and
   * `body = null` on the line below gives the identical observable result while the store keeps
   * a listener - and its closure, and the detached panel body - for the life of the page. The
   * subscription itself is what has to be counted.
   */
  it('unsubscribes on unmount so a closed panel stops re-rendering', () => {
    const { view, body, store } = mount();
    view.mount(body);
    expect(store.listenerCount()).toBe(1);
    view.unmount?.();
    expect(store.listenerCount()).toBe(0);
    store.push({ used: 40 });
    expect(body.textContent).not.toContain('40 / 240');
  });
});
