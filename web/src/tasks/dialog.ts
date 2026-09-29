// P14. A named namespace over `sdk.sendClickDialog` and `c.wait`, so the index-versus-array-
// position footgun is never a script's problem again.
//
// THE FOOTGUN, once, here: `sendClickDialog` takes `DialogOption.index`, the SERVER's number,
// which starts at 1 because 0 is the implicit continue click that `Client.clickDialogOption`
// refuses while a choice is pending. The array position is not that number. Tutorial Island's
// last dialogue puts "Yes." at position 0, so passing the position is exactly the case that
// cannot leave the island. Every member here resolves an option to its own `index` and never to
// a position, and `finish.ts` and `recovery.ts` each carried a paragraph saying so until this
// file existed.
//
// It lives here rather than in `workerContext.ts` for the reason `runContext.ts:1-7` gives about
// seams: this is a mechanism built over `sdk` and `wait`, and that file is the wiring.
import { realChoices } from '../agent/constants';
import type { DialogCompleteOpts, DialogContinueOpts, ScriptContext } from './scriptContext';
import type { ActionResult } from '../agent/types';

/** How long `continueUntilOption` waits for the chatbox to move on before it clicks again. */
const FRAME_MS = 4_000;
/** How many option-less frames `continueUntilOption` clicks past before it gives up. */
const MAX_CLICKS = 10;
/** How long `choose` waits for the choice it answered to leave the screen. */
const ANSWERED_MS = 10_000;

/** One published dialogue option: the server's own number for it, and its visible text. */
export interface DialogOptionLike {
  /** The SERVER-assigned number. Not the array position, and not the position plus one. */
  index?: number;
  text?: string;
}

/** The chatbox frame, as much of it as this namespace reads. */
export interface DialogFrame {
  isOpen: boolean;
  options?: DialogOptionLike[];
  text?: string;
}

/**
 * The snapshot fields this namespace reads, and only those. Declaring the whole `WorldState`
 * here would make every fake either a whole world or a cast, and the Global Constraints ban
 * `as any` and its spellings.
 */
export interface DialogWorld {
  dialog?: DialogFrame;
  /** Completed chatbox lines, newest last. The only place a line is actually published. */
  recentDialogs?: { text: string[] }[];
  interfaceTexts?: Record<number, string>;
}

/** What a wait needs to be told, of `WaitUntilOpts`, for the two waits this file starts. */
export interface DialogWaitOpts {
  timeoutMs?: number;
  label?: string;
  signal?: AbortSignal;
}

export interface DialogDeps {
  state(): DialogWorld;
  /** `sdk.sendClickDialog`: the SERVER-assigned option number, 0 being the continue click. */
  click(index: number): Promise<ActionResult>;
  wait: {
    until(pred: (s: DialogWorld) => boolean, opts?: DialogWaitOpts): Promise<boolean>;
    dialog(pattern?: RegExp, timeoutMs?: number): Promise<boolean>;
  };
  /**
   * The signal that is live *now*. The runner swaps the current task's signal in before each
   * `run`, so it is read per click rather than captured once.
   */
  signal(): AbortSignal;
}

