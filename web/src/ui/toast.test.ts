import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createToastHost } from './toast';

describe('toast host', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.useFakeTimers(); });

  test('shows a toned toast and removes it after the duration', () => {
    const host = createToastHost(document.body);
    host.show('Revoked', 'ok', 1000);
    const toast = host.el.querySelector('.toast')!;
    expect(toast.className).toBe('toast toast-ok');
    expect(toast.textContent).toBe('Revoked');
    vi.advanceTimersByTime(1000);
    expect(toast.classList.contains('is-leaving')).toBe(true);
    vi.advanceTimersByTime(200);
    expect(host.el.querySelector('.toast')).toBeNull();
  });

  test('caps visible toasts and lets callers dismiss early', () => {
    const host = createToastHost(document.body);
    host.show('1'); host.show('2'); host.show('3');
    const dismiss = host.show('4');
    expect(Array.from(host.el.children).map(c => c.textContent)).toEqual(['2', '3', '4']);
    dismiss();
    vi.advanceTimersByTime(200);
    expect(host.el.children.length).toBe(2);
    host.clear();
    expect(host.el.children.length).toBe(0);
  });
});
