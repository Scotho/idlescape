// web/src/ui/toast.ts -- transient notices over the game view.
import { h } from './el';

export type ToastTone = 'neutral' | 'ok' | 'error' | 'info';

export interface ToastHost {
  el: HTMLElement;
  /** Shows a toast and returns a function that dismisses it early. */
  show(message: string, tone?: ToastTone, durationMs?: number): () => void;
  clear(): void;
}

/**
 * The timer `createToastHost` schedules on. Named with explicit parameters rather than declared as
 * `typeof setTimeout`, which stops being one signature the moment `@types/node` joins the program
 * (a single `import ... from 'vitest'` anywhere achieves that) and takes the callback's contextual
 * typing down with it, leaving `fn` and `ms` implicitly `any`. The handle is never read here, so
 * the return type is `unknown` and both the DOM and the Node `setTimeout` satisfy it. Audit C16.
 */
export type ToastTimer = (fn: () => void, ms: number) => unknown;

const DEFAULT_MS = 3500;
const LEAVE_MS = 160;
const MAX_VISIBLE = 3;

export function createToastHost(root: HTMLElement, opts: { setTimeout?: ToastTimer } = {}): ToastHost {
  const schedule: ToastTimer = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const el = h('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
  root.appendChild(el);

  function remove(toast: HTMLElement): void {
    if (!toast.isConnected) return;
    toast.classList.add('is-leaving');
    schedule(() => toast.remove(), LEAVE_MS);
  }

  return {
    el,
    show(message, tone = 'neutral', durationMs = DEFAULT_MS) {
      const toast = h('div', { class: tone === 'neutral' ? 'toast' : `toast toast-${tone}` }, message);
      el.appendChild(toast);
      while (el.children.length > MAX_VISIBLE) el.firstElementChild?.remove();
      schedule(() => remove(toast), durationMs);
      return () => remove(toast);
    },
    clear() { el.replaceChildren(); }
  };
}
