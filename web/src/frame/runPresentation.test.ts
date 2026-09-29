// The whole mapping table, so nothing falls through. Rows are map-contracts.md section 1.4.
import { describe, expect, it } from 'vitest';
import { HEALTH_COPY, presentRun, type CopilotState, type RunPresentationInput } from './runPresentation';
import type { RunStatus } from '../tasks/types';

// `RunStatus.statusLine` is `string` and not `string | null` (tasks/types.ts:302), so a fixture
// with `statusLine: null` fails `npm run typecheck` for a reason unrelated to its subject. The
// empty string is the "no line" value, and presentRun's second arm reads `statusLine.trim() ||
// null` so it falls through to the fallback rather than rendering blank.
// `target`, `health` and `xpPerHour` are SP4b Task 10's fields, at tasks/types.ts:309, :311 and
// :313. All three are REQUIRED on RunStatus (no `?`), so a fixture that omits any of them fails
// `npm run typecheck` before a case runs.
const status = (over: Partial<RunStatus> = {}): RunStatus => ({
  state: 'idle', reason: null, runId: null, scriptId: null, scriptName: null, task: null,
  statusLine: '', attempts: 0, startedAt: null, attached: false, resumeAtMs: null,
  target: null, health: null, xpPerHour: {}, ...over
});
const at = (over: Partial<RunPresentationInput> = {}): RunPresentationInput =>
  ({ status: status(), pairing: 'paired-live', session: 'online', now: 10_000, settledAt: null, ...over });