export function createDialog(d: DialogDeps): ScriptContext['dialog'] {
  const raw = (): DialogFrame | undefined => d.state().dialog;
  const isOpen = (): boolean => raw()?.isOpen === true;
  const matches = (sel: string | RegExp, text: string): boolean =>
    typeof sel === 'string' ? text.trim().toLowerCase() === sel.trim().toLowerCase() : sel.test(text);
  const stopped = (own?: AbortSignal): boolean => d.signal().aborted || own?.aborted === true;

  /** The three failures this namespace reports, in the words a caller branches on. */
  const refuse = (reason: string, message: string): ActionResult => ({ success: false, message, reason });

  function options(): string[] {
    // `realChoices`, not the raw list: the live client publishes "Click here to continue" as an
    // option of its own, so a script reading this as "what I may choose between" would be
    // offered a click as a decision. `choose` below searches the raw list instead, because that
    // is what the vendored `clickDialogByText` it stands in for searches.
    return realChoices(raw()?.options).map(o => o.text ?? '');
  }

  async function choose(sel: string | RegExp): Promise<ActionResult> {
    const dlg = raw();
    if (!dlg?.isOpen) return refuse('wrong_interface', 'no dialogue is open');
    const found = (dlg.options ?? []).find(o => matches(sel, o.text ?? ''));
    if (!found) return refuse('no_option', `no option matching ${String(sel)}`);
    // The server index, with the position+1 fallback the two migrated call sites already used
    // for a publisher that omits it. The bare position is what neither of them ever sent.
    const r = await d.click(found.index ?? (dlg.options ?? []).indexOf(found) + 1);
    if (!r.success) return r;
    await d.wait.until(s => realChoices(s.dialog?.options).length === 0, { timeoutMs: ANSWERED_MS, label: 'dialog choose' });
    return { success: true, message: `chose "${found.text ?? found.index}"` };
  }

  async function continueUntilOption(o: DialogContinueOpts = {}): Promise<ActionResult> {
    const max = o.maxClicks ?? MAX_CLICKS;
    const frameMs = o.timeoutMs ?? FRAME_MS;
    for (let i = 0; i < max; i++) {
      const dlg = raw();
      if (!dlg?.isOpen) return { success: true, message: 'the dialogue ended' };
      // `realChoices` and not `options.length`: the client publishes "Click here to continue" as
      // an option, so a frame with nothing to decide carries one.
      if (realChoices(dlg.options).length > 0) return { success: true, message: 'a choice is showing' };
      // Without this the loop spends every remaining click inside one millisecond once the run
      // is stopped, because the frame wait below resolves false the instant a signal aborts.
      // That burst is the exact failure the frame wait exists to prevent, reached backwards.
      if (stopped(o.signal)) return refuse('stopped', 'the run was stopped before a choice appeared');
      const before = chatFrame(d.state());
      const r = await d.click(0);
      if (!r.success) return r;
      /*
       * The wait between clicks is on the chatbox actually changing, not on a tick, and that is
       * the whole point. Measured on the live stack in SP4b Task 14: a bare `ticks(1)` sent the
       * second click before the server's next frame had reached the client, and on Tutorial
       * Island the frame that was arriving was the RuneScape Guide's "Do you want to skip the
       * tutorial?" choice. The continue click resolved it as its first answer, "Yes please.",
       * and the run was teleported to Lumbridge with none of the island played. The options
       * guard above cannot catch that on its own: the snapshot it reads is a frame behind.
       *
       * `realChoices` here too, and for the same reason as the guard above: raw `options.length`
       * is greater than zero on EVERY live frame, so a predicate reading it is true the first
       * time it is evaluated and the wait it belongs to never waits at all. The committed trace
       * of the first live run shows what that looks like: five clicks inside one millisecond.
       */
      await d.wait.until(
        s => chatFrame(s) !== before || s.dialog?.isOpen !== true || realChoices(s.dialog.options).length > 0,
        { timeoutMs: frameMs, label: 'dialog continueUntilOption', signal: o.signal }
      );
    }
    return refuse('timeout', `no choice appeared after ${max} clicks`);
  }

  async function complete(choices: (string | RegExp)[], o: DialogCompleteOpts = {}): Promise<ActionResult> {
    // The patterns are consumed IN ORDER and a spent one is never rescanned, which is the
    // difference between a tree walker and an infinite loop: a rescanning implementation takes
    // the same branch again on a frame that has not changed and hangs.
    for (let i = 0; i < choices.length; i++) {
      const cont = await continueUntilOption({ timeoutMs: o.timeoutMs, signal: o.signal });
      if (!cont.success) return cont;
      // The tree ran out before the patterns did. Every question the npc asked was answered, so
      // this is a success; letting the spent `choose` report `wrong_interface` would be a lie.
      if (!isOpen()) return { success: true, message: 'the dialogue ended' };
      const r = await choose(choices[i]);
      if (!r.success) return r;
      // Only when the frame has already gone: an open frame is the next question, because
      // `choose` above does not return until the one it answered has left the screen. A closed
      // one is either the end of the tree or the next frame still a tick away, and reading it as
      // the end without asking would report success on a tree that is still going.
      if (i < choices.length - 1 && !isOpen()) await d.wait.dialog(undefined, o.timeoutMs ?? FRAME_MS);
    }
    return { success: true, message: `answered ${choices.length} of the npc's questions` };
  }

  return {
    isOpen,
    text: () => dialogText(d.state()),
    options,
    choose,
    continueUntilOption,
    complete
  };
}

/**
 * The line the chatbox is showing, as one string, and the only reader of it: `c.dialog.text()`
 * and `c.wait.dialog(pattern)` both come through here, so a pattern that a wait matches is a
 * pattern the reader beside it can see.
 *
 * The fallback is not a fallback in practice, it is the live arm. `dialog.text` is declared
 * optional by the vendored `DialogState` and this client's collector never fills it
 * (`collectDialogState` publishes `isOpen`, `options` and `isWaiting` and nothing else), so a
 * reader of that field alone returns the empty string on every real frame. `recentDialogs` is
 * where a completed line actually arrives, as the array of its lines.
 */
export function dialogText(s: DialogWorld): string {
  return s.dialog?.text ?? (s.recentDialogs ?? []).at(-1)?.text.join(' ') ?? '';
}

/**
 * What the chatbox is showing, as one string, so a click can wait for the frame to change.
 * `dialog.text` is not published by the collector on this client, and `recentDialogs` only grows
 * when a line completes, so the component texts are the only per-frame signal there is: the
 * RuneScape Guide's question, its "Click here to continue" and the choice box's "Select an
 * Option" all arrive as `interfaceTexts` rows.
 */
function chatFrame(s: DialogWorld): string {
  return Object.values(s.interfaceTexts ?? {}).join('|');
}
