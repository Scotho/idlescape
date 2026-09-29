// The nine behaviours SP4b Task 10 added to the run banner, re-earned on the bar (the plan's Task
// 14 carry-forward table). The detail row is a SIBLING of the live region here, split into what
// the run is doing and what it is earning; the second span is the slot a later entry writes a
// rate-derived line into.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createCopilotBar, type CopilotBar } from './copilotBar';
import { fakeApi } from '../plugins/builtin/tasks.harness';
import { playerState, worldState } from '../agent/world.harness';
import type { PairingState } from './pairing';
import type { SessionState } from '../sessions/types';
import type { RunStatus } from '../tasks/types';
import type { PlayerState } from '../vendor/rs-sdk/sdk/types';

const SHELL = `<div id="wrap">
  <div id="copilot-bar" role="status"></div>
  <div id="copilot-detail" hidden></div>
  <div class="copilot-rule" data-state="idle"></div>
  <nav id="strip"><button class="strip-btn" data-panel="tasks"></button></nav>
</div>`;

let pairing: PairingState = 'paired-live';
let session: SessionState = 'online';
let live: CopilotBar | null = null;

function mount(player: Partial<PlayerState> | null = null) {
  document.body.innerHTML = SHELL;
  pairing = 'paired-live';
  session = 'online';
  // `getState` is the bar's only way to a position: `RunStatus` carries none.
  const api = fakeApi(vi.fn, { getState: vi.fn(() => (player ? worldState({ player: playerState(player) }) : null)) });
  const root = document.getElementById('copilot-bar')!;
  const detail = document.getElementById('copilot-detail')!;
  const bar = createCopilotBar({
    bar: root, detail, rule: document.querySelector<HTMLElement>('.copilot-rule')!,
    strip: () => document.getElementById('strip')!,
    api: () => api, pairing: () => pairing, session: () => session,
    openPanel: vi.fn(), openTrace: vi.fn(), notify: vi.fn(), now: () => 100_000
  });
  live = bar;
  return { bar, root, detail };
}

afterEach(() => { live?.dispose(); live = null; });

const st = (o: Partial<RunStatus> = {}): RunStatus => ({
  state: 'running', reason: null, runId: 'r', scriptId: 's', scriptName: 'Chop and drop', task: 'Chop tree',
  statusLine: 'chopping', attempts: 1, startedAt: 100_000 - 125_000, attached: false, resumeAtMs: null,
  target: null, health: null, xpPerHour: {}, ...o
});

