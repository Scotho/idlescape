// web/src/plugins/builtin/statusHud.ts -- HP, prayer, run energy and stat boosts over the canvas.
//
// The mock draws these as four overlay pills in a column at the canvas top-right, not as the
// pre-v2 three-column grid of labelled bars (map-design 3.4, "HUD stack"). The pills come from
// `ui/parts.ts` and the column is `.hud-stack`, so this plugin emits no markup of its own; what
// it owns is the sampling loop and the three readings.
//
// The mock's `showHud` prop is this plugin's enable state: the registry mounts `overlay()` when
// the plugin is on and drops it when it is off, which is the same switch with a home already.
import { definePlugin, type PluginContext, type ShellPlugin } from '../types';
import type { ClientState } from '../../clientTypes';
import { h } from '../../ui/el';
import { hudPill, pill } from '../../ui/parts';
import { SKILL_NAMES } from '../../stats/skills';

/** Pre-login every maximum is 0. The reading is the pre-v2 module's own placeholder, kept. */
const NO_READING = '—';

function reading(current: number, max: number): { pct: number; value: string } {
  if (max <= 0) return { pct: 0, value: NO_READING };
  return { pct: Math.max(0, Math.min(100, Math.round((current / max) * 100))), value: `${current}/${max}` };
}

/** One accent pill listing every boosted or drained skill, which is the mock's `Woodcutting +3`. */
export function boostSummary(boosts: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < boosts.length; i++) {
    if (boosts[i] !== 0 && SKILL_NAMES[i]) parts.push(`${SKILL_NAMES[i]} ${boosts[i] > 0 ? '+' : ''}${boosts[i]}`);
  }
  return parts.join(', ');
}

export function createStatusHudPlugin(opts: { intervalMs?: number } = {}): ShellPlugin {
  const intervalMs = opts.intervalMs ?? 600;
  let el: HTMLElement | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let showBoosts = true;

  function paint(s: ClientState): void {
    if (!el) return;
    const hp = reading(s.hp.current, s.hp.max);
    const prayer = reading(s.prayer.current, s.prayer.max);
    const boosts = showBoosts ? boostSummary(s.boosts) : '';
    el.replaceChildren(
      hudPill('hp', hp.pct, hp.value),
      hudPill('prayer', prayer.pct, prayer.value),
      // Run energy is out of 100 and the mock shows it bare: `62`, not `62/100`.
      hudPill('run', s.energy, `${s.energy}`),
      ...(boosts === '' ? [] : [pill(boosts, 'accent')])
    );
  }

  return definePlugin({
    manifest: {
      id: 'status-hud', name: 'Status HUD', icon: 'xp', tier: 'shell',
      description: 'HP, prayer, run energy and stat boosts over the game view.',
      settings: { showBoosts: { type: 'boolean', label: 'Show stat boosts', default: true } }
    },
    overlay(_ctx: PluginContext) {
      el = h('div', { class: 'hud-stack' });
      return el;
    },
    onEnable(ctx: PluginContext) {
      showBoosts = ctx.settings.get<boolean>('showBoosts') !== false;
      const tick = () => { const s = ctx.client()?.getState(); if (s) paint(s); };
      tick();
      timer = setInterval(tick, intervalMs);
    },
    onDisable() {
      if (timer !== null) { clearInterval(timer); timer = null; }
      el = null;
    }
  });
}
