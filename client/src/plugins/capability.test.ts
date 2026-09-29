import { describe, expect, test } from 'bun:test';
import { createCapability } from './capability';
import type { ClientState } from '../hooks/types';

const S: ClientState = { loggedIn: true, gameName: 'b', skills: { xp: [], level: [] }, inventory: [], fps: 50, rttMs: null, hp: { current: 1, max: 1 }, prayer: { current: 1, max: 1 }, energy: 0, boosts: [], position: { x: 0, z: 0, level: 0 }, activeTab: 3, sceneReady: true };

describe('ClientCapability', () => {
  test('state() delegates to the injected getter', () => {
    const cap = createCapability({ state: () => S });
    expect(cap.state()).toBe(S);
  });
  test('renderer defaults to software and rejects non-software until a backend loads', async () => {
    const cap = createCapability({ state: () => S });
    expect(cap.renderer.current()).toBe('software');
    await expect(cap.renderer.set('webgl')).rejects.toThrow();
    await expect(cap.renderer.set('software')).resolves.toBeUndefined();
  });
  test('scene.project is a null stub; menu.onBuild returns an unsubscribe', () => {
    const cap = createCapability({ state: () => S });
    expect(cap.scene.project(1, 2, 0, 0)).toBeNull();
    const unsub = cap.menu.onBuild(() => {});
    expect(typeof unsub).toBe('function');
  });
  test('frame callbacks fire via the internal _fire hooks and unsubscribe works', () => {
    const cap = createCapability({ state: () => S });
    let before = 0, after = 0;
    const un = cap.frame.onBeforeDraw(() => { before++; });
    cap.frame.onAfterDraw(() => { after++; });
    cap._fireBeforeDraw(); cap._fireAfterDraw();
    expect(before).toBe(1); expect(after).toBe(1);
    un(); cap._fireBeforeDraw();
    expect(before).toBe(1);
  });
});
