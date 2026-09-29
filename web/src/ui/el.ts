// web/src/ui/el.ts -- tiny element builder so panels can build DOM without innerHTML strings.

export type Child = Node | string | null | undefined | false;
export type Attrs = Record<string, string | number | boolean | null | undefined | ((ev: Event) => void)>;

/**
 * `h('button', { class: 'btn', onclick: fn }, 'Save')`. Strings become text nodes (never markup),
 * `false`/`null` children are skipped, boolean attributes are set when true and dropped when false,
 * and `on*` keys become listeners.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === 'function') { el.addEventListener(key.slice(2), value); continue; }
    if (value === true) { el.setAttribute(key, ''); continue; }
    el.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

/**
 * A key/value row: muted label on the left, strong value on the right. `components/data/KV.jsx`.
 * `roomy` is the Bank panel's 4px rhythm against everyone else's 2px, and `tone` is the value
 * colour the mock gives its two live rows. Pass a token, `'var(--ok-bright)'`, never a raw hex.
 */
export function kv(
  label: string,
  value: Child,
  opts: { id?: string; num?: boolean; roomy?: boolean; tone?: string } = {}
): HTMLElement {
  const val = h('span', { class: opts.num ? 'kv-value num' : 'kv-value', id: opts.id }, value);
  if (opts.tone) val.style.color = opts.tone;
  return h('div', { class: opts.roomy ? 'kv kv-roomy' : 'kv' }, h('span', { class: 'kv-label' }, label), val);
}

/** A tinted inline label. */
export function badge(text: string, tone: 'ok' | 'warn' | 'error' | 'info' | 'accent' | 'neutral' = 'neutral'): HTMLElement {
  return h('span', { class: tone === 'neutral' ? 'badge' : `badge badge-${tone}` }, text);
}

/**
 * A toned message block. Every tone names itself in the class list, accent included: a bare
 * `.alert` is the info default in the v2 family, so the old "accent emits no modifier" shortcut
 * would have rendered every untoned alert blue.
 */
export function alert(body: Child, opts: { tone?: 'ok' | 'warn' | 'error' | 'info' | 'accent'; title?: string } = {}): HTMLElement {
  const tone = opts.tone ?? 'accent';
  return h('div', { class: `alert alert-${tone}`, role: tone === 'error' ? 'alert' : 'status' },
    opts.title ? h('div', { class: 'alert-title' }, opts.title) : null,
    typeof body === 'string' ? h('div', {}, body) : body
  );
}

/** An empty-state line for a list that has nothing in it yet. */
export function empty(text: string, title?: string): HTMLElement {
  return h('div', { class: 'empty' }, title ? h('div', { class: 'empty-title' }, title) : null, text);
}
