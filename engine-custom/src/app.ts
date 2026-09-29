// idlescape overlay: installs the runtime patches (Player.getInventory routing, World.cycle
// wrapper) before anything below imports World and schedules the first tick. Must stay first.
import '#/idlescape/install.js';

import fs from 'fs';
import path from 'path';
import { Worker } from 'worker_threads';

import { collectDefaultMetrics, register } from 'prom-client';

import { packAll } from '#tools/pack/PackAll.js';
import { changedPacks, hashPacks } from '#tools/pack/packGuard.js';
import { checkPackDir } from '#/idlescape/packIds.js';
import World from '#/engine/World.js';
import TcpServer from '#/server/tcp/TcpServer.js';
import Environment from '#/util/Environment.js';
import { printError, printInfo } from '#/util/Logger.js';
import { startManagementWeb, startWeb } from '#/web.js';
import OnDemand from '#/engine/OnDemand.js';

if (OnDemand.cache.count(0) !== 9 || OnDemand.cache.count(2) === 0 || !fs.existsSync('data/pack/server/script.dat')) {
    printInfo('Packing cache, please wait until you see the world is ready.');

    // idlescape: the same pin tools/pack/BuildOverlay.ts enforces. It is not redundant here: this
    // path runs with world.json's build.verify at its default of TRUE, so a missing name throws
    // rather than auto-registering, but a world whose verify was flipped would renumber silently
    // and this is the only process that would notice. Upstream's unauthenticated PUT /setup/config
    // used to be able to flip it; engine-custom's registerSetupGuard now blocks that, and this is
    // the second half of the same defence. Run BEFORE packAll so an already-renumbered pack
    // directory is refused rather than repacked, and AGAIN after it, because the hash delta below
    // answers only "did this run rewrite a file?" and a file rewritten to a wrong id that happens
    // to hash the same as it did before this process started is invisible to it.
    const packDir = path.join(Environment.build.srcDir, 'pack');
    const assertPackIds = (when: string): void => {
        const problems = checkPackDir(fs.readdirSync(packDir), name => fs.readFileSync(path.join(packDir, name), 'utf8'));
        if (problems.length === 0) {
            return;
        }

        for (const problem of problems) {
            printError(`[idlescape] ${problem}`);
        }

        printError(`[idlescape] refusing to pack: the pack ids do not match src/idlescape/packIds.ts (${when}). See engine-custom/PATCHES.md.`);
        process.exit(1);
    };

    assertPackIds('before packing');

    const packsBefore = hashPacks(packDir);

    try {
        // todo: different logic so the main thread doesn't have to load pack files
        const modelFlags: number[] = [];
        await packAll(modelFlags);
    } catch (err) {
        if (err instanceof Error) {
            printError(err);
        }

        process.exit(1);
    }

    const moved = changedPacks(packsBefore, hashPacks(packDir));
    if (moved.length > 0) {
        printError(`[idlescape] packAll rewrote ${moved.length} pinned pack file(s): ${moved.join(', ')}`);
        printError('[idlescape] a rewritten .pack renumbers obj ids already stored in .sav banks and owner-bank JSON. Restore the clone and pack through tools/pack/BuildOverlay.ts.');
        process.exit(1);
    }

    assertPackIds('after packing');
}

if (Environment.easyStartup) {
    new Worker(new URL('./login.ts', import.meta.url));
    new Worker(new URL('./friend.ts', import.meta.url));
    new Worker(new URL('./logger.ts', import.meta.url));
}

await World.start();

const tcpServer = new TcpServer();
tcpServer.start();

await startWeb();
await startManagementWeb();

register.setDefaultLabels({ nodeId: Environment.node.id });
collectDefaultMetrics({ register });

let exiting = false;
function safeExit() {
    if (exiting) {
        return;
    }

    exiting = true;
    World.rebootTimer(0);
}

process.on('SIGINT', safeExit);
process.on('SIGTERM', safeExit);

process.on('uncaughtException', function (err) {
    console.error(err, 'Uncaught exception');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error({ promise, reason }, 'Unhandled Rejection at: Promise');
});
