/**
 * The account-level bank (spec section 7). One `Inventory` per Firebase uid, shared by every
 * character of that account that is online, persisted as one JSON file per owner under
 * `idlescapeConfig.bankDir`.
 *
 * Mutations are never queued: the engine is single-threaded and `World.cycle` is synchronous,
 * so an HTTP handler on the management port necessarily runs *between* ticks and can never
 * interleave with script execution. That is the same atomicity the spec's "applied on the
 * world tick" asks for, without a queue to drain.
 */
import fs from 'node:fs';
import path from 'node:path';

import InvType from '#/cache/config/InvType.js';
import { Inventory } from '#/engine/Inventory.js';

import { applyOps } from './ops.js';
import { quarantinePath, readBankFile, slotsOf, writeBankFile } from './ownerBankFile.js';
import { copyItems, mergeInto } from './ownerBankMerge.js';
import { BANK_CAPACITY_FALLBACK, BANK_INV_NAME, MAX_TABS, type BankApplyError, type BankOp, type BankSlotDto, type OwnerBankFile } from './types.js';

/** No separators, no dots, no spaces: `<ownerKey>.json` can never escape the bank directory. */
export const OWNER_KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface BankSnapshotDto {
    ownerKey: string;
    version: number;
    capacity: number;
    tabs: number[];
    slots: BankSlotDto[];
}

/**
 * `unavailable` is the store's own refusal, not an op error: the owner's file could not be
 * quarantined, so persistence is suspended and no write may be attempted. Task 10/11 map it to
 * a 503; every other `ok: false` reason is a `BankApplyError` from `applyOps`.
 */
export type ApplyOutcome = { ok: true; version: number } | { ok: false; reason: 'conflict'; version: number } | { ok: false; reason: 'unavailable' } | { ok: false; reason: BankApplyError };

/**
 * The three outcomes of a `.sav` bank migration, deliberately distinguishable. A boolean folded
 * "already merged, nothing to do" into "refused, retry later", and the caller cannot treat those
 * the same: on a refusal the items still exist ONLY in that character's `.sav`, so
 * `PlayerLoading` has to put them back where `Player.save()` will re-emit them.
 */
export type MigrateOutcome = 'merged' | 'already' | 'refused';

interface Entry {
    inv: Inventory;
    tabs: number[];
    version: number;
    migrated: string[];
    dirtyFile: boolean;
    tabsChanged: boolean;
    /**
     * A one-shot flag set by `apply` and consumed by the next `bumpDirty`. An external write
     * bumps the version synchronously but deliberately leaves `inv.update` set, so without it
     * the sweep bumps a SECOND time for a change the caller already holds the version for.
     */
    appliedExternally: boolean;
    /** Set when the on-disk file could not be quarantined: never write over it. */
    noWrite: boolean;
}

/** Inv 95 in this pack. -1 (an anonymous container) if the cache has not been loaded. */
export function bankInvId(): number {
    return InvType.getByName(BANK_INV_NAME) ? InvType.getId(BANK_INV_NAME) : -1;
}

function bankCapacity(): number {
    const type = InvType.getByName(BANK_INV_NAME);
    return type ? type.size : BANK_CAPACITY_FALLBACK;
}

export class OwnerBankStore {
    private readonly entries = new Map<string, Entry>();

    /** One warning per owner/character, so a bank that cannot merge does not spam every login. */
    private readonly warned = new Set<string>();

    constructor(
        private readonly dir: string,
        private readonly capacity: number = bankCapacity()
    ) {}

    private fileFor(ownerKey: string): string {
        return path.join(this.dir, `${ownerKey}.json`);
    }

    private assertKey(ownerKey: string): void {
        // Checked before any path is built, by every public method that takes a key.
        if (!OWNER_KEY_RE.test(ownerKey)) {
            throw new Error(`bad owner key: ${JSON.stringify(ownerKey)}`);
        }
    }

    private warnOnce(key: string, message: string): void {
        if (!this.warned.has(key)) {
            this.warned.add(key);
            console.error(message);
        }
    }

