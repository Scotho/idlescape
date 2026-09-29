// web/src/frame/stageWindows.ts -- the two windows over the stage.
//
// `#bank-host` and `#trace-host` are siblings inside `#stage`, both mount a `.window` from the
// Task 7 family, and both are FRAME-lifetime rather than panel-lifetime: the bank window is
// opened by the bank panel and the trace window by the Automation panel, the run card and the
// co-pilot bar, and neither may die when the surface that opened it closes.
//
// `main.ts` built the bank's three collaborators inline until Task 16 added a second window. It
// is the composition root and not a place to keep six more names (plan ruling R32, which is why
// Task 10 moved the register block out and Task 11 the singletons); this is the same move for
// the stage's windows, and it is also what makes the trace wiring reachable from a unit test.
import { createIconCache, type IconSource } from '../bank/icons';
import { createBankWindow, type BankWindow } from '../bank/view';
import { contractsStubs, createMenuRegistry } from '../bank/contextMenu';
import { createTraceWindow, type TraceWindow } from './traceWindow';
import type { BankStore } from '../bank/store';
import type { ObjInfo } from '../bank/types';
import type { TasksApi } from '../tasks/api';

export interface StageWindowDeps {
  bankHost: HTMLElement;
  traceHost: HTMLElement;
  /** The account's bank store, started and stopped by `frame/singletons.ts` (ruling R10). */
  store: BankStore;
  /** Static obj facts, read from whichever character frame is in front. */
  info(obj: number): ObjInfo | null;
  /** The active session's hooks, for the icon cache. Null with no character open (ruling R14). */
  client(): IconSource | null;
  /** The router, which follows whichever character tab is in front. */
  api(): TasksApi;
  notify(message: string, kind?: 'info' | 'error'): void;
  /** The bank's x and Escape close the panel that opened the window. */
  closePanel(): void;
}

export interface StageWindows {
  bank: BankWindow;
  trace: TraceWindow;
  /** The page teardown. Both windows go, and the trace's document listener with it. */
  dispose(): void;
}

export function createStageWindows(deps: StageWindowDeps): StageWindows {
  const registry = createMenuRegistry();
  for (const stub of contractsStubs()) registry.register(stub);
  const bank = createBankWindow(deps.bankHost, {
    store: deps.store, icons: createIconCache({ client: deps.client }), info: deps.info, registry,
    notify: deps.notify, onClose: deps.closePanel
  });
  const trace = createTraceWindow(deps.traceHost, {
    api: deps.api,
    // The one clipboard write in the shell that is not inside a panel: the window is a frame
    // surface, so the toast is the frame's too.
    copy: text => { void navigator.clipboard?.writeText(text)
      .then(() => deps.notify('Copied; paste it into your Claude session.'))
      .catch(() => deps.notify('Could not reach the clipboard.', 'error')); }
  });
  return { bank, trace, dispose() { trace.dispose(); bank.destroy(); } };
}
