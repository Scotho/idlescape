import { beforeEach, describe, expect, test } from 'vitest';
import { createPluginRegistry, paintPanelIcon, type PluginManifest } from './panels';

const CONNECT_MANIFEST: PluginManifest = { id: 'connect', name: 'Claude', icon: 'claude', tier: 'shell' };
const XP_MANIFEST: PluginManifest = { id: 'xp', name: 'XP Tracker', icon: 'xp', tier: 'shell' };
const ACCOUNT_MANIFEST: PluginManifest = { id: 'account', name: 'Account', icon: 'account', tier: 'shell' };

function fixture() {
  document.body.innerHTML = `
    <nav id="strip"><button class="strip-btn" data-panel="connect"></button><button class="strip-btn" data-panel="xp"></button></nav>
    <aside id="panel" class="hidden"><b id="title"></b><div id="body"></div></aside>`;
  return {
    strip: document.getElementById('strip')!, panel: document.getElementById('panel')!,
    title: document.getElementById('title')!, body: document.getElementById('body')!
  };
}

// The side-panel header's glyph. It used to be painted inline in `main.ts`'s module body, which
// vitest cannot execute, so reverting it to `textContent = m.icon` left the whole suite green.
describe('paintPanelIcon', () => {
  test('draws the open panel glyph, never its display name as text', () => {
    const host = document.createElement('div');
    paintPanelIcon(host, { icon: 'automation' });
    expect(host.querySelector('svg.icon')).not.toBeNull();
    expect(host.textContent).toBe('');
  });

  test('empties the header when no panel is open', () => {
    const host = document.createElement('div');
    paintPanelIcon(host, { icon: 'bank' });
    paintPanelIcon(host, undefined);
    expect(host.childElementCount).toBe(0);
  });
});

describe('plugin registry', () => {
  // `cs.panel` outlives a case: `open()` writes it and nothing here cleared it, so the two
  // restore cases below would otherwise leak a stored id into every case after them.
  beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });
  test('opens a registered panel, marks the icon active, mounts the view', () => {
    const els = fixture();
    const pc = createPluginRegistry(els);
    pc.register(CONNECT_MANIFEST, { title: 'Claude', mount: body => { body.textContent = 'hello'; } });
    pc.open('connect');
    expect(els.panel.classList.contains('hidden')).toBe(false);
    expect(els.title.textContent).toBe('Claude');
    expect(els.body.textContent).toBe('hello');
    expect(els.strip.querySelector('[data-panel="connect"]')!.classList.contains('active')).toBe(true);
  });
  test('toggle on the open panel closes it and unmounts', () => {
    const els = fixture();
    const pc = createPluginRegistry(els);
    let unmounted = false;
    pc.register(CONNECT_MANIFEST, { title: 'Claude', mount: () => {}, unmount: () => { unmounted = true; } });
    pc.toggle('connect'); pc.toggle('connect');
    expect(pc.current()).toBeNull();
    expect(els.panel.classList.contains('hidden')).toBe(true);
    expect(unmounted).toBe(true);
  });
  test('clicking a strip button opens that panel', () => {
    const els = fixture();
    const pc = createPluginRegistry(els);
    pc.register(XP_MANIFEST, { title: 'XP', mount: () => {} });
    (els.strip.querySelector('[data-panel="xp"]') as HTMLButtonElement).click();
    expect(pc.current()).toBe('xp');
  });
  test('remembers the last open panel in localStorage', () => {
    const els = fixture();
    const pc = createPluginRegistry(els);
    pc.register(XP_MANIFEST, { title: 'XP', mount: () => {} });
    pc.open('xp');
    expect(localStorage.getItem('cs.panel')).toBe('xp');
  });
  test('manifests() returns registrations in order with id/name/icon/tier', () => {
    const els = fixture();
    const pc = createPluginRegistry(els);
    pc.register(CONNECT_MANIFEST, { title: 'Claude', mount: () => {} });
    pc.register(XP_MANIFEST, { title: 'XP', mount: () => {} });
    expect(pc.manifests()).toEqual([CONNECT_MANIFEST, XP_MANIFEST]);
  });
  // Ruling C3: the `characters` panel id is deleted and its players land on Account. The fallback
  // is permanent, not a migration step: `cs.panel` is only ever rewritten by a successful open,
  // so a browser last used before the merge can arrive at any time.
  test('a stored characters panel id opens Account, permanently', () => {
    const els = fixture();
    const pc = createPluginRegistry(els);
    pc.register(ACCOUNT_MANIFEST, { title: 'Account', mount: body => { body.textContent = 'account'; } });
    localStorage.setItem('cs.panel', 'characters');
    pc.restore();
    expect(els.title.textContent).toBe('Account');
    expect(els.panel.classList.contains('hidden')).toBe(false);
    // And the stored value self-heals to the id that now exists, because open() rewrites it.
    expect(localStorage.getItem('cs.panel')).toBe('account');
  });

  test('an unknown stored panel id opens nothing and leaves the key alone', () => {
    const els = fixture();
    const pc = createPluginRegistry(els);
    pc.register(XP_MANIFEST, { title: 'XP Tracker', mount: () => {} });
    localStorage.setItem('cs.panel', 'not-a-panel');
    pc.restore();
    expect(els.panel.classList.contains('hidden')).toBe(true);
    expect(localStorage.getItem('cs.panel')).toBe('not-a-panel');
  });

  test('registering by manifest then opening by manifest.id mounts the view and marks the icon active', () => {
    const els = fixture();
    const pc = createPluginRegistry(els);
    pc.register(XP_MANIFEST, { title: 'XP Tracker', mount: body => { body.textContent = 'xp-content'; } });
    pc.open(XP_MANIFEST.id);
    expect(els.body.textContent).toBe('xp-content');
    expect(els.strip.querySelector(`[data-panel="${XP_MANIFEST.id}"]`)!.classList.contains('active')).toBe(true);
  });
});