    /** The one live container for an owner. Callers share it; nothing here hands out a copy. */
    private entry(ownerKey: string): Entry {
        this.assertKey(ownerKey);
        const existing = this.entries.get(ownerKey);
        if (existing) {
            return existing;
        }

        const inv = new Inventory(bankInvId(), this.capacity, Inventory.ALWAYS_STACK);
        const entry: Entry = { inv, tabs: [], version: 0, migrated: [], dirtyFile: false, tabsChanged: false, appliedExternally: false, noWrite: false };

        const file = this.fileFor(ownerKey);
        if (fs.existsSync(file)) {
            try {
                const read = readBankFile(file, entry.inv);
                entry.version = read.version;
                entry.tabs = read.tabs;
                entry.migrated = read.migrated;
                if (read.rejected > 0) {
                    // The file parsed, but part of it did not survive validation: an obj id
                    // this pack no longer has, a count that is not positive, a slot outside the
                    // container. The container is therefore SHORT, and the file is the only
                    // record of what was dropped, so writes are suspended exactly as they are
                    // for a failed quarantine - the first writeEntry would otherwise persist
                    // the loss. In-game play continues against the container; an operator
                    // clears it by fixing or moving the file.
                    entry.noWrite = true;
                    this.warnOnce(`${ownerKey}/read`, `[idlescape] bank file for ${ownerKey} loaded with ${read.rejected} unusable slot(s) dropped; writes for this owner are suspended so the file is not overwritten - inspect ${file}`);
                }
            } catch (err) {
                // Never take the world down for one unreadable file, and never silently
                // overwrite it either: park it and start empty so the owner can be restored
                // by hand. `get()` therefore always answers with a usable container.
                const quarantine = quarantinePath(file);
                try {
                    fs.renameSync(file, quarantine);
                    console.error(`[idlescape] bank file for ${ownerKey} was unreadable, moved to ${quarantine}:`, err);
                } catch (moveErr) {
                    // The file we could not move is the owner's only surviving bank. Serving
                    // an empty container is fine; writing that empty container back over the
                    // file is not, so every write path for this owner is suspended until an
                    // operator clears it.
                    entry.noWrite = true;
                    console.error(`[idlescape] bank file for ${ownerKey} was unreadable and could NOT be moved to ${quarantine}; writes for this owner are suspended:`, err, moveErr);
                }
            }
        }

        inv.resetTracking();
        this.entries.set(ownerKey, entry);
        return entry;
    }

    get(ownerKey: string): Inventory {
        return this.entry(ownerKey).inv;
    }

    tabs(ownerKey: string): number[] {
        return [...this.entry(ownerKey).tabs];
    }

    /** The in-game tab varps, mirrored in. Marks the owner for the next `bumpDirty` sweep. */
    setTabs(ownerKey: string, tabs: number[]): void {
        const entry = this.entry(ownerKey);
        const next = tabs.filter(n => Number.isInteger(n) && n > 0).slice(0, MAX_TABS);
        if (next.length === entry.tabs.length && next.every((n, i) => n === entry.tabs[i])) {
            return;
        }
        entry.tabs = next;
        entry.tabsChanged = true;
        entry.dirtyFile = true; // a bare setTabs with no item change is still durable
    }

    version(ownerKey: string): number {
        return this.entry(ownerKey).version;
    }

    snapshot(ownerKey: string): BankSnapshotDto {
        const entry = this.entry(ownerKey);
        return { ownerKey, version: entry.version, capacity: entry.inv.capacity, tabs: [...entry.tabs], slots: slotsOf(entry.inv) };
    }

