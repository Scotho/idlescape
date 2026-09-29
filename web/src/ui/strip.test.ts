import { beforeEach, describe, expect, test } from 'vitest';
import { icon, type IconName } from './icon';
import { applyTabListA11y, buildStrip } from './strip';

// The fixture buttons carry a real `<svg>` child rather than a text glyph, which is what the
// shipped strip holds from Task 9 on. It matters here and not only for looks: with an element
// inside, `aria-label` carries the whole accessible name, which is what the first case asserts.
const stripButton = (panel: string, title: string, glyph: IconName): string =>
  `<button class="strip-btn" data-panel="${panel}" title="${title}">${icon(glyph).outerHTML}</button>`;

function strip(): HTMLElement {
  document.body.innerHTML = `<nav id="strip">
    ${stripButton('connect', 'Claude', 'claude')}
    <button class="strip-btn active" data-panel="xp" title="XP tracker">${icon('xp').outerHTML}</button>
    ${stripButton('config', 'Configuration', 'config')}
  </nav>`;
  return document.getElementById('strip')!;
}

const entry = (id: string): { id: string; name: string; icon: IconName } => ({ id, name: id, icon: 'plugins' });

describe('applyTabListA11y', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  test('assigns roles, mirrors the active tab and turns titles into tooltips', () => {
    const el = strip();
    applyTabListA11y(el);
    expect(el.getAttribute('role')).toBe('tablist');
    const tabs = Array.from(el.querySelectorAll<HTMLElement>('[data-panel]'));
    expect(tabs.map(t => t.getAttribute('role'))).toEqual(['tab', 'tab', 'tab']);
    expect(tabs.map(t => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(tabs.map(t => t.tabIndex)).toEqual([-1, 0, -1]);
    expect(tabs[0].dataset.tip).toBe('Claude');
    expect(tabs[0].getAttribute('aria-label')).toBe('Claude');
    expect(tabs[0].hasAttribute('title')).toBe(false);
  });

  test('keeps one tab reachable when nothing is active', () => {
    const el = strip();
    el.querySelector('.active')!.classList.remove('active');
    applyTabListA11y(el);
    expect(Array.from(el.querySelectorAll<HTMLElement>('[data-panel]')).map(t => t.tabIndex)).toEqual([0, -1, -1]);
  });

  test('arrow keys move focus around the list, Home and End jump', () => {
    const el = strip();
    applyTabListA11y(el);
    const tabs = Array.from(el.querySelectorAll<HTMLElement>('[data-panel]'));
    tabs[1].focus();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(tabs[2]);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(tabs[0]);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(tabs[2]);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(tabs[0]);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(tabs[2]);
  });

  // A separator is a `<span class="strip-sep">` with no `[data-panel]`, so `tabs()` skips it and
  // the roving tabindex counts buttons only. Drop the attribute filter from `tabs()` and the
  // Home/End cases above still pass while this one fails on a separator taking focus.
  test('a separator between the groups is not a tab', () => {
    document.body.innerHTML = `<nav id="strip">
      ${stripButton('connect', 'Claude', 'claude')}
      <span class="strip-sep" aria-hidden="true"></span>
      ${stripButton('xp', 'XP tracker', 'xp')}
    </nav>`;
    const el = document.getElementById('strip')!;
    const a11y = applyTabListA11y(el);
    a11y.syncSelected();
    const tabs = Array.from(el.querySelectorAll<HTMLElement>('[data-panel]'));
    expect(tabs).toHaveLength(2);
    expect(el.querySelector('.strip-sep')!.hasAttribute('role')).toBe(false);
    tabs[0].focus();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(tabs[1]);
  });

  test('syncSelected follows a later active change', () => {
    const el = strip();
    const a11y = applyTabListA11y(el);
    const tabs = Array.from(el.querySelectorAll<HTMLElement>('[data-panel]'));
    tabs[1].classList.remove('active');
    tabs[0].classList.add('active');
    a11y.syncSelected();
    expect(tabs.map(t => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
  });
});

describe('buildStrip', () => {
  const classesOf = (nodes: HTMLElement[]): string[] => nodes.map(n => n.className);

  test('draws one button per entry, with the glyph as an svg child and the name as the tooltip', () => {
    const [btn] = buildStrip([entry('xp')]);
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.dataset.panel).toBe('xp');
    expect(btn.title).toBe('xp');
    expect(btn.firstElementChild?.tagName).toBe('svg');
    expect(btn.textContent).toBe('');
  });

  test('separates the three groups after Claude and after Screenshot', () => {
    const nodes = buildStrip(['tasks', 'connect', 'xp', 'screenshot', 'bank'].map(entry));
    expect(nodes.map(n => n.dataset.panel ?? n.className))
      .toEqual(['tasks', 'connect', 'strip-sep', 'xp', 'screenshot', 'strip-sep', 'bank']);
  });

  // The trailing-separator guard. `screenshot` last with `some(n => n.id !== m.id)` in place of the
  // index test hangs a hairline off the end of the strip, under the last button and over nothing.
  test('draws no separator after the last button', () => {
    const nodes = buildStrip(['xp', 'screenshot'].map(entry));
    expect(nodes).toHaveLength(2);
    expect(nodes[nodes.length - 1].tagName).toBe('BUTTON');
  });

  // The spacer belongs to the first button of the bottom group. On `.strip-gear`'s old rule it
  // rode on Configuration, which left Plugins pushed up against Bank and Account.
  test('the spacer lands on Plugins, not on Configuration', () => {
    const nodes = buildStrip(['bank', 'account', 'plugins', 'config'].map(entry));
    expect(classesOf(nodes)).toEqual(['strip-btn', 'strip-btn', 'strip-btn strip-tail', 'strip-btn']);
  });

  test('the spacer falls to Configuration when Plugins is disabled', () => {
    const nodes = buildStrip(['bank', 'config'].map(entry));
    expect(classesOf(nodes)).toEqual(['strip-btn', 'strip-btn strip-tail']);
  });

  test('an unknown glyph name still draws a button', () => {
    const [btn] = buildStrip([{ id: 'third-party', name: 'Third party', icon: 'no-such' as IconName }]);
    expect(btn.firstElementChild?.innerHTML).toBe(icon('plugins').innerHTML);
  });
});
