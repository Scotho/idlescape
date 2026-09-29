// The two stage windows, as one composition. `main.ts`'s module body cannot be executed under
// jsdom, so before Task 16 nothing at all tested that the bank window was handed the frame's
// store or that the trace window was handed the router. Both claims are here.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createStageWindows, type StageWindows } from './stageWindows';
import { fakeBankStore } from '../bank/store.fake';
import { fakeApi, run, status } from '../plugins/builtin/tasks.harness';
import type { TraceEvent } from '../tasks/types';

const EVENTS: TraceEvent[] = [{ seq: 1, at: 0, kind: 'log', level: 'info', text: 'hello' }];

let live: StageWindows | null = null;

function mount() {
  document.body.innerHTML = '<div id="bank-host"></div><div id="trace-host"></div>';
  const fake = fakeBankStore();
  const api = fakeApi(vi.fn, {
    status: vi.fn(() => ({ ...status('running'), runId: 'r1' })),
    getRun: vi.fn(async () => ({ summary: run({}), events: EVENTS }))
  });
  const notify = vi.fn();
  const closePanel = vi.fn();
  const windows = createStageWindows({
    bankHost: document.getElementById('bank-host')!, traceHost: document.getElementById('trace-host')!,
    store: fake.store, info: () => null, client: () => null, api: () => api, notify, closePanel
  });
  live = windows;
  return { windows, fake, api, notify, closePanel };
}

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { live?.dispose(); live = null; });

describe('the stage windows', () => {
  test('each window mounts into its own host and neither is open on build', () => {
    const { windows } = mount();
    expect(windows.bank.isOpen()).toBe(false);
    expect(windows.trace.isOpen()).toBe(false);
    expect(document.getElementById('trace-host')!.querySelector('.trace-window')).toBeNull();
  });

  test('the trace window reads the router it was handed, and mounts into #trace-host', async () => {
    const { windows, api } = mount();
    await windows.trace.open('r1', 'Chop and drop');
    expect(api.getRun).toHaveBeenCalledWith('r1');
    expect(document.getElementById('trace-host')!.querySelector('.trace-window')).not.toBeNull();
    // Mutation target: a stageWindows that built the trace over `bankHost` passes every other
    // case in this file, because both hosts are in the same document.
    expect(document.getElementById('bank-host')!.querySelector('.trace-window')).toBeNull();
  });

  test('the bank window opens over its own host and closes the panel that opened it', () => {
    const { windows, closePanel, fake } = mount();
    windows.bank.open();
    expect(document.getElementById('bank-host')!.querySelector('#bank-window')).not.toBeNull();
    windows.bank.close();
    expect(closePanel).toHaveBeenCalledTimes(1);
    // Ruling R10: the store belongs to the frame, so a window opening does not start it.
    expect(fake.calls.start).toBe(0);
  });

  test('the copy the trace hands out reaches the clipboard and toasts through notify', async () => {
    const { windows, notify } = mount();
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await windows.trace.open('r1', 'Chop and drop');
    document.querySelector<HTMLButtonElement>('[data-trace-copy]')!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(writeText.mock.calls[0]![0]).toContain('log [info] hello');
    expect(notify).toHaveBeenCalledWith('Copied; paste it into your Claude session.');
  });

  test('dispose takes both windows down, and the trace listener with them', async () => {
    const { windows } = mount();
    await windows.trace.open('r1', 'Chop and drop');
    windows.bank.open();
    windows.dispose();
    live = null;
    expect(document.querySelector('.trace-window')).toBeNull();
    expect(document.querySelector('#bank-window')).toBeNull();
    await windows.trace.open('r1', 'Chop and drop');
    expect(document.querySelector('.trace-window')).toBeNull();
  });
});
