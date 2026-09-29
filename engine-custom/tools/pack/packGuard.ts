/**
 * The pack-ID guard `tools/pack/BuildOverlay.ts` puts back by measurement, split into its own
 * module so it can be unit tested: importing `BuildOverlay.ts` runs a whole pack.
 *
 * Both functions are pure over their arguments (`hashPacks` over the filesystem, `changedPacks`
 * over two hashings), so the test needs no cache, no Environment and no pack run.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * sha256 of every `*.pack` in `dir`, keyed by file name. A directory that does not exist hashes
 * to an empty map rather than throwing, so a first run on a fresh checkout is not a failure.
 * Anything that is not a `.pack` (`interface.order`, `synth.order`) is ignored: those carry no
 * ids.
 */
export function hashPacks(dir: string): Map<string, string> {
    const hashes = new Map<string, string>();
    if (!fs.existsSync(dir)) {
        return hashes;
    }

    for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.pack')) {
            continue;
        }
        hashes.set(name, createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex'));
    }

    return hashes;
}

/**
 * Every pack file that was rewritten or removed between two hashings, in name order. Both trip
 * the guard: a rewrite renumbers ids already stored in .sav banks and owner-bank JSON, and a
 * removal takes the pinned ids away entirely. A pack that did not exist before the run is NOT a
 * trip: it held no ids anything could have stored, and a fresh Content clone (the engine image
 * builds from one) has none of the packs the packer generates (category, dbrow, dbtable, enum,
 * hunt, mesanim, param, script, struct, varn), so packAll creating them is the pack working.
 * The pinned-id table check in BuildOverlay.ts still runs over whatever exists after the pack.
 */
export function changedPacks(before: Map<string, string>, after: Map<string, string>): string[] {
    return [...before.keys()].filter(name => before.get(name) !== after.get(name)).sort();
}
