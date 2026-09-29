// web/src/plugins/pluginsPanel.test.ts
import { describe, expect, test, vi } from 'vitest';
import { createPluginsPanel } from './pluginsPanel';
import { icon } from '../ui/icon';
import type { ShellPluginRegistry } from './registry';
import type { PluginManifest } from './types';

function fakeReg(manifests: PluginManifest[], enabledIds: Set<string>): ShellPluginRegistry {
  return {
    register: vi.fn(), init: vi.fn(), isEnabled: (id: string) => enabledIds.has(id),
    enable: vi.fn(async (id: string) => { enabledIds.add(id); }), disable: vi.fn((id: string) => { enabledIds.delete(id); }),
    setSetting: vi.fn(), manifests: () => manifests, panelFor: () => undefined, overlaysFor: () => [], onTick: vi.fn()
  } as unknown as ShellPluginRegistry;
}

const MANIFESTS: PluginManifest[] = [
  { id: 'xp', name: 'XP Tracker', icon: 'xp', tier: 'shell', description: 'Tracks XP', settings: { rate: { type: 'boolean', label: 'Show rate', default: true } } },
  { id: 'account', name: 'Account', icon: 'account', tier: 'shell', description: 'Your account', alwaysOn: true },
  { id: 'gpu', name: 'GPU Renderer', icon: 'plugins', tier: 'client', description: 'WebGL' }
];

