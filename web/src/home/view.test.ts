import { describe, expect, test, vi } from 'vitest';
import { createHomeView } from './view';

function mount(): HTMLElement {
  document.body.innerHTML = `
    <section id="screen-home">
      <div id="home-choices"><button id="btn-guest"></button><button id="btn-show-login"></button><button id="btn-show-signup"></button><button id="btn-connect"></button></div>
      <div id="home-login" class="hidden"><form id="signin-form"></form></div>
      <div id="home-signup" class="hidden"><form id="signup-form"></form></div>
      <div id="entry-connect-view" class="hidden"></div>
      <button id="btn-home-back" class="hidden"></button>
      <span id="home-players"></span><ul id="home-patch-notes"></ul>
      <p id="home-error" class="hidden"></p><p id="home-busy" class="hidden"></p>
    </section>`;
  return document.getElementById('screen-home')!;
}

describe('home view', () => {
  test('choices call their handlers', () => {
    const deps = { onGuest: vi.fn(), onShowLogin: vi.fn(), onShowSignup: vi.fn(), onShowConnect: vi.fn(), onBack: vi.fn() };
    createHomeView(mount(), deps);
    document.getElementById('btn-guest')!.click();
    document.getElementById('btn-show-signup')!.click();
    expect(deps.onGuest).toHaveBeenCalledOnce();
    expect(deps.onShowSignup).toHaveBeenCalledOnce();
  });
  test('setView shows one sub-view and the back link', () => {
    const v = createHomeView(mount(), { onGuest() {}, onShowLogin() {}, onShowSignup() {}, onShowConnect() {}, onBack() {} });
    v.setView('login');
    expect(document.getElementById('home-login')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('home-choices')!.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('btn-home-back')!.classList.contains('hidden')).toBe(false);
    v.setView('choices');
    expect(document.getElementById('home-choices')!.classList.contains('hidden')).toBe(false);
  });
  test('players and patch notes render escaped', () => {
    const v = createHomeView(mount(), { onGuest() {}, onShowLogin() {}, onShowSignup() {}, onShowConnect() {}, onBack() {} });
    v.setPlayers({ engine: 'up', players: 12 });
    expect(document.getElementById('home-players')!.textContent).toBe('12 players online');
    v.setPlayers({ engine: 'up', players: 1 });
    expect(document.getElementById('home-players')!.textContent).toBe('1 player online');
    // An unknown count is not the same thing as a dead world: the engine is up either way.
    v.setPlayers({ engine: 'up', players: null });
    expect(document.getElementById('home-players')!.textContent).toBe('world online');
    v.setPlayers({ engine: 'down', players: null });
    expect(document.getElementById('home-players')!.textContent).toBe('world offline');
    v.setPlayers({ engine: 'down', players: 7 });
    expect(document.getElementById('home-players')!.textContent).toBe('world offline');
    v.renderPatchNotes([{ date: '2026-09-05', title: '<b>x</b>', items: ['a'] }]);
    expect(document.getElementById('home-patch-notes')!.innerHTML).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