    /**
     * The external write path. `expectedVersion` is optimistic concurrency: `null` forces.
     *
     * The version is bumped SYNCHRONOUSLY here, so the number this returns is the one a caller
     * may hand back as its next `expectedVersion`, and the file is written before returning, so
     * an owner with nobody online cannot lose the change to a crash before the next sweep.
     *
     * `inv.update` is deliberately NOT reset: an online client still needs the inv diff, which
     * `processClientsOut` writes before the sweep runs. `appliedExternally` is what stops the
     * sweep bumping that same dirt a second time - without it the number returned here would be
     * stale one tick later and every item-moving web op would 409 forever.
     */
    apply(ownerKey: string, expectedVersion: number | null, ops: BankOp[]): ApplyOutcome {
        const entry = this.entry(ownerKey);
        if (entry.noWrite) {
            // Refused before the ops are even read: an owner whose file could not be
            // quarantined must not have an unpersistable change applied to their container.
            return { ok: false, reason: 'unavailable' };
        }
        if (expectedVersion !== null && expectedVersion !== entry.version) {
            return { ok: false, reason: 'conflict', version: entry.version };
        }

        const result = applyOps(entry.inv, entry.tabs, ops);
        if (!result.ok) {
            return { ok: false, reason: result.error };
        }
        if (!result.changed) {
            // A batch that cancels out (an empty batch, a swap of a slot with itself, a sort of
            // an already sorted tab) leaves the bank as it found it, so it burns no version and
            // writes no file. A tab change still pending from setTabs stays pending.
            return { ok: true, version: entry.version };
        }

        // applyOps may CHANGE the tabs it was given (sort and delta clamp them onto the items,
        // empty tabs are dropped), so the array it RETURNS is the one that is recorded and
        // persisted, never the one that went in.
        entry.tabs = result.tabs;
        entry.version += 1;
        entry.tabsChanged = false;
        this.writeEntry(ownerKey, entry);
        // The next sweep must not bump this change again: the number returned here is the one
        // the caller echoes back as its next expectedVersion.
        entry.appliedExternally = true;
        return { ok: true, version: entry.version };
    }

    /**
     * One-time merge of a character's legacy `.sav` bank into the owner container. The first
     * character seen keeps its slot order exactly; later characters are appended (stacking
     * where the container allows, otherwise into the next free slot).
     *
     * `'merged'` is the only outcome that moves items. `'already'` is "this username is in the
     * migrated list, nothing to do"; `'refused'` is "retry later" (it would overflow, it names
     * an obj this pack does not have, or the owner has writes suspended) and writes nothing,
     * does NOT record the username, and leaves the `.sav` as the source of truth. The two are
     * separate outcomes because a caller must react differently: a refusal has to keep the
     * character's own bank alive in its `.sav`, and neither may retire a `.sav`.
     */
    migrate(ownerKey: string, username: string, objs: BankSlotDto[]): MigrateOutcome {
        const entry = this.entry(ownerKey);
        if (entry.migrated.includes(username)) {
            return 'already';
        }
        if (entry.noWrite) {
            this.warnOnce(`${ownerKey}/${username}`, `[idlescape] bank migration for ${username} refused: owner ${ownerKey} has writes suspended, the .sav bank is untouched`);
            return 'refused';
        }

        // Merged into a scratch copy first, so an overflow can never half-apply.
        const scratch = new Inventory(entry.inv.type, entry.inv.capacity, entry.inv.stackType);
        copyItems(scratch, entry.inv);
        const why = mergeInto(scratch, objs);
        if (why !== null) {
            this.warnOnce(`${ownerKey}/${username}`, `[idlescape] bank migration for ${username} into owner ${ownerKey} refused whole (${why}); the .sav bank is untouched and can be retried`);
            return 'refused';
        }

        // Only the slots that actually differ are written, so a client already watching this
        // container gets a small diff rather than 240 slots, and the tracking is left set: the
        // next bumpDirty sweep gives the merge its version.
        copyItems(entry.inv, scratch);
        entry.migrated.push(username);
        this.writeEntry(ownerKey, entry);
        return 'merged';
    }

    /**
     * The owners whose last change came from `apply` and has not been swept yet, reported
     * WITHOUT clearing the flag: `bumpDirty` stays its only consumer. The post-cycle hook reads
     * this before its sweep, because for that one tick the STORE's tab layout is authoritative
     * and the online characters' varps still show the pre-apply one.
     *
     * ANY apply arms it, not only one that touched the tabs: an item-only `delta` from the web
     * also puts the owner in push-out mode for the next tick, during which an in-game tab
     * rearrangement cannot land. A caller applying on most ticks holds the owner there
     * continuously - see the cadence note in PATCHES.md.
     */
    externallyApplied(): Set<string> {
        const armed = new Set<string>();
        for (const [ownerKey, entry] of this.entries) {
            if (entry.appliedExternally) {
                armed.add(ownerKey);
            }
        }
        return armed;
    }

