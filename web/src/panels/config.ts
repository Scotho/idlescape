import type { SizeMode } from '../frame/canvasSize';
import type { PanelView, PluginManifest } from '../frame/panels';

export const manifest = { id: 'config', name: 'Configuration', icon: 'config', tier: 'shell' } as const satisfies PluginManifest;

export interface ConfigDeps {
  setSize: (mode: SizeMode) => void;
  setFilter: (filter: 'auto' | 'pixelated') => void;
  getSize: () => SizeMode;
  getFilter: () => 'auto' | 'pixelated';
  toggleOverlays: () => boolean;
  fullscreen: () => void;
}

const SIZE_OPTIONS: { value: SizeMode; label: string }[] = [
  { value: '1', label: '1x' }, { value: '2', label: '2x' }, { value: '3', label: '3x' }, { value: 'auto', label: 'Fit window' }
];
const FILTER_OPTIONS: { value: 'auto' | 'pixelated'; label: string }[] = [
  { value: 'auto', label: 'Smooth' }, { value: 'pixelated', label: 'Pixelated' }
];

function options<T extends string>(opts: { value: T; label: string }[], selected: T): string {
  return opts.map(o => `<option value="${o.value}"${o.value === selected ? ' selected' : ''}>${o.label}</option>`).join('');
}

/**
 * Two named sections where there used to be one called "Game view", and the second is a door this
 * task pays for rather than opens. Sprint row 9 (camera, frame and renderer) adds zoom, a draw
 * distance slider, an fps target and a pitch limit, all of which are Display; sprint 3's Sound
 * entry adds sound. Reserving both now costs one collapsed row and means a later entry about a
 * slider is not also a re-layout of this panel. Sound ships closed, with the library's one-line
 * empty state inside it, so it reads as deliberate rather than broken; it adds no `cs.` key, no
 * setting and no dependency. The mute control is NOT here: sprint 3 needs mute to work on the
 * login screen, before a character exists, which is a surface outside this panel entirely. Nor is
 * a slider: no `range` control exists anywhere in the project and decision D49 puts `range()` in
 * sprint row 9.
 */
export function createConfigPanel(deps: ConfigDeps): PanelView {
  return {
    title: 'Configuration',
    mount(body: HTMLElement) {
      body.innerHTML = `
        <details class="section" open>
          <summary>Display</summary>
          <div class="section-body" data-config-display>
            <label class="field-inline"><span class="field-label">Canvas size</span><select class="select" id="cfg-size">${options(SIZE_OPTIONS, deps.getSize())}</select></label>
            <label class="field-inline"><span class="field-label">Scaling</span><select class="select" id="cfg-filter">${options(FILTER_OPTIONS, deps.getFilter())}</select></label>
            <label class="field-inline"><span class="field-label">Hide overlays</span><input class="switch" type="checkbox" id="cfg-overlays" /></label>
            <button class="btn btn-lg btn-block" id="cfg-fullscreen" type="button">Enter fullscreen</button>
          </div>
        </details>
        <details class="section" data-config-sound>
          <summary>Sound</summary>
          <div class="section-body">
            <p class="empty">Nothing to set yet.</p>
          </div>
        </details>
      `;
      body.querySelector<HTMLSelectElement>('#cfg-size')!.addEventListener('change', e => {
        deps.setSize((e.target as HTMLSelectElement).value as SizeMode);
      });
      body.querySelector<HTMLSelectElement>('#cfg-filter')!.addEventListener('change', e => {
        deps.setFilter((e.target as HTMLSelectElement).value as 'auto' | 'pixelated');
      });
      body.querySelector<HTMLInputElement>('#cfg-overlays')!.addEventListener('change', () => { deps.toggleOverlays(); });
      body.querySelector('#cfg-fullscreen')!.addEventListener('click', () => deps.fullscreen());
    }
  };
}
