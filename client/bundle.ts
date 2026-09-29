import fs from 'fs';
import path from 'path';

import { minify } from 'terser';

import { nth_identifier } from './identifier.js';

const define = {
    'process.env.SECURE_ORIGIN': JSON.stringify(process.env.SECURE_ORIGIN ?? 'false'),
    // original key, used 2003-2010
    'process.env.LOGIN_RSAE': JSON.stringify(process.env.LOGIN_RSAE ?? '58778699976184461502525193738213253649000149147835990136706041084440742975821'),
    'process.env.LOGIN_RSAN': JSON.stringify(process.env.LOGIN_RSAN ?? '7162900525229798032761816791230527296329313291232324290237849263501208207972894053929065636522363163621000728841182238772712427862772219676577293600221789'),
    'process.env.BUILD_TIME': JSON.stringify(new Date().toISOString())
};

// ----

/**
 * Property names the vendored rs-sdk bot module puts on the wire.
 *
 * `window.idlescape.client.getWorldState()` returns `BotWorldState & WorldExtras` and
 * `dispatch()` takes a `BotAction` literal the web builds by hand, so every field name
 * declared in `src/vendor/rs-sdk/bot/types.ts` crosses the boundary in one direction or the
 * other. Harvest them instead of maintaining a hand-written list: a missed *output* name
 * reads as `undefined` in the web, and a missed *input* name (`optionIndex`, `locId`, ...)
 * is worse — the action dispatches with the field silently dropped. Over-reserving costs a
 * few bytes of bundle; under-reserving breaks the boundary with no error.
 */