describe('presentRun', () => {
  it('maps every RunState onto one of the five presented states, with nothing falling through', () => {
    const seen = new Set<CopilotState>();
    for (const state of ['idle', 'starting', 'running', 'paused', 'done', 'failed', 'stopped'] as const) {
      // settledAt inside the linger window is what lets `failed` produce `stuck` here; with the
      // default null there is no anchor and this set would be missing it.
      seen.add(presentRun(at({ status: status({ state }), settledAt: 10_000 })).state);
    }
    expect([...seen].sort()).toEqual(['paused', 'running', 'standby', 'stuck']);
  });

  it('reads paused+stuck as stuck and paused+hard-stop as stuck', () => {
    expect(presentRun(at({ status: status({ state: 'paused', reason: 'stuck' }) })).state).toBe('stuck');
    expect(presentRun(at({ status: status({ state: 'paused', reason: 'hard-stop' }) })).state).toBe('stuck');
  });

  // The STATE and the HEADLINE both, because R22 hands this headline to the run card's badge as
  // well: `tasksViews.statusLabel` only title-cases it, so a word changed here ships on two
  // surfaces at once. Asserting the state alone let all three reasons collapse onto one string.
  it('reads every other pause reason, and a null reason, as paused, with one headline each', () => {
    const rows = [
      ['player', 'paused — you took control'],
      ['claude', 'paused by Claude'],
      ['human-input', 'paused — you took control'],
      [null, 'paused']
    ] as const;
    for (const [reason, headline] of rows) {
      const p = presentRun(at({ status: status({ state: 'paused', reason }) }));
      expect(p.state, String(reason)).toBe('paused');
      expect(p.headline, String(reason)).toBe(headline);
    }
  });

  it('reads starting as running: the run exists the moment it is asked for', () => {
    expect(presentRun(at({ status: status({ state: 'starting' }) })).state).toBe('running');
  });

  it('lingers a failed run in the stuck chrome from when it SETTLED, then lets it go (ruling R4)', () => {
    // startedAt is deliberately old: a run that ran for ten seconds and then failed must still
    // get its full linger window. Keying off startedAt would give it none.
    const s = status({ state: 'failed', startedAt: -10_000 });
    expect(presentRun(at({ status: s, settledAt: 0, now: 1_000, lingerMs: 4_000 })).state).toBe('stuck');
    expect(presentRun(at({ status: s, settledAt: 0, now: 9_000, lingerMs: 4_000 })).state).toBe('standby');
  });

  it('does not linger done or stopped: that news belongs in the toast', () => {
    for (const state of ['done', 'stopped'] as const) {
      expect(presentRun(at({ status: status({ state }), settledAt: 10_000 })).state).toBe('standby');
    }
  });

  it('is unpaired only when the account is unpaired AND no run is live (ruling R6)', () => {
    expect(presentRun(at({ pairing: 'unpaired' })).state).toBe('unpaired');
    expect(presentRun(at({ pairing: 'unpaired', status: status({ state: 'running' }) })).state).toBe('running');
    // ...and the pill still tells the truth about pairing.
    expect(presentRun(at({ pairing: 'unpaired', status: status({ state: 'running' }) })).pill).toBe('● not paired');
    expect(presentRun(at({ pairing: 'paired-live', status: status({ state: 'running' }) })).pill).toBe('● claude driving');
    expect(presentRun(at({ pairing: 'paired-stale' })).pill).toBe('● claude paired');
  });

  it('blocks the primary action while the character is not online, with the moved copy (ruling R5)', () => {
    const p = presentRun(at({ session: 'connecting' }));
    expect(p.blocked).toBe(true);
    // The four literals are MOVED from stage.ts:277-281, byte for byte. The ellipsis is U+2026
    // and the separator is U+00B7; do not "tidy" either into ASCII, and do not retype them.
    expect(p.headline).toBe('connecting…');
    expect(presentRun(at({ session: 'booting' })).headline).toBe('starting…');
    expect(presentRun(at({ session: 'offline' })).headline).toBe('offline · press Login to reconnect');
    expect(presentRun(at({ session: 'title' })).headline).toBe('press Login to play');
    // An online character is never blocked, and takes the mock's own copy back.
    expect(presentRun(at({})).blocked).toBe(false);
    expect(presentRun(at({})).headline).toBe('paired · standing by');
    expect(presentRun(at({ pairing: 'unpaired' })).headline)
      .toBe('not paired — Claude can play this character alongside you');
  });

  it('keeps a live run in its own chrome while the character is offline, but flags it blocked', () => {
    // R5 replaces the MESSAGE of the standby and unpaired chrome. A run still in flight keeps its
    // headline and its Stop button: the way out of a script must never depend on the login state.
    const p = presentRun(at({ session: 'offline', status: status({ state: 'running', statusLine: 'chopping' }) }));
    expect(p.state).toBe('running');
    expect(p.headline).toBe('chopping');
    expect(p.blocked).toBe(true);
  });

  it('takes the stuck reason from the health condition, then statusLine, then a fallback (ruling R23)', () => {
    const stuck = (over: Partial<RunStatus>) => presentRun(at({ status: status({ state: 'paused', reason: 'stuck', task: 'Chop tree', ...over }) }));
    expect(stuck({ health: { condition: 'no-progress', since: 0 } }).detail).toBe('nothing has moved for a while');
    expect(stuck({ statusLine: 'chopping the nearest tree' }).detail).toBe('chopping the nearest tree');
    // The ORDER, which is the whole of R23 and which neither line above can see: a stuck run
    // usually has both, and the diagnosis has to win over whatever the script last said.
    expect(stuck({ health: { condition: 'no-progress', since: 0 }, statusLine: 'chopping the nearest tree' }).detail)
      .toBe('nothing has moved for a while');
    expect(stuck({ statusLine: '   ' }).detail).toBe('no reason reported');   // blank is not a reason
    expect(stuck({}).detail).toBe('no reason reported');
    expect(stuck({}).headline).toBe('stuck on Chop tree');
    // A hard stop is not a stuck task: it names what stopped the run, and has no second line.
    const hard = presentRun(at({ status: status({ state: 'paused', reason: 'hard-stop', task: 'Chop tree' }) }));
    expect(hard.headline).toBe('stopped: hp too low');
    expect(hard.detail).toBeNull();
  });

  it('counts the resume down in whole seconds and never below zero', () => {
    const p = (resumeAtMs: number, now: number) => presentRun(at({ status: status({ state: 'paused', reason: 'player', resumeAtMs }), now })).resumeIn;
    expect(p(15_000, 10_000)).toBe(5);
    expect(p(10_400, 10_000)).toBe(1);      // rounds up: "resumes in 0s" is never shown
    expect(p(9_000, 10_000)).toBe(0);
    // Nothing else counts down: `resumeAtMs` is only ever set on a pause (tasks/runner.ts:60-64).
    expect(presentRun(at({ status: status({ state: 'running', resumeAtMs: 15_000 }) })).resumeIn).toBeNull();
  });

  // The tone is the DOT's, and the strip corner dot's, in the five presented states
  // (map-design 3.3's table). The rule beneath the bar is keyed off `state`, not off this, which
  // is why stuck can carry an amber dot and a red rule at once.
  it('tones the dot per presented state, and reddens a run that actually died', () => {
    expect(presentRun(at({ pairing: 'unpaired' })).tone).toBe('idle');
    expect(presentRun(at({})).tone).toBe('ok');
    expect(presentRun(at({ status: status({ state: 'running' }) })).tone).toBe('accent');
    expect(presentRun(at({ status: status({ state: 'paused', reason: 'player' }) })).tone).toBe('warn');
    expect(presentRun(at({ status: status({ state: 'paused', reason: 'stuck' }) })).tone).toBe('warn');
    expect(presentRun(at({ status: status({ state: 'paused', reason: 'hard-stop' }) })).tone).toBe('error');
    expect(presentRun(at({ status: status({ state: 'failed' }), settledAt: 10_000 })).tone).toBe('error');
  });

  it('names the failure on the second line while it lingers', () => {
    const p = presentRun(at({ status: status({ state: 'failed', statusLine: 'no Tree within 12 tiles' }), settledAt: 10_000 }));
    expect(p.state).toBe('stuck');
    expect(p.headline).toBe('run failed');
    expect(p.detail).toBe('no Tree within 12 tiles');
  });

  it('carries one copy line per health condition, so a tenth condition is a compile error', () => {
    // A Record over the union: adding a condition to tasks/types.ts without a line here fails
    // typecheck. This case pins the count so a line deleted at random fails a test too.
    expect(Object.keys(HEALTH_COPY)).toHaveLength(9);
    expect(HEALTH_COPY['low-hp']).toBe('hp fell below the hard stop');
  });
});
