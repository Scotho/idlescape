// web/src/bank/menus.ts -- composition of the two bank menus, split out of view.ts so that file
// stays under the 400-line cap.
//
// Owner decision 2: buying and selling are Contracts entries. The bank never imports Contracts;
// SP9 takes the `sell` and `buy` ids over through the registry, so the rows below simply lead
// with whatever the registry currently holds.
//
// Owner decision 3: the sort helpers are web-only. They exist here, in the tab menu, and nowhere
// near the game client.
import { tabOfSlot } from './layout';
import type { BankMenuRegistry } from './contextMenu';
import type { BankState } from './store';
import { MAX_TABS, type BankOp, type BankSortKey, type MenuEntry, type MenuItemContext } from './types';

/** A tab menu acts on a tab, not an item, but `BankMenu.open` is typed for an item context. The
 *  sort rows close over their tab and never read it, so a single inert context serves them all.
 *  The slot is -1 rather than 0 so a row that did read it could not silently act on slot 0. */
export const TAB_MENU_CONTEXT: MenuItemContext = { slot: -1, obj: -1, count: 0, info: null };

const SORT_KEYS: BankSortKey[] = ['value', 'name', 'id'];

/**
 * Registry entries, then one "Move to tab n" per existing tab the item is not already in, then
 * "Move to new tab" while there is room for one, then Examine. `BankMenu.open` appends Cancel.
 */
export function itemMenuRows(
  state: BankState,
  ctx: MenuItemContext,
  registry: BankMenuRegistry,
  submit: (op: BankOp) => void,
  announce: (message: string) => void
): MenuEntry[] {
  const own = tabOfSlot(state.tabs, ctx.slot);
  const rows: MenuEntry[] = [...registry.entries()];

  for (let tab = 1; tab <= state.tabs.length; tab++) {
    if (tab === own) continue;
    rows.push({
      id: `move-to-tab-${tab}`,
      label: `Move to tab ${tab}`,
      enabled: true,
      run: item => submit({ op: 'moveToTab', slot: item.slot, tab })
    });
  }

  if (state.tabs.length < MAX_TABS) {
    const next = state.tabs.length + 1;
    rows.push({
      id: 'move-to-new-tab',
      label: 'Move to new tab',
      enabled: true,
      run: item => submit({ op: 'moveToTab', slot: item.slot, tab: next })
    });
  }

  rows.push({
    id: 'examine',
    label: 'Examine',
    enabled: true,
    // Examine goes to the window's own status line: there is no chat box in the web bank, and a
    // toast would be gone before a screen reader reached it.
    run: item => announce(item.info?.examine ?? item.info?.name ?? String(item.obj))
  });

  return rows;
}

/** Owner decision 3, in full: sort by value, name or id, for any tab including "All items". */
export function tabMenuRows(tab: number, submit: (op: BankOp) => void): MenuEntry[] {
  return SORT_KEYS.map(by => ({
    id: `sort-${by}`,
    label: `Sort by ${by}`,
    enabled: true,
    run: () => submit({ op: 'sort', tab, by })
  }));
}
