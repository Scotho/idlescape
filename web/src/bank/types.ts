import type { ObjInfo } from '../clientTypes';
export type { ObjInfo };

/** One occupied slot. Mirrors server/src/types.ts BankSlot exactly; there is no `noted`
 *  field because a bank note is its own obj id (ObjInfo.noted says so). */
export interface BankSlot { slot: number; obj: number; count: number }
/** The wire shape of GET /api/bank. `slots` is sparse and slot-ordered. */
export interface BankSnapshot { ownerKey: string; version: number; capacity: number; tabs: number[]; slots: BankSlot[] }

export type BankSortKey = 'value' | 'name' | 'id';
/** Exactly the five ops POST /api/bank/ops accepts. `delta` is deliberately absent. */
export type BankOp =
  | { op: 'swap'; a: number; b: number }
  | { op: 'insert'; from: number; to: number }
  | { op: 'moveToTab'; slot: number; tab: number }
  | { op: 'setTabs'; sizes: number[] }
  | { op: 'sort'; tab: number; by: BankSortKey };

export type RearrangeMode = 'swap' | 'insert';
/** The three quantities the v2 footer draws (map-design 3.6). The withdraw form (Item / Note) and
 *  the 10 and X quantities went with the SP8b parity strip: none of them ever reached the wire,
 *  because POST /api/bank/ops answers 403 layout_only to anything that is not a re-order. A
 *  browser still holding `cs.bank.qty` = '10' or 'x' reads back as 1, which readQuantity's
 *  fall-through already does. */
export type Quantity = 1 | 5 | 'all';

/** What the right-click menu is acting on. */
export interface MenuItemContext { slot: number; obj: number; count: number; info: ObjInfo | null }
/** One menu row. SP9 registers its two by id; the bank module never imports Contracts. */
export interface MenuEntry {
  id: string;
  label: string | ((ctx: MenuItemContext) => string);
  enabled: boolean | ((ctx: MenuItemContext) => boolean);
  /** Shown greyed beside a disabled entry, e.g. 'Contracts coming soon'. */
  hint?: string;
  run(ctx: MenuItemContext): void;
}

/** Dense view of the bank: index === slot, null === empty. */
export type BankItems = (BankSlot | null)[];

export const BANK_COLUMNS = 8;
export const MAX_TABS = 9;
/** Two world ticks. Any apply puts the owner in push-out mode for one tick, so the web
 *  coalesces to at most one apply per two ticks (engine-custom/PATCHES.md). */
export const FLUSH_MS = 1_200;
/** The change hook has no delivery guarantee, so the bank always polls behind the stream. */
export const POLL_MS = 10_000;
/** POST /api/bank/ops refuses a batch longer than this. */
export const MAX_OPS_PER_BATCH = 200;
