/**
 * The pack-id pin, in code.
 *
 * `docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md` section 3 is the authority: pack ids
 * are allocated by hand, by NAME, because `tools/pack/BuildOverlay.ts` runs with
 * `Environment.build.verify = false`, which makes `validateConfigPack` auto-register an unknown
 * name at `pack.max++` and rewrite `<srcDir>/pack/<type>.pack`. A renumbered `.pack` renumbers obj
 * ids already written into every `.sav` bank and every owner-bank JSON, silently turning one item
 * into another. The guard that shipped with that tool hashes the pack directory before and after
 * one `packAll`, so it answers "did this run rewrite a file?" and cannot answer "is id 3894
 * time_candy?". This module answers the second question, and both callers ask both.
 *
 * Nothing here allocates. Adding a row means editing the sprint spec's table first.
 */

export interface PinnedId {
    readonly pack: string;
    readonly id: number;
    readonly name: string;
}

/**
 * Upstream 274's LAST line in each pack we pin, at content sha 2b62ae68. Ids are dense from 0, so
 * asserting this line plus density proves the file is upstream-plus-our-appends rather than a
 * partial copy or a renumbering.
 */
export const UPSTREAM_TAIL: ReadonlyArray<PinnedId> = [
    { pack: 'obj', id: 3893, name: 'wearable_stool_white' },
    { pack: 'inv', id: 216, name: 'boardgames_sideinv' },
    { pack: 'loc', id: 4670, name: 'statue_herosguild2' },
    { pack: 'varp', id: 358, name: 'boardgames_varbit4' }
];

/** Ids this repository has already appended. These must be present. */
export const SHIPPED_IDS: ReadonlyArray<PinnedId> = [
    { pack: 'varp', id: 359, name: 'banktab_size_1' },
    { pack: 'varp', id: 360, name: 'banktab_size_2' },
    { pack: 'varp', id: 361, name: 'banktab_size_3' },
    { pack: 'varp', id: 362, name: 'banktab_size_4' },
    { pack: 'varp', id: 363, name: 'banktab_size_5' },
    { pack: 'varp', id: 364, name: 'banktab_size_6' },
    { pack: 'varp', id: 365, name: 'banktab_size_7' },
    { pack: 'varp', id: 366, name: 'banktab_size_8' },
    { pack: 'varp', id: 367, name: 'banktab_size_9' }
];

/**
 * Ids the sprint allocates that no entry has appended yet: sprint entry 10 (time candy) owns
 * time_candy, time_candy_filled and time_candy_keep, entry 11 (battlebots) owns bb_stash_inv,
 * bb_stash_worn and bb_portal. Absence is NOT a violation until those entries land; a mismatch is,
 * in both directions. See checkPack.
 */
export const ALLOCATED_IDS: ReadonlyArray<PinnedId> = [
    { pack: 'obj', id: 3894, name: 'time_candy' },
    { pack: 'obj', id: 3895, name: 'time_candy_filled' },
    { pack: 'inv', id: 217, name: 'bb_stash_inv' },
    { pack: 'inv', id: 218, name: 'bb_stash_worn' },
    { pack: 'inv', id: 219, name: 'time_candy_keep' },
    { pack: 'loc', id: 4671, name: 'bb_portal' }
];

/**
 * One `<id>=<name>` per line, keyed by id. Splits on /\r?\n/ and never hashes: a tracked .pack is
 * byte-identical across platforms only because .gitattributes says `*.pack text eol=lf`, and a
 * check that compared bytes would still be one attribute away from lying. Throws on a malformed
 * line or a duplicate id, because either means the file is not a pack file any more.
 */
export function parsePack(text: string): Map<number, string> {
    const byId = new Map<number, string>();
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length === 0) {
            continue;
        }

        const eq = line.indexOf('=');
        if (eq <= 0) {
            throw new Error(`pack line ${i + 1} is not "<id>=<name>": ${line}`);
        }

        const raw = line.slice(0, eq);
        if (!/^\d+$/.test(raw)) {
            throw new Error(`pack line ${i + 1} has a non-numeric id "${raw}"`);
        }

        const id = Number(raw);
        if (byId.has(id)) {
            throw new Error(`pack line ${i + 1} repeats id ${id}, already "${byId.get(id)}"`);
        }

        byId.set(id, line.slice(eq + 1));
    }

    return byId;
}

/**
 * Every way `<pack>.pack` disagrees with the pin, as sentences a session can act on. Empty means
 * clean. Four families, in the order they matter:
 *   1. the upstream prefix is dense from 0 and its last line is upstream's,
 *   2. every shipped id is present and carries its name,
 *   3. every allocated id matches in BOTH directions whenever either half is present,
 *   4. no name is on two ids.
 */
export function checkPack(pack: string, text: string): string[] {
    const problems: string[] = [];
    const byId = parsePack(text);

    const idForName = new Map<string, number>();
    for (const [id, name] of byId) {
        const first = idForName.get(name);
        if (first === undefined) {
            idForName.set(name, id);
        } else {
            problems.push(`${pack}.pack: name "${name}" is on id ${first} and again on id ${id}`);
        }
    }

    const tail = UPSTREAM_TAIL.find(t => t.pack === pack);
    if (tail !== undefined) {
        for (let id = 0; id <= tail.id; id++) {
            if (!byId.has(id)) {
                problems.push(`${pack}.pack: upstream id ${id} has no line, so this is not upstream 274 plus our appends`);
                break;
            }
        }

        const last = byId.get(tail.id);
        if (last !== undefined && last !== tail.name) {
            problems.push(`${pack}.pack: upstream id ${tail.id} reads "${last}", upstream 274 has "${tail.name}"`);
        }
    }

    for (const pin of SHIPPED_IDS) {
        if (pin.pack !== pack) {
            continue;
        }

        const actual = byId.get(pin.id);
        if (actual !== pin.name) {
            const found = actual === undefined ? 'no line' : `"${actual}"`;
            problems.push(`${pack}.pack: id ${pin.id} must be "${pin.name}", found ${found}`);
        }
    }

    for (const pin of ALLOCATED_IDS) {
        if (pin.pack !== pack) {
            continue;
        }

        const actual = byId.get(pin.id);
        if (actual !== undefined && actual !== pin.name) {
            problems.push(`${pack}.pack: id ${pin.id} is allocated to "${pin.name}" by the sprint spec's section 3, found "${actual}"`);
        }

        const where = idForName.get(pin.name);
        if (where !== undefined && where !== pin.id) {
            problems.push(`${pack}.pack: "${pin.name}" is allocated id ${pin.id} by the sprint spec's section 3, found it on id ${where}`);
        }
    }

    return problems;
}

/**
 * Every problem in a whole pack DIRECTORY, given its entry names and a reader for one of them.
 *
 * No `fs` here on purpose: the two callers that scan a directory (`tools/pack/BuildOverlay.ts` and
 * `src/app.ts`) each ran their own copy of this loop, and two copies of a guard is one copy that
 * can be edited without the other. Names that do not end in `.pack` are skipped and never read, so
 * `data/pack`'s `.dat` and `.idx` files cost nothing.
 */
export function checkPackDir(names: readonly string[], read: (name: string) => string): string[] {
    const problems: string[] = [];

    for (const name of names) {
        if (!name.endsWith('.pack')) {
            continue;
        }

        const pack = name.slice(0, name.length - '.pack'.length);
        for (const problem of checkPack(pack, read(name))) {
            problems.push(problem);
        }
    }

    return problems;
}
