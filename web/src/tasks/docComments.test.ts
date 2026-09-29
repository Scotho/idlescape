// PROVISIONAL, plan ruling R25. Gate 2 (web/src/tasks/docs/apiIndex.test.ts) asks the real
// question, over the emitted index, and Task 16 deletes this file in the same commit that lands
// it. It exists because 28 doc comments written with no gate is 28 doc comments one of which
// goes missing in the next sub-project.
//
// Fix round 1 widened it past `scriptContext.ts`. The bags moved to `scriptContext.opts.ts` and
// the four Task 1 left in `types.ts` were outside every assertion here, and three member
// comments said something the collaborator does not do, which no scan of comment PRESENCE can
// catch. The three checks below therefore read the collaborator's own source as well.
import { describe, expect, test } from 'vitest';
import source from './scriptContext.ts?raw';
import optsSource from './scriptContext.opts.ts?raw';
import typesSource from './types.ts?raw';
import paramsSource from './params.ts?raw';
import waitSource from './wait.ts?raw';
import vendorSource from '../vendor/rs-sdk/sdk/types.ts?raw';

/** Every line inside the ScriptContext block that declares a member, with its indent. */
function declarationsIn(block: string): { line: string; documented: boolean }[] {
  const lines = block.split('\n');
  const out: { line: string; documented: boolean }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s{2,}[a-zA-Z]\w*[(?:<]/.test(line) && !/^\s{2,}[a-zA-Z]\w*\??:/.test(line)) continue;
    if (/^\s*\*/.test(line)) continue;
    const above = lines.slice(Math.max(0, i - 12), i).join('\n');
    out.push({ line: line.trim(), documented: /\*\/\s*$/.test(above.trimEnd()) });
  }
  return out;
}

/** The doc comment sitting immediately above the first line that contains `decl`. */
function docAbove(text: string, decl: string): string {
  const lines = text.split('\n');
  const at = lines.findIndex(l => l.includes(decl));
  if (at < 1) throw new Error(`no declaration line containing ${decl}`);
  const out: string[] = [];
  for (let i = at - 1; i >= 0 && !/^\s*\/\*\*/.test(lines[i]); i--) out.unshift(lines[i]);
  return out.join('\n');
}

describe('S11: every member we own is documented', () => {
  const block = source.slice(source.indexOf('export interface ScriptContext'));
  const decls = declarationsIn(block.slice(0, block.indexOf('\n}')));

  test('finds the whole surface, so an empty scan cannot pass', () => {
    expect(decls.length).toBeGreaterThanOrEqual(34);
  });

  test('every declaration site carries a doc comment', () => {
    expect(decls.filter(d => !d.documented).map(d => d.line)).toEqual([]);
  });

  test('every options-bag field carries one too, in the file the bags moved to', () => {
    const bags = declarationsIn(optsSource);
    expect(bags.length).toBeGreaterThanOrEqual(31);
    expect(bags.filter(d => !d.documented).map(d => d.line)).toEqual([]);
  });

  test('so do the four bags Task 1 left in types.ts', () => {
    const undocumented: string[] = [];
    for (const head of ['export interface FindOpts', 'export interface SweepOpts',
      'export interface TravelOpts', 'export interface TravelResult']) {
      const at = typesSource.indexOf(head);
      expect(at).toBeGreaterThan(0);
      const block = typesSource.slice(at, typesSource.indexOf('\n}', at));
      undocumented.push(...declarationsIn(block).filter(d => !d.documented).map(d => d.line));
    }
    expect(undocumented).toEqual([]);
  });

  test('no doc comment contains an em dash, in any of the three files', () => {
    expect(source).not.toContain('—');
    expect(optsSource).not.toContain('—');
    expect(typesSource).not.toContain('—');
  });
});

describe('S11: the comment says what the collaborator actually does', () => {
  test('c.bot promises no `reason` the vendored results do not carry', () => {
    // The vendored shapes the sentence used to generalise over. Neither declares a `reason`.
    const talk = /export interface TalkResult \{[^}]*\}/.exec(vendorSource);
    const chop = /export interface ChopTreeResult \{[^}]*\}/.exec(vendorSource);
    expect(talk?.[0]).not.toContain('reason');
    expect(chop?.[0]).not.toContain('reason');
    const doc = docAbove(source, 'bot: ScriptBot;');
    expect(doc).not.toContain('Every member reports an `ActionResult`');
    expect(doc).toContain('the result SHAPE is per action');
    expect(doc).toContain('no `reason` at all');
    expect(doc).toContain('bare boolean');
  });

  test('c.params states both arms, the way validateParams implements them', () => {
    // The empty-schema arm is what a user-written script always takes: it declares no schema.
    expect(paramsSource).toContain('if (keys.length === 0) {');
    const doc = docAbove(source, 'params: ParamValues;');
    expect(doc).not.toContain('an undeclared one is never');
    expect(doc).toContain('where it declares none');
    expect(doc).toContain('comes through as given');
  });

  test('c.wait.hp says what it does, what false means, and what it costs', () => {
    // A predicate that can never match still ends: `untilP` arms this timeout at the call.
    expect(waitSource).toContain('export const DEFAULT_WAIT_MS = 20_000;');
    const doc = docAbove(source, 'hp(opts: WaitHpOpts)');
    expect(doc).toContain('belowPercent');
    expect(doc).toContain('abovePercent');
    expect(doc).toContain('percentage of the maximum');
    expect(doc).toContain('false on timeout or stop');
    expect(doc).toContain('20000 by default');
  });

  test('c.wait.ticks carries the whole comment the plan wrote out, not its first sentence', () => {
    const doc = docAbove(source, 'ticks(n: number)');
    expect(doc).toContain("a tick is the server's own beat");
    expect(doc).toContain('the only delay a script may express');
  });
});
