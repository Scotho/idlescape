import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { confirmDialog } from './dialog';

// jsdom does not implement showModal/close; polyfill them so the dialog path runs.
const proto = HTMLDialogElement.prototype as unknown as { showModal?: () => void; close?: () => void };
const original = { showModal: proto.showModal, close: proto.close };

describe('confirmDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    proto.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
    proto.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
  });
  afterEach(() => {
    proto.showModal = original.showModal;
    proto.close = original.close;
  });

  test('resolves true on confirm and removes itself', async () => {
    const p = confirmDialog({ title: 'Revoke "laptop"?', body: 'Claude loses access.', confirmLabel: 'Revoke', danger: true });
    const dlg = document.querySelector<HTMLDialogElement>('dialog.dlg')!;
    expect(dlg.hasAttribute('open')).toBe(true);
    expect(dlg.querySelector('.dlg-title')?.textContent).toBe('Revoke "laptop"?');
    const confirm = dlg.querySelector<HTMLButtonElement>('.btn-danger')!;
    expect(confirm.textContent).toBe('Revoke');
    confirm.click();
    await expect(p).resolves.toBe(true);
    expect(document.querySelector('dialog')).toBeNull();
  });

  test('resolves false on cancel, escape, or backdrop click', async () => {
    const p1 = confirmDialog({ title: 'a' });
    document.querySelector<HTMLButtonElement>('dialog .btn:not(.btn-primary)')!.click();
    await expect(p1).resolves.toBe(false);

    const p2 = confirmDialog({ title: 'b' });
    document.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    await expect(p2).resolves.toBe(false);

    const p3 = confirmDialog({ title: 'c' });
    document.querySelector('dialog')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await expect(p3).resolves.toBe(false);
    expect(document.querySelectorAll('dialog').length).toBe(0);
  });

  test('falls back to window.confirm without dialog support', async () => {
    proto.showModal = undefined;
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await expect(confirmDialog({ title: 'Sure?', body: 'Really.' })).resolves.toBe(true);
    expect(spy).toHaveBeenCalledWith('Sure?\n\nReally.');
    spy.mockRestore();
  });
});