describe("the co-pilot bar's detail row", () => {
  test('names the target, the recovery and the position on the left, and the rate on the right', () => {
    const { bar, detail } = mount({ worldX: 3204, worldZ: 3218 });
    bar.update(st({
      target: { via: 'scene', kind: 'tree', name: 'Oak', distance: 12 },
      health: { condition: 'dialog-stuck', since: 90_000 },
      xpPerHour: { Woodcutting: 12_000 }
    }));
    const what = detail.querySelector<HTMLElement>('[data-bar-detail]')!;
    const rate = detail.querySelector<HTMLElement>('[data-bar-rate]')!;
    expect(what.textContent).toBe('Oak (12 tiles) · recovering: dialog-stuck · 3204, 3218');
    expect(rate.textContent).toBe('12,000 Woodcutting xp/h');
    expect(detail.hidden).toBe(false);
  });

  // The reserved slot, on its own: a later entry writes a rate-derived line into `[data-bar-rate]`
  // without moving anything else on the bar.
  test('a run with a rate and nothing else fills the right span alone and still shows the row', () => {
    const { bar, detail } = mount();
    bar.update(st({ xpPerHour: { Woodcutting: 41_600 } }));
    expect(detail.querySelector('[data-bar-detail]')?.textContent).toBe('');
    expect(detail.querySelector('[data-bar-rate]')?.textContent).toBe('41,600 Woodcutting xp/h');
    expect(detail.hidden).toBe(false);
  });

  test('both spans are kept out of the live region, and the row is a sibling of it', () => {
    const { bar, root, detail } = mount({ worldX: 3204, worldZ: 3218 });
    bar.update(st({}));
    expect(detail.querySelector('[data-bar-detail]')?.getAttribute('aria-hidden')).toBe('true');
    expect(detail.querySelector('[data-bar-rate]')?.getAttribute('aria-hidden')).toBe('true');
    // Mutation target: mounting the row inside `#copilot-bar` finds it here, and puts a line that
    // moves every second back inside an atomic live region.
    expect(root.querySelector('[data-bar-detail]')).toBeNull();
  });

  // Found on a live stack: the position comes from the CLIENT, which knows where the player is
  // standing whether or not a script is driving, so an idle bar sat there reading "3204, 3218"
  // and the toggle came with it. The mock draws no second row in the unpaired and standby states.
  test('an idle bar shows no row, even when the client knows where the player is', () => {
    const { bar, root, detail } = mount({ worldX: 3204, worldZ: 3218 });
    bar.update(st({ state: 'idle', xpPerHour: { Woodcutting: 12_000 }, health: { condition: 'death', since: 1 } }));
    expect(detail.hidden).toBe(true);
    expect(detail.querySelector('[data-bar-detail]')?.textContent).toBe('');
    expect(root.querySelector<HTMLElement>('[data-bar-detail-toggle]')!.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('[data-bar-health]')!.hidden).toBe(true);
  });

  test('a run with nothing to report takes the row off screen and the toggle with it', () => {
    const { bar, root, detail } = mount();
    bar.update(st({}));
    expect(detail.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('[data-bar-detail-toggle]')!.hidden).toBe(true);
  });

  test('the detail line is painted from the status, never from the clock', () => {
    const { bar, detail } = mount({ worldX: 3204, worldZ: 3218 });
    bar.update(st({ target: { via: 'scene', kind: 'tree', name: 'Oak', distance: 4 } }));
    const what = detail.querySelector('[data-bar-detail]');
    bar.refresh();
    expect(detail.querySelector('[data-bar-detail]')).toBe(what);
    expect(what!.textContent).toContain('Oak (4 tiles)');
  });

  test('the health pip is lit only while a recovery is running, and names the condition', () => {
    const { bar, root } = mount();
    bar.update(st({}));
    const pip = root.querySelector<HTMLElement>('[data-bar-health]')!;
    expect(pip.hidden).toBe(true);
    bar.update(st({ health: { condition: 'dialog-stuck', since: 90_000 } }));
    expect(pip.hidden).toBe(false);
    expect(pip.title).toContain('dialog-stuck');
    bar.update(st({ health: null }));
    expect(pip.hidden).toBe(true);
  });

  test('the row collapses on the toggle and stays collapsed across updates', () => {
    const { bar, root, detail } = mount();
    bar.update(st({ target: { via: 'scene', kind: 'tree', name: 'Oak', distance: 4 } }));
    const toggle = root.querySelector<HTMLButtonElement>('[data-bar-detail-toggle]')!;
    expect(detail.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    expect(detail.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    // Spec decision 12: collapsible, and no setting behind it. The choice survives the next
    // status, which arrives once a second while a run is live.
    bar.update(st({ task: 'another', target: { via: 'scene', kind: 'tree', name: 'Oak', distance: 4 } }));
    expect(detail.hidden).toBe(true);
    toggle.click();
    expect(detail.hidden).toBe(false);
  });

  test('dispose takes the row, the pip and the rule state with it', () => {
    const { bar, root, detail } = mount({ worldX: 3204, worldZ: 3218 });
    bar.update(st({ target: { via: 'scene', kind: 'tree', name: 'Oak', distance: 4 }, health: { condition: 'death', since: 1 } }));
    bar.dispose();
    live = null;
    expect(detail.querySelector('[data-bar-detail]')).toBeNull();
    expect(root.querySelector('[data-bar-health]')).toBeNull();
    expect(detail.hidden).toBe(true);
    expect(document.querySelector('.copilot-rule')?.getAttribute('data-state')).toBe('idle');
  });
});
