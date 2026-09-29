// web/src/bank/bottomBar.ts -- the footer along the bottom of the bank window: rearrange mode,
// quantity, the search box and the caption. README never describes this row; map-design 3.6 draws
// it, and it is the mock that decides what is in it.
//
// Owner decision 1 still holds and has simply moved: the web bank never deposits, and the reason
// is the Bank PANEL's info alert (`Items only move in and out of the bank in game.`) rather than
// two permanently disabled buttons the v2 footer does not draw. The withdraw form (Item / Note)
// and the 10 / X quantities went the same way: neither ever reached the wire, because
// POST /api/bank/ops answers 403 layout_only to anything that is not a re-order.
//
// Every node is built once in the factory and `render()` only rewrites `aria-pressed`. Rebuilding
// the strip on every render would drop the value and the caret out of the search box on each
// keystroke that repaints the pane behind it.
import { h } from '../ui/el';
import { BANK_FOOTER_NOTE } from '../ui/copy';
import type { Quantity, RearrangeMode } from './types';

export interface BottomBarDeps {
  mode(): RearrangeMode;
  setMode(mode: RearrangeMode): void;
  quantity(): Quantity;
  setQuantity(quantity: Quantity): void;
  search(): string;
  setSearch(text: string): void;
}

export interface BottomBar {
  el: HTMLElement;
  render(): void;
}

const QUANTITIES: { id: string; value: Quantity; label: string }[] = [
  { id: 'bank-qty-1', value: 1, label: '1' },
  { id: 'bank-qty-5', value: 5, label: '5' },
  { id: 'bank-qty-all', value: 'all', label: 'All' }
];

/** The footer's controls are the button family at its quiet size; `.bank-toggle` carries only the
 *  mock's 5px radius and the pressed state, which is the family's primary. */
function toggle(id: string, label: string, title: string, onclick: () => void): HTMLButtonElement {
  return h('button', { type: 'button', id, class: 'btn btn-quiet bank-toggle', 'aria-pressed': 'false', title, onclick }, label);
}

function group(label: string, ...children: (Node | null)[]): HTMLElement {
  return h('div', { class: 'bank-group', role: 'group', 'aria-label': label }, ...children);
}

/** What the filter is keyed on. The pane matches case-insensitively on a trimmed name, so this
 *  is the form the owner is told about - and the form the box must never be rewritten to. */
function normalise(raw: string): string {
  return raw.trim().toLowerCase();
}

export function createBottomBar(deps: BottomBarDeps): BottomBar {
  const modeSwap = toggle('bank-mode-swap', 'Swap', 'Rearrange by swapping', () => deps.setMode('swap'));
  const modeInsert = toggle('bank-mode-insert', 'Insert', 'Rearrange by inserting', () => deps.setMode('insert'));
  const quantities = QUANTITIES.map(entry => ({ entry, button: toggle(entry.id, entry.label, `Withdraw ${entry.label}`, () => deps.setQuantity(entry.value)) }));

  // Declared before the input it reads so the input can register it inline; `searchInput` is a
  // const in the same scope and is only dereferenced when the event actually fires.
  function onSearchInput(): void {
    deps.setSearch(normalise(searchInput.value));
  }

  const searchInput = h('input', {
    id: 'bank-search',
    type: 'search',
    class: 'input bank-search',
    placeholder: 'Search',
    'aria-label': 'Search the bank',
    oninput: onSearchInput
  });

  const el = h('div', { class: 'bank-bottom' },
    group('Rearrange mode', modeSwap, modeInsert),
    group('Quantity', ...quantities.map(q => q.button)),
    searchInput,
    h('span', { class: 'bank-note' }, BANK_FOOTER_NOTE)
  );

  function press(button: HTMLButtonElement, on: boolean): void {
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function render(): void {
    const mode = deps.mode();
    press(modeSwap, mode === 'swap');
    press(modeInsert, mode === 'insert');
    const quantity = deps.quantity();
    for (const { entry, button } of quantities) press(button, entry.value === quantity);
    // Adopt the owner's filter ONLY when the box is not the thing that produced it. deps.search()
    // is the normalised form, so syncing it back unconditionally rewrote what the player had
    // typed: type "Coins", click any other control on this footer - which re-renders it - and the
    // box became "coins" under the caret. The box keeps the raw text; the owner keeps the key.
    const wanted = deps.search();
    const owned = document.activeElement === searchInput || normalise(searchInput.value) === wanted;
    if (!owned) searchInput.value = wanted;
  }

  return { el, render };
}
