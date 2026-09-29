// web/src/ui/copy.test.ts -- every mock string that carries an em dash lives in one module
// (plan ruling R1). The sprint forbids em dashes in new prose; the design authority calls the
// mock's copy final. This file is the seam: if the owner reverses R1, it is one commit.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as copy from './copy';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(join(here, rel), 'utf8');

describe('copy.ts', () => {
  it('holds exactly the eight plain em-dashed strings the mock ships', () => {
    // Twelve strings in the mock carry an em dash (grep -c on the .dc.html returns 12): these
    // eight, plus the four templates in the third case below.
    expect(copy.EM_DASH_COPY).toEqual([
      'not paired — Claude can play this character alongside you',
      'paused — you took control',
      'Items you pick up appear here as you play — or as Claude plays for you.',
      'Loosen the filters — or go make something happen.',
      'Paused — you moved the mouse',
      'Gateway connected — ws ok',
      'view & reorder only — items move in game',
      '(same-origin iframe — never restyled)'
    ]);
  });

  it('every em-dashed export is in the list, and every list entry is an export', () => {
    // Widened to `unknown` on the way in, not cast on the way out: every const here is literal
    // typed, so `Object.entries(copy)` is a union of twelve literals plus four functions and a
    // `[string, string]` predicate over it is not assignable. This is the same narrowing without
    // an `as`, which the sprint forbids.
    const entries: [string, unknown][] = Object.entries(copy);
    const exported = entries
      .filter((e): e is [string, string] => typeof e[1] === 'string')
      .map(([, v]) => v)
      .filter(v => v.includes('—'));
    // Mutation target: adding a fourteenth em-dashed const without listing it must fail here.
    expect([...exported].sort()).toEqual([...copy.EM_DASH_COPY].sort());
  });

  it('the templated strings render with an em dash too, at the mock\'s own numbers', () => {
    expect(copy.pausedResumes(4)).toBe('You took control — resumes in 4s. Esc pauses again any time.');
    expect(copy.runFailed('Mine and drop', 'needs a bronze pickaxe')).toBe('Mine and drop failed — needs a bronze pickaxe');
    // `Idlescape Shell v2.dc.html:134`, verbatim. The middot is the separator and the em dash is
    // inside the clause; the template keeps both, in that order.
    expect(copy.tracePoppedOut(312)).toBe('312 events · popped out — the panel stays free');
    // `Bank updated — 27 / 240 slots used` is a template, not a const: the mock's literal carries
    // fixed numbers and the producer in Task 11 formats the same sentence with real ones.
    expect(copy.bankUpdated(27, 240)).toBe('Bank updated — 27 / 240 slots used');
  });

  it('the styleguide fills its demo rows from here rather than retyping them', () => {
    // The other half of "no surface inlines one of these strings", for the one surface that sits
    // outside src/ and so is invisible to the export sweep above. Task 21 photographs the
    // styleguide, so a hand-written near-miss on it pins the wrong words as the baseline.
    const page = read('../../styleguide.html');
    const script = read('../styleguide.ts');
    const hooks = Array.from(page.matchAll(/data-sg-copy="([a-zA-Z]+)"/g)).map(m => m[1] as string);
    // Document order. Task 19 added the Loot Tracker panel demo to `#panel`, which is why
    // `lootEmpty` appears twice: once as the panel the copy belongs to, and once in the empty-state
    // row of `#alerts` beside the Events one.
    expect(hooks).toEqual([
      'bankFooterNote', 'lootEmpty', 'runFailed', 'bankUpdated', 'lootEmpty', 'eventsEmpty',
      'tracePoppedOut', 'bankFooterNote'
    ]);
    // Both halves of every pair, so a hook renamed on one side leaves an empty demo loudly.
    for (const hook of hooks) expect(script).toContain(`${hook}:`);
    // Mutation targets: either window footer typed into the page instead of hooked up here.
    expect(page).not.toContain('popped out');
    expect(page).not.toContain('reorder only');
  });
});
