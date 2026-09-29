// web/src/panels/config.test.ts -- the Configuration panel had no test file at all before Task 20.
//
// Two things are pinned here. The panel's four controls still reach their deps, which is the whole
// of what it does; and it now ships TWO named sections, Display open and Sound closed, where it
// shipped one called "Game view". The second is reserved for sprint 3, and reserving a section
// with no test is reserving nothing: without this file a later rename or a stray `open` on the
// Sound section is a silent change to a panel nobody has a failing test for.
import { describe, expect, test, vi } from 'vitest';
import { createConfigPanel, manifest, type ConfigDeps } from './config';

function fakeDeps(over: Partial<ConfigDeps> = {}): ConfigDeps {
  return {
    setSize: vi.fn(), setFilter: vi.fn(), getSize: () => 'auto', getFilter: () => 'auto',
    toggleOverlays: vi.fn(() => true), fullscreen: vi.fn(), ...over
  };
}

function mounted(deps: ConfigDeps = fakeDeps()): HTMLElement {
  const body = document.createElement('div');
  createConfigPanel(deps).mount(body);
  return body;
}

describe('createConfigPanel', () => {
  test('manifest keeps id config and the config glyph', () => {
    expect(manifest).toEqual({ id: 'config', name: 'Configuration', icon: 'config', tier: 'shell' });
  });

  test('ships a Display section open and a Sound section collapsed, each by its own hook', () => {
    const body = mounted();

    const display = body.querySelector<HTMLElement>('[data-config-display]');
    expect(display).not.toBeNull();
    const displaySection = display!.closest('details')!;
    expect(displaySection.open).toBe(true);
    expect(displaySection.querySelector('summary')!.textContent).toBe('Display');

    const sound = body.querySelector<HTMLDetailsElement>('details[data-config-sound]');
    expect(sound).not.toBeNull();
    // Collapsed on purpose: it costs one closed row and reads as deliberate rather than broken.
    expect(sound!.open).toBe(false);
    expect(sound!.querySelector('summary')!.textContent).toBe('Sound');
    expect(sound!.querySelector('.empty')!.textContent).toBe('Nothing to set yet.');

    // The four controls live under Display, not loose in the body and not under Sound.
    for (const id of ['cfg-size', 'cfg-filter', 'cfg-overlays', 'cfg-fullscreen']) {
      expect(display!.querySelector(`#${id}`), id).not.toBeNull();
    }
    // And Sound reserves the name only: no control, no setting, no `cs.` key.
    expect(sound!.querySelectorAll('input, select, button').length).toBe(0);
  });

  test('the four controls still call their deps', () => {
    const deps = fakeDeps();
    const body = mounted(deps);

    const size = body.querySelector<HTMLSelectElement>('#cfg-size')!;
    size.value = '2';
    size.dispatchEvent(new Event('change'));
    expect(deps.setSize).toHaveBeenCalledWith('2');

    const filter = body.querySelector<HTMLSelectElement>('#cfg-filter')!;
    filter.value = 'pixelated';
    filter.dispatchEvent(new Event('change'));
    expect(deps.setFilter).toHaveBeenCalledWith('pixelated');

    body.querySelector<HTMLInputElement>('#cfg-overlays')!.dispatchEvent(new Event('change'));
    expect(deps.toggleOverlays).toHaveBeenCalledTimes(1);

    body.querySelector<HTMLButtonElement>('#cfg-fullscreen')!.click();
    expect(deps.fullscreen).toHaveBeenCalledTimes(1);
  });

  test('each select opens on the value its dep reports, not on the first option', () => {
    const body = mounted(fakeDeps({ getSize: () => '2', getFilter: () => 'pixelated' }));
    expect(body.querySelector<HTMLSelectElement>('#cfg-size')!.value).toBe('2');
    expect(body.querySelector<HTMLSelectElement>('#cfg-filter')!.value).toBe('pixelated');
  });
});