    /**
     * Called once per tick, AFTER client output: every container whose `Inventory` reports
     * `update` (some RuneScript touched it this tick, or an `apply` landed between ticks) gets
     * one version bump and one persistence mark, and the tracking is reset. Upstream's
     * processCleanup only resets `player.invs`, and an owner bank deliberately lives outside
     * those maps, so this is the only thing that resets it - see PATCHES.md.
     */
    bumpDirty(): string[] {
        const changed: string[] = [];
        for (const [ownerKey, entry] of this.entries) {
            if (entry.appliedExternally) {
                // `apply` already bumped and persisted this change. It left `inv.update` set
                // only so an online client would still receive the inv diff, and this sweep
                // runs after `processClientsOut` has written it, so the dirt is consumed here
                // rather than bumped again. A RuneScript change that landed in the same tick
                // is folded into the apply's version - the sweep cannot tell the two apart -
                // but `dirtyFile` still carries it to the next flush, so nothing is lost.
                entry.appliedExternally = false;
                entry.dirtyFile = true;
                entry.tabsChanged = false;
                entry.inv.resetTracking();
                continue;
            }
            if (!entry.inv.update && !entry.tabsChanged) {
                continue;
            }
            entry.version += 1;
            entry.dirtyFile = true;
            entry.tabsChanged = false;
            entry.inv.resetTracking();
            changed.push(ownerKey);
        }
        return changed;
    }

    /**
     * Best-effort per owner: one owner's `writeFileSync`/`renameSync` throwing (a full disk, a
     * permissions change, a locked path) must not cost every owner after it in insertion order
     * its own write for this call. `writeEntry`'s own `noWrite` guard is untouched; this only
     * adds a boundary AROUND it, and a failure leaves `dirtyFile` set (writeEntry never reaches
     * the line that clears it) so the owner is retried on the next flush. Logged through
     * `warnOnce` rather than one line per owner per call, so a persistently failing owner does
     * not fill the log every 100 ticks.
     */
    flush(): void {
        for (const [ownerKey, entry] of this.entries) {
            if (!entry.dirtyFile || entry.noWrite) {
                continue;
            }
            try {
                this.writeEntry(ownerKey, entry);
            } catch (err) {
                this.warnOnce(`${ownerKey}/flush`, `[idlescape] flushing the bank for ${ownerKey} failed, left dirty for the next attempt: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    /**
     * Drops the containers of owners nobody is using any more. An owner with unsaved work is
     * always held back, whatever the predicate says: evicting it would lose the change.
     */
    evict(keep: (ownerKey: string) => boolean): number {
        let dropped = 0;
        for (const [ownerKey, entry] of [...this.entries]) {
            if (entry.noWrite) {
                // An owner whose writes are suspended is held explicitly, not incidentally:
                // dropping the entry would re-read the same unusable file on the next get(),
                // re-warn, and start the suspension over. It stays for the life of the process.
                continue;
            }
            if (keep(ownerKey) || entry.dirtyFile || entry.inv.update || entry.tabsChanged) {
                continue;
            }
            this.entries.delete(ownerKey);
            dropped++;
        }
        return dropped;
    }

    loaded(): string[] {
        return [...this.entries.keys()];
    }

    private writeEntry(ownerKey: string, entry: Entry): void {
        if (entry.noWrite) {
            // The last line of defence: no caller can write an empty container over the only
            // surviving copy of this owner's bank. `dirtyFile` is deliberately left set, so
            // nothing pretends the change reached disk.
            return;
        }

        const payload: OwnerBankFile = {
            version: entry.version,
            tabs: [...entry.tabs],
            slots: slotsOf(entry.inv),
            migrated: [...entry.migrated]
        };
        writeBankFile(this.dir, this.fileFor(ownerKey), payload);
        entry.dirtyFile = false;
    }
}
