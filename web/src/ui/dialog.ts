// web/src/ui/dialog.ts -- confirm dialog on the native <dialog> element.
import { h } from './el';

export interface ConfirmOpts {
  title: string;
  /** Body copy; a string becomes one paragraph. */
  body?: string | Node;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm button in the danger tone for destructive actions. */
  danger?: boolean;
}

/**
 * Asks a yes/no question in a modal dialog and resolves with the answer. Escape and the
 * backdrop count as cancel. Where `showModal` is missing (old browsers, jsdom) it falls back to
 * `window.confirm` so callers never need a second code path.
 */
export function confirmDialog(opts: ConfirmOpts, root: HTMLElement = document.body): Promise<boolean> {
  const supportsDialog = typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal === 'function';
  if (!supportsDialog) {
    const text = typeof opts.body === 'string' ? `${opts.title}\n\n${opts.body}` : opts.title;
    return Promise.resolve(window.confirm(text));
  }

  return new Promise<boolean>(resolve => {
    let settled = false;
    const finish = (answer: boolean): void => {
      if (settled) return;
      settled = true;
      dlg.close();
      dlg.remove();
      resolve(answer);
    };
    const cancel = h('button', { class: 'btn', type: 'button', onclick: () => finish(false) }, opts.cancelLabel ?? 'Cancel');
    const confirm = h('button', { class: opts.danger ? 'btn btn-danger' : 'btn btn-primary', type: 'button', onclick: () => finish(true) }, opts.confirmLabel ?? 'Confirm');
    const dlg = h('dialog', { class: 'dlg', 'aria-labelledby': 'dlg-title' },
      h('h2', { class: 'dlg-title', id: 'dlg-title' }, opts.title),
      h('div', { class: 'dlg-body' }, typeof opts.body === 'string' ? h('p', {}, opts.body) : opts.body),
      h('div', { class: 'dlg-actions' }, cancel, confirm)
    );
    // Escape fires `cancel` then `close`; a backdrop click lands on the dialog element itself.
    dlg.addEventListener('cancel', ev => { ev.preventDefault(); finish(false); });
    dlg.addEventListener('click', ev => { if (ev.target === dlg) finish(false); });
    root.appendChild(dlg);
    dlg.showModal();
    (opts.danger ? cancel : confirm).focus();
  });
}
