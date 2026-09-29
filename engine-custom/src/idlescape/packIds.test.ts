/**
 * The pack-id pin, asserted against the TRACKED source rather than against the clone.
 *
 * `scripts/verify.ps1` runs these suites from engine/server (its comment at :147-166 explains why
 * the paths must be relative), so `../../content-custom/pack` is the repository's own copy and
 * `../content/pack` is the clone's post-overlay copy. This suite reads the tracked one on purpose:
 * a fresh checkout always has it, while the clone's copy is ours only if an overlay run put it
 * there. Whether the clone matches is a different question, for `scripts/content-overlay.ps1
 * -Check` rather than for this suite; entry 3's Task 4 is what wires that check into the same
 * verify step, which until then applies the engine overlay only.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { ALLOCATED_IDS, checkPack, checkPackDir, parsePack, SHIPPED_IDS, UPSTREAM_TAIL } from '#/idlescape/packIds.js';

const PACK_DIR = path.resolve('..', '..', 'content-custom', 'pack');
const PACKS = ['obj', 'inv', 'loc', 'varp'];

function readPack(pack: string): string {
    return fs.readFileSync(path.join(PACK_DIR, `${pack}.pack`), 'utf8');
}

describe('packIds', () => {
    it('every pinned pack file is present in content-custom', () => {
        for (const pack of PACKS) {
            const file = path.join(PACK_DIR, `${pack}.pack`);
            assert.ok(fs.existsSync(file), `${file} is missing; the sprint spec's section 3 allocates ids in it`);
        }
    });

    it('every pinned pack file agrees with the pin', () => {
        for (const pack of PACKS) {
            assert.deepStrictEqual(checkPack(pack, readPack(pack)), [], `content-custom/pack/${pack}.pack`);
        }
    });

    it('the nine shipped bank-tab varps are on their exact ids', () => {
        const byId = parsePack(readPack('varp'));
        for (const pin of SHIPPED_IDS) {
            assert.strictEqual(byId.get(pin.id), pin.name);
        }
    });

    it('no allocated id has been squatted by another name', () => {
        for (const pin of ALLOCATED_IDS) {
            const actual = parsePack(readPack(pin.pack)).get(pin.id);
            assert.ok(actual === undefined || actual === pin.name, `${pin.pack}.pack id ${pin.id} is "${actual}"; the sprint allocates it to "${pin.name}"`);
        }
    });

    it('the recorded upstream tails match the files', () => {
        for (const tail of UPSTREAM_TAIL) {
            assert.strictEqual(parsePack(readPack(tail.pack)).get(tail.id), tail.name);
        }
    });

    it('a renumbered shipped id fails', () => {
        const original = readPack('varp');
        const mutated = original.replace('367=banktab_size_9', '368=banktab_size_9');
        assert.notStrictEqual(mutated, original, 'the mutation did not apply');

        const problems = checkPack('varp', mutated);
        assert.ok(problems.some(p => p.includes('id 367 must be "banktab_size_9"')), problems.join('\n'));
    });

    it('an allocated name on the wrong id fails, in both directions', () => {
        const wrongId = `${readPack('obj').trimEnd()}\n3999=time_candy\n`;
        const byName = checkPack('obj', wrongId);
        assert.ok(byName.some(p => p.includes('"time_candy" is allocated id 3894')), byName.join('\n'));

        const wrongName = `${readPack('obj').trimEnd()}\n3894=time_candy_typo\n`;
        const byIdProblems = checkPack('obj', wrongName);
        assert.ok(byIdProblems.some(p => p.includes('id 3894 is allocated to "time_candy"')), byIdProblems.join('\n'));
    });

    it('a hole in the upstream prefix fails', () => {
        const holed = readPack('inv').split('\n').filter(l => !l.startsWith('100=')).join('\n');
        const problems = checkPack('inv', holed);
        assert.ok(problems.some(p => p.includes('upstream id 100 has no line')), problems.join('\n'));
    });

    it('a duplicate id throws rather than being reported', () => {
        assert.throws(() => parsePack('0=a\n1=b\n1=c\n'), /repeats id 1/);
    });

    it('a malformed line throws, so a truncated pack cannot read as clean', () => {
        assert.throws(() => parsePack('0=a\nbanktab_size_1\n'), /pack line 2 is not "<id>=<name>": banktab_size_1/);
        assert.throws(() => parsePack('0=a\n3894x=time_candy\n'), /pack line 2 has a non-numeric id "3894x"/);
    });

    it('the same name on two ids is reported even when the lower id is the allocated one', () => {
        const doubled = `${readPack('obj').trimEnd()}\n3894=time_candy\n3999=time_candy\n`;
        const problems = checkPack('obj', doubled);
        assert.ok(problems.some(p => p.includes('name "time_candy" is on id 3894 and again on id 3999')), problems.join('\n'));
    });

    it('CRLF parses identically to LF, so a checkout filter cannot change the answer', () => {
        const lf = readPack('inv');
        assert.deepStrictEqual([...parsePack(lf.replace(/\n/g, '\r\n'))], [...parsePack(lf)]);
    });
});

describe('checkPackDir', () => {
    it('reads every .pack in the directory and never opens anything else', () => {
        const read: string[] = [];
        const problems = checkPackDir(['obj.pack', 'server', 'varp.pack.bak', 'varp.pack', 'pack.json'], name => {
            read.push(name);
            if (name !== 'obj.pack' && name !== 'varp.pack') {
                throw new Error(`the reader was handed ${name}, which is not a .pack`);
            }

            return readPack(name.slice(0, name.length - '.pack'.length));
        });

        assert.deepStrictEqual(read, ['obj.pack', 'varp.pack']);
        assert.deepStrictEqual(problems, []);
    });

    it('reports every file that disagrees with the pin, not only the first', () => {
        const problems = checkPackDir(['obj.pack', 'varp.pack'], name => {
            if (name === 'obj.pack') {
                return `${readPack('obj').trimEnd()}\n3894=time_candy_typo\n`;
            }

            return readPack('varp').replace('367=banktab_size_9', '368=banktab_size_9');
        });

        assert.ok(problems.some(p => p.startsWith('obj.pack: id 3894 is allocated to "time_candy"')), problems.join('\n'));
        assert.ok(problems.some(p => p.startsWith('varp.pack: id 367 must be "banktab_size_9"')), problems.join('\n'));
    });

    it('a clean directory of every pinned pack is empty, which is what both packAll callers now assert twice', () => {
        assert.deepStrictEqual(checkPackDir(PACKS.map(p => `${p}.pack`), name => readPack(name.slice(0, name.length - '.pack'.length))), []);
    });
});
