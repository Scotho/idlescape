// Interface ids the agent runtime recognises by number. Each is a 274 cache id read
// from the client, not a value we choose; keep the source comment when adding one.

/** Character design ("Character Design" chatbox interface, rev 274) — blocks tutorial hints until dismissed. */
export const CHAR_DESIGN_INTERFACE = 3559;

/**
 * The chatbox's own "next frame" line. The client publishes it as a dialog OPTION rather than as
 * part of the frame, so a frame with nothing to decide still arrives carrying one option, and
 * anything that reads `dialog.options.length` as "this dialog offers a choice" is wrong about
 * every ordinary line an instructor speaks. Measured on the live stack in SP4b Task 14, where it
 * left the Tutorial Island run standing in front of the Gielinor Guide: `clickThrough` refused to
 * click a frame it read as a choice, and the choice the guide was actually waiting on never
 * opened.
 */
export const CONTINUE_OPTION = /^click here to continue$/i;

/** The options of a dialog, minus the continue line, which is not a decision. */
export function realChoices(options: { text?: string }[] | undefined): { text?: string }[] {
  return (options ?? []).filter(o => !CONTINUE_OPTION.test((o.text ?? '').trim()));
}
