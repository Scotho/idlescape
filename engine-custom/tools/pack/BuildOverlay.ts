/**
 * idlescape: `npm run build` (tools/pack/Build.ts) with `Environment.build.verify` turned off,
 * which is the only way to pack a config the original 2004 cache did not have.
 *
 * What that flag turns off, for the duration of this one process, MOST IMPORTANT FIRST:
 *
 * 1. **Pack-ID pinning enforcement.** With `verify` false, `validateConfigPack`
 *    (tools/pack/PackFile.ts) stops aborting on a name that has no ID line and instead
 *    auto-registers it at `pack.max++` and REWRITES `<srcDir>/pack/<type>.pack`. That is the
 *    one path from this tool to obj-id corruption: a renumbered `.pack` renumbers the ids
 *    already written into every `.sav` bank and every owner-bank JSON file. So this file
 *    hashes every `*.pack` before and after `packAll` and exits non-zero, naming the files, if
 *    any of them moved. A `packAll` that THROWS exits at the catch below, before the
 *    comparison, so a half-finished run is reported as a pack failure and its files are not
 *    named; re-run after fixing it to find out whether anything moved. `content-custom/pack/varp.pack` pins our nine ids explicitly, so a
 *    clean run rewrites nothing; a run that does is a content change that needs an ID line
 *    added by hand, not a pack to ship.
 * 2. **The 2004 authenticity CRC.** `readConfigs` (tools/pack/config/PackShared.ts) checks
 *    every packed CLIENT config against a hard-coded CRC of the original cache (`703279713`
 *    for `.varp`), so the moment content-custom adds `banktab_size_1..9` the pack aborts with
 *    ".varp checksum mismatch!". Relaxing that cannot ship a client-incompatible cache: the
 *    client validates against the CRC table the server itself advertises, not against the 2004
 *    one. What it does cost is a content drift the CRC would have caught, so use
 *    `npm run build` for anything that is not an overlay pack.
 *
 * Why the flag is set here rather than passed in: the upstream escape hatch is
 * `BUILD_VERIFY=false`, but this world is configured by `data/config/world.json`, and
 * `loadWorldConfig()` returns as soon as that file exists - it never reads the BUILD_*
 * environment variables. Setting it on the loaded Environment object is the same switch,
 * applied where this world can actually reach it, and it keeps the dev `world.json` untouched.
 */
import fs from 'node:fs';
import path from 'node:path';

import { checkPackDir } from '#/idlescape/packIds.js';
import Environment from '#/util/Environment.js';
import { printError, printInfo } from '#/util/Logger.js';

import { changedPacks, hashPacks } from '#tools/pack/packGuard.js';

Environment.build.verify = false;

/** Where PackFile.getPackFilePath writes: `${Environment.build.srcDir}/pack/<type>.pack`. */
const PACK_DIR = path.join(Environment.build.srcDir, 'pack');

/**
 * The pin, checked against the table rather than against ourselves.
 *
 * `changedPacks` below answers "did this run rewrite a file?", which cannot see a wrong id that
 * has been wrong since before this process started, and cannot run until after packAll has already
 * written it. This runs BEFORE the pack as well as after, so a pack directory that is already
 * renumbered is refused rather than repacked, and the operator is told which line is wrong instead
 * of which file moved.
 */
function assertPinnedIds(when: string): void {
    const problems = checkPackDir(fs.readdirSync(PACK_DIR), name => fs.readFileSync(path.join(PACK_DIR, name), 'utf8'));

    if (problems.length === 0) {
        return;
    }

    printError(`[idlescape] pack ids do not match the pin (${when}), in ${PACK_DIR}:`);
    for (const problem of problems) {
        printError(`  ${problem}`);
    }
    printError('[idlescape] The pin is docs/superpowers/specs/2026-09-07-sprint-dragon-slayer.md section 3, carried in src/idlescape/packIds.ts.');
    printError('[idlescape] Restore the clone (git -C engine/content checkout -- pack/), fix the ID line in content-custom/pack/<type>.pack, re-run scripts/content-overlay.ps1, then pack again.');
    process.exit(1);
}

const packsBefore = hashPacks(PACK_DIR);

assertPinnedIds('before packing');

const { packAll } = await import('#tools/pack/PackAll.js');

try {
    printInfo('[idlescape] packing with build.verify disabled (content-custom adds configs the 2004 cache does not have)');
    console.time('pack');
    const modelFlags: number[] = [];
    await packAll(modelFlags);
    console.timeEnd('pack');
} catch (err) {
    if (err instanceof Error) {
        printError(err);
    }

    process.exit(1);
}

// The guard the disabled flag removed, put back by measurement. A rewritten pack file is an
// id renumbering, and the ids are already written into .sav banks and owner-bank JSON.
const changed = changedPacks(packsBefore, hashPacks(PACK_DIR));
if (changed.length > 0) {
    printError(`[idlescape] packAll rewrote ${changed.length} pinned pack file(s) in ${PACK_DIR}: ${changed.join(', ')}`);
    printError('[idlescape] build.verify=false auto-assigns ids for names with no ID line, which renumbers obj ids already stored in .sav banks and owner-bank JSON.');
    printError('[idlescape] Restore the clone with `git -C engine/content checkout -- pack/`, add the missing `<id>=<name>` line to content-custom/pack/<type>.pack (all four are pinned copies of upstream), re-run scripts/content-overlay.ps1, then pack again.');
    process.exit(1);
}

assertPinnedIds('after packing');

printInfo(`[idlescape] pack ids unchanged (${packsBefore.size} pack file(s) verified byte-for-byte)`);
