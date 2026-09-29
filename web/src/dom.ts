// ── DOM Helpers ──────────────────────────────────────────
// Tiny utilities to replace repetitive getElementById / classList calls.

/** HTML-escape a string via browser text encoding. */
export function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/** Resolve string ID or HTMLElement. */
function _el(el: string | HTMLElement): HTMLElement | null {
  return typeof el === 'string' ? document.getElementById(el) : el;
}

/** Remove 'hidden' class. No-op if element not found. */
export function show(el: string | HTMLElement): void {
  _el(el)?.classList.remove('hidden');
}

/** Add 'hidden' class. No-op if element not found. */
export function hide(el: string | HTMLElement): void {
  _el(el)?.classList.add('hidden');
}

/** Toggle 'hidden' class. visible=true removes it, false adds it. */
export function toggleVisible(el: string | HTMLElement, visible: boolean): void {
  _el(el)?.classList.toggle('hidden', !visible);
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}
