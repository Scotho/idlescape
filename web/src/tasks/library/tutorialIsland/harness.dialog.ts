// The dialogue half of the Tutorial Island stage fake. Split out of `harness.ts` under R26:
// that file was 353 lines and P14's namespace does not fit beside `clickThrough` and
// `sendClickDialog`. `harness.ts` builds these and hangs them on the context it returns, so no
// stage test's import line changed.
//
// What is REAL here, and what is faked, because that is the whole value of the split. `c.dialog`
// is the SHIPPED `createDialog`, driven over the fake snapshot and the fake packet sender. A
// hand-written dialogue fake would have been free to send the array position, which is the one
// thing P14 exists to prevent, and every stage test would have gone green over it. What is faked
// is the layer below: the snapshot and the packet the client would answer.
//
// This file imports NOTHING from vitest, like `harness.ts` beside it, and unlike `harness.ts` it
// is inside the shipped tsconfig's own program (the exclude globs are `*.harness.ts` and
// `harness.ts`, neither of which matches `harness.dialog.ts`). So it must typecheck as shipped
// code does, and it may not import `harness.ts`, which would drag an excluded file into that
// program. The dependency runs one way: `harness.ts` imports this.
import { createDialog } from '../../dialog';
import { realChoices } from '../../../agent/constants';
import type { ActionResult, WorldState } from '../../../agent/types';
import type { ClickThroughOpts, ScriptContext } from '../../types';
import type { DialogOption } from '../../../vendor/rs-sdk/sdk/types';

/** What the live client calls the chatbox's own next-frame line. */
const CONTINUE_TEXT = 'Click here to continue';

/**
 * A dialogue frame as a test writes one.
 *
 * `index` is the server-assigned option number the real client answers with. It is 1-based and a
 * test may leave it out, in which case the fake assigns `position + 1` the way the server does
 * for a plain list; give it explicitly to pin that the script sends the server's number rather
 * than the array position.
 */
export interface HarnessDialog {
  isOpen: boolean;
  options?: { text: string; index?: number }[];
  text?: string;
}

export interface DialogFakeDeps {
  /** The dialogue frame the test set, before the fake fills in the continue line. */
  frame(): HarnessDialog | undefined;
  /** The whole fake snapshot, which the real `createDialog` reads through. */
  state(): WorldState;
  /** Records one click, the way the harness records every other call. */
  click(index: number): void;
  /** What an action answers: ok, or the cant-reach refusal `interactFails` asks for. */
  acted(): ActionResult;
  /** The harness's own `wait` fake, so a dialogue wait is recorded like every other wait. */
  wait: ScriptContext['wait'];
  signal(): AbortSignal;
}

export interface DialogFakes {
  /** The options `state()` publishes, with the continue line the live client attaches. */
  options(): DialogOption[];
  /** The `sdk` member, refusing exactly what `Client.clickDialogOption` refuses. */
  sendClickDialog(option?: number): Promise<ActionResult>;
  /** The shipped namespace, over the two fakes above. */
  dialog: ScriptContext['dialog'];
  /** The shipped shim, over the shipped namespace. */
  clickThrough(arg?: number | ClickThroughOpts): Promise<void>;
}

export function dialogFakes(d: DialogFakeDeps): DialogFakes {
  // The real `DialogOption` carries a server-assigned `index`; a fake whose options were bare
  // `{ text }` hid the whole index-versus-position question from every test that read them.
  //
  // An open dialog with no options given is an instructor SPEAKING, and the live client publishes
  // exactly one option on such a frame: "Click here to continue". A fixture with an empty array
  // is a frame no live world produces, and it is what let both `clickThrough` guards read raw
  // `options.length` and still look right (SP4b Task 14, fix round 1). Give options explicitly
  // to model a frame that really does offer a choice.
  const options = (): DialogOption[] => {
    const given = d.frame()?.options;
    if (given === undefined) return d.frame()?.isOpen === true ? [{ index: 1, text: CONTINUE_TEXT }] : [];
    return given.map((o, i) => ({ index: o.index ?? i + 1, text: o.text }));
  };

  const refuse = (message: string): ActionResult => ({ success: false, message, reason: 'invalid_option' });

  async function sendClickDialog(option = 0): Promise<ActionResult> {
    const all = options();
    if (option === 0) {
      // `realChoices`, not `all.length`: the client refuses the continue click only while a
      // CHOICE is pending, and the continue line is not one. A guard on the raw length refused
      // every ordinary instructor frame, which is most of the island's clicks, and it read as
      // correct only because the old `clickThrough` fake recorded its clicks without coming
      // through here at all.
      if (realChoices(all).length > 0) return refuse('a choice is pending; 0 is the continue click');
      d.click(0);
      return d.acted();
    }
    // An index outside the option list is not a click at all. A fake that recorded any number
    // made the 1-based server index look optional.
    if (all.length > 0 && !all.some(o => o.index === option)) return refuse(`no dialog option has index ${option}`);
    d.click(option);
    return d.acted();
  }

  const dialog = createDialog({
    state: d.state,
    click: sendClickDialog,
    wait: d.wait,
    signal: d.signal
  });

  return {
    options,
    sendClickDialog,
    dialog,
    // The shipped shim, restated rather than imported: `workerContext.ts` builds it inline
    // inside the context literal, so there is nothing to import. Restating it means a stage test
    // that calls `clickThrough` exercises the same two lines the Worker runs.
    async clickThrough(arg?: number | ClickThroughOpts): Promise<void> {
      const o: ClickThroughOpts = typeof arg === 'number' ? { maxClicks: arg } : arg ?? {};
      await dialog.continueUntilOption(o);
    }
  };
}