function vendoredBotProperties(): string[] {
    const source = fs.readFileSync('src/vendor/rs-sdk/bot/types.ts', 'utf8');
    const names = new Set<string>();
    // Matches `name:` / `name?:` after a line start, `{`, `;` or `,` — i.e. interface members
    // and the inline members of the BotAction union's object types.
    for (const match of source.matchAll(/(?:^|[{;,])[ 	]*(?:readonly[ 	]+)?([A-Za-z_$][\w$]*)[ 	]*\??[ 	]*:/gm)) {
        names.add(match[1]);
    }
    return [...names];
}


type BunOutput = {
    source: string;
    sourcemap: string;
}

async function bunBuild(entry: string, external: string[] = [], minify = true, drop: string[] = []): Promise<BunOutput> {
    const build = await Bun.build({
        entrypoints: [entry],
        sourcemap: 'external',
        define,
        external,
        minify,
        drop,
    });

    if (!build.success) {
        build.logs.forEach((x: any) => console.log(x));
        process.exit(1);
    }

    return {
        source: await build.outputs[0].text(),
        sourcemap: build.outputs[0].sourcemap ? await build.outputs[0].sourcemap.text() : ''
    };
}

async function applyTerser(script: BunOutput): Promise<boolean> {
    const mini = await minify(script.source, {
        sourceMap: {
            content: script.sourcemap
        },
        toplevel: true,
        // format: {
        //     beautify: true
        // },
        compress: {
            ecma: 2020
        },
        mangle: {
            nth_identifier: nth_identifier,
            properties: {
                reserved: [
                    // idlescape hook API — public contract consumed by the web app
                    // (window.idlescape.client + ClientHooks/ClientState/event payloads).
                    // These property names must survive minification or the boundary breaks.
                    'client',
                    'plugins', 'enable', 'disable',
                    'login', 'logout', 'echoChat', 'getState', 'getObjName', 'on',
                    'loggedIn', 'gameName', 'skills', 'xp', 'level', 'inventory', 'id', 'count', 'fps', 'rttMs',
                    'hp', 'prayer', 'energy', 'boosts', 'current', 'max',
                    'position', 'x', 'z', 'activeTab', 'sceneReady',
                    'skill', 'delta', 'added', 'removed',
                    'ok', 'code', 'reason', 'kind', 'sender', 'text', 'cycle',
                    // hooks v2 (SP4a Task 2): getWorldState/dispatch and the WorldState
                    // extras + ActionResult fields the web reads off window.idlescape.client.
                    'getWorldState', 'dispatch',
                    // SP4b: the shell drains the client's action queue when a task aborts.
                    'cancelAll',
                    // SP7 multi-session hook surface (client/PATCHES.md patches 22-27).
                    'armLogin', 'loginArmed', 'setRenderSuspended', 'setAttended',
                    // SP8b patch 28: the web bank reads item art and obj facts off the hooks.
                    'getObjIcon', 'getObjInfo', 'examine', 'cost', 'stackable', 'noted',
                    'hint', 'tutorial', 'flashingTab', 'interfaceTexts', 'regionId',
                    'open', 'title', 'lines', 'tile', 'npcIndex', 'playerIndex', 'height',
                    'success', 'message', 'phase', 'data', 'type', 'action', 'result', 'tick',
                    'zone',
                    // Every field name declared in the vendored bot/types.ts (BotState,
                    // BotWorldState and the BotAction union), harvested at build time.
                    ...vendoredBotProperties(),

                    // stdlib
                    'willReadFrequently',
                    'usedJSHeapSize',

                    // wasm
                    // must be callable:
                    '_abort_js',
                    'emscripten_resize_heap',
                    'fd_close',
                    'fd_seek',
                    'fd_write',
                    // must be an object:
                    'env',
                    'wasi_snapshot_preview1',
                    // is not an object:
                    'instance',
                    // is not a function:
                    'emscripten_stack_init',
                    'emscripten_stack_get_end',
                    '__wasm_call_ctors',
                    // imports:
                    'HEAPU8',
                    // exports:
                    '_emscripten_stack_restore',
                    '_emscripten_stack_alloc',
                    'emscripten_stack_get_current',
                    'memory',
                    '_malloc',
                    'malloc',
                    '_free',
                    'free',
                    '_realloc',
                    'realloc',
                    '__indirect_function_table',
                    '_tsf_load_memory',
                    'tsf_load_memory',
                    '_tsf_close',
                    'tsf_close',
                    '_tsf_reset',
                    'tsf_reset',
                    '_tsf_set_output',
                    'tsf_set_output',
                    '_tsf_channel_set_bank_preset',
                    'tsf_channel_set_bank_preset',
                    '_tml_load_memory',
                    'tml_load_memory',
                    '_midi_render',
                    'midi_render',
                    'setValue',
                    'getValue',
                    'calledRun',

                    // dns-json response fields
                    'Status',
                    'Answer',

                    // main thread <-> ondemand worker protocol
                    'type',
                    'versions',
                    'crcs',
                    'host',
                    'secured',
                    'ingame',
                    'dbEnabled',
                    'archive',
                    'file',
                    'priority',
                    'urgent',
                    'data',
                    'message',
                    'failCount',
                    'error',
                    'id'
                ]
            }
        }
    });

    script.source = mini.code ?? '';
    script.sourcemap = mini.map?.toString() ?? '';
    return true;
}

// ----

if (!fs.existsSync('out')) {
    fs.mkdirSync('out');
}

fs.copyFileSync('src/3rdparty/tinymidipcm/tinymidipcm.wasm', 'out/tinymidipcm.wasm');

const args = process.argv.slice(2);
const prod = args[0] !== 'dev';

const entrypoints = [
    'src/client/Client.ts',
    'src/mapview/MapView.ts',
    'src/io/OnDemandWorker.ts'
];

for (const file of entrypoints) {
    const output = path.basename(file).replace('.ts', '.js').toLowerCase();

    const script = await bunBuild(file, [], prod, prod ? ['console'] : []);
    if (script) {
        if (prod) {
            await applyTerser(script);
        }

        fs.writeFileSync(`out/${output}`, script.source);
        fs.writeFileSync(`out/${output}.map`, script.sourcemap);
    }
}
