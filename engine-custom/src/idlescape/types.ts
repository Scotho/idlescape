/**
 * The owner bank's wire and storage shapes. Kept free of engine imports so the front server
 * and the web client can mirror the same op union without pulling the engine in.
 */

/** One occupied bank slot. Empty slots are absent, not `null` entries: the bank is sparse. */
export interface BankSlotDto {
    slot: number;
    obj: number;
    count: number;
}

/** `engine/server/data/banks/<ownerKey>.json`, written by the store in Task 8. */
export interface OwnerBankFile {
    version: number;
    tabs: number[];
    slots: BankSlotDto[];
    migrated: string[];
}

export type BankOp =
    | { op: 'delta'; obj: number; count: number } // + adds, - removes; server-internal (SP9)
    | { op: 'swap'; a: number; b: number }
    | { op: 'insert'; from: number; to: number }
    | { op: 'moveToTab'; slot: number; tab: number } // tab 0 = main, 1..9 = a tab
    | { op: 'setTabs'; sizes: number[] }
    | { op: 'sort'; tab: number; by: 'value' | 'name' | 'id' };

export const MAX_TABS = 9;
export const LAYOUT_OPS = ['swap', 'insert', 'moveToTab', 'setTabs', 'sort'] as const;

export type BankApplyError = 'bad_op' | 'bad_slot' | 'bad_tab' | 'tab_invariant' | 'insufficient' | 'full';

export const BANK_INV_NAME = 'bank';
export const BANK_CAPACITY_FALLBACK = 240;

/**
 * `delta` is the only op that changes what the bank holds rather than where it sits, which is
 * why the browser-facing route refuses it (global constraints, section 7) and only the
 * server-internal callers in SP9 may send one.
 */
export function isLayoutOp(op: BankOp): boolean {
    return op.op !== 'delta';
}