describe('plugins panel', () => {
  test('lists every plugin with an escaped name and description', () => {
    const reg = fakeReg(MANIFESTS, new Set(['account']));
    const view = createPluginsPanel(reg, () => ({}));
    const body = document.createElement('div');
    view.mount(body);
    expect(body.textContent).toContain('XP Tracker');
    expect(body.textContent).toContain('GPU Renderer');
  });

  // The manifest icon is a glyph NAME from Task 9, not a character. Rendering it through
  // `escapeHtml` the way the row used to prints the literal word "xp" down the left of the list.
  test('a row draws the manifest glyph as an svg, never as its name in text', () => {
    const reg = fakeReg(MANIFESTS, new Set(['account']));
    const view = createPluginsPanel(reg, () => ({}));
    const body = document.createElement('div');
    view.mount(body);
    const glyph = body.querySelector('[data-row="xp"] .plugin-icon')!;
    expect(glyph.firstElementChild?.tagName).toBe('svg');
    expect(glyph.innerHTML).toBe(icon('xp').outerHTML);
    expect(body.textContent).not.toContain('xp');
  });

  test('an alwaysOn plugin shows "always on" and a disabled, checked toggle', () => {
    const reg = fakeReg(MANIFESTS, new Set(['account']));
    const view = createPluginsPanel(reg, () => ({}));
    const body = document.createElement('div');
    view.mount(body);
    const toggle = body.querySelector<HTMLInputElement>('[data-toggle="account"]')!;
    expect(toggle.disabled).toBe(true);
    expect(toggle.checked).toBe(true);
    expect(body.textContent?.toLowerCase()).toContain('always on');
  });

  test('flipping a toggle calls enable then disable', async () => {
    const enabled = new Set(['account']);
    const reg = fakeReg(MANIFESTS, enabled);
    const view = createPluginsPanel(reg, () => ({}));
    const body = document.createElement('div');
    view.mount(body);
    const toggle = body.querySelector<HTMLInputElement>('[data-toggle="xp"]')!;
    toggle.checked = true; toggle.dispatchEvent(new Event('change', { bubbles: true }));
    expect(reg.enable).toHaveBeenCalledWith('xp');
  });

  test('search filters the list by name', () => {
    const reg = fakeReg(MANIFESTS, new Set());
    const view = createPluginsPanel(reg, () => ({}));
    const body = document.createElement('div');
    view.mount(body);
    const search = body.querySelector<HTMLInputElement>('[data-plugins-search]')!;
    search.value = 'gpu'; search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(body.querySelector('[data-row="gpu"]')).not.toBeNull();
    expect(body.querySelector('[data-row="xp"]')).toBeNull();
  });

  test('search keeps focus on the input after each keystroke (re-render regression)', () => {
    const reg = fakeReg(MANIFESTS, new Set());
    const view = createPluginsPanel(reg, () => ({}));
    const body = document.createElement('div');
    document.body.appendChild(body);
    view.mount(body);
    const search = body.querySelector<HTMLInputElement>('[data-plugins-search]')!;
    search.focus();
    search.value = 'gp';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const fresh = body.querySelector<HTMLInputElement>('[data-plugins-search]')!;
    expect(document.activeElement).toBe(fresh);
    body.remove();
  });

  // The block-A checkpoint parked one font glyph in the shell, the settings gear on this row, and
  // named Task 20 as its owner. The brand guide is "no emoji, ever; Unicode glyphs only as data",
  // and a gear is decoration, not data.
  test('the settings gear is a drawn icon, and no font glyph is left on the row', () => {
    const reg = fakeReg(MANIFESTS, new Set(['account']));
    const view = createPluginsPanel(reg, () => ({}));
    const body = document.createElement('div');
    view.mount(body);
    const gear = body.querySelector<HTMLElement>('[data-gear="xp"]')!;
    expect(gear.firstElementChild?.tagName).toBe('svg');
    expect(gear.innerHTML).toBe(icon('config', 14).outerHTML);
    expect(body.textContent).not.toContain('⚙');
  });

  // map-design 3.18 gives this one panel a 6px root rhythm against `.panel-body`'s 10px, and a
  // 29px search box. Both are geometry the panel cannot get from the body it mounts into.
  test('the root is the 6px plugin panel and the search box is the large input', () => {
    const reg = fakeReg(MANIFESTS, new Set());
    const view = createPluginsPanel(reg, () => ({}));
    const body = document.createElement('div');
    view.mount(body);
    const root = body.querySelector<HTMLElement>('.plugin-panel')!;
    expect(root).not.toBeNull();
    const search = body.querySelector<HTMLInputElement>('[data-plugins-search]')!;
    expect(search.className).toBe('input input-lg');
    expect(search.parentElement).toBe(root);
    expect(body.querySelector('.plugin-list')!.parentElement).toBe(root);
  });

  // The frame reuses ONE #panel-body for every panel (frame/panels.ts open()/close()), so a
  // listener left behind by mount() fires again on the next open. Two gear handlers toggled
  // `open` twice and the settings form stopped appearing after a single close/reopen; two change
  // handlers called enable() twice per click.
  test('a close and reopen leaves no second listener on the shared body', async () => {
    const enabled = new Set(['account']);
    const reg = fakeReg(MANIFESTS, enabled);
    const view = createPluginsPanel(reg, () => ({}));
    const body = document.createElement('div');

    view.mount(body);
    view.unmount?.();
    // close() empties the shared body; open() hands the same element to the next mount.
    body.replaceChildren();
    view.mount(body);

    body.querySelector<HTMLButtonElement>('[data-gear="xp"]')!.click();
    const host = body.querySelector<HTMLElement>('[data-settings="xp"]')!;
    expect(host.hidden).toBe(false);
    expect(host.querySelector('.settings-form')).not.toBeNull();

    const toggle = body.querySelector<HTMLInputElement>('[data-toggle="gpu"]')!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    expect(reg.enable).toHaveBeenCalledTimes(1);
  });

  test('a hostile plugin name is escaped, not rendered live', () => {
    const evil: PluginManifest[] = [{ id: 'e', name: '<img src=x onerror=alert(1)>', icon: 'plugins', tier: 'shell', description: 'd' }];
    const reg = fakeReg(evil, new Set());
    const view = createPluginsPanel(reg, () => ({}));
    const body = document.createElement('div');
    view.mount(body);
    expect(body.querySelector('img')).toBeNull();
    expect(body.innerHTML).toContain('&lt;img');
  });
});
