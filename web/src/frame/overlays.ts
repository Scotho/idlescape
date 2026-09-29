// web/src/frame/overlays.ts -- everything drawn over the game canvas by the frame itself.
//
// Three pills and a drop, all in the overlay family's one language (`ui/parts.ts`'s `pill`, and
// `styles/overlay.css`): the xp/h line top-left, the pairing pill top-right, the session status
// under the xp line, and the xp drop that floats up from the middle. The status HUD is NOT here:
// it is the `status-hud` plugin's own overlay, so the player can turn it off.
//
// The pairing pill used to be a hard-coded `'● not paired'` written by two callers that knew
// nothing about pairing (`sessions/wire.ts` on every login, `frame/stage.ts` on every tab switch).
// It reads the pairing store and the run status now, through `wireOverlays` at the bottom of this
// file, which is plan ruling R6: pairing never overrides a live run, and this pill may legitimately
// disagree with the co-pilot bar, because it is answering a different question.
import { h } from '../ui/el';
import { pill, type PillTone } from '../ui/parts';
import { skillColour as defaultSkillColour } from '../stats/skills';
import type { EventBus } from './events';
import type { PairingState, PairingStore } from './pairing';
import type { RunStatus } from '../tasks/types';

/** A burst of xp on a fast skill must not fill the canvas; the oldest goes when a fifth arrives. */
export const MAX_DROPS = 4;
/**
 * The fallback that removes a drop when `animationend` never arrives: `.xp-drop` runs `floatUp`
 * for 2.6s (`styles/overlay.css`; the keyframes themselves are in `styles/motion.css`), and a
 * backgrounded tab throttles the animation without ever ending it. Whichever of the two fires
 * first cancels the other. This is a second spelling of a CSS number, so `overlays.test.ts` reads
 * the duration back out of `overlay.css` and pins it here, on plan ruling R3's precedent.
 */
export const DROP_LIFETIME_MS = 2600;

/**
 * The pill's three readings, as a type. `presentRun` (frame/runPresentation.ts) answers with the
 * same three, because ruling R6 makes the pill and the co-pilot bar two views of one pairing
 * truth; typing them here rather than widening to `string` is what keeps the bar from inventing
 * a fourth reading of its own.
 */
export type PairingPill = '● not paired' | '● claude driving' | '● claude paired';
const PAIRING_UNPAIRED: PairingPill = '● not paired';
const PAIRING_DRIVING: PairingPill = '● claude driving';
const PAIRING_PAIRED: PairingPill = '● claude paired';

/** `setStatus`'s three tones, which both of its callers already pass, as pill tones. */
const STATUS_TONE: Record<'ok' | 'muted' | 'error', PillTone> = { ok: 'ok', muted: 'neutral', error: 'error' };

export interface OverlaysDeps {
  skillColour(skill: string): string;
  /** Injected so a test can drive the fallback timer; read at drop time, never captured. */
  setTimeout?: typeof setTimeout;
}

export interface Overlays {
  setXpLine(text: string | null): void;
  setStatus(text: string, tone: 'ok' | 'muted' | 'error'): void;
  setPairing(state: PairingState, running: boolean): void;
  dropXp(skill: string, delta: number): void;
  setHidden(hidden: boolean): void;
  dispose(): void;
}

/** The mock's pairing table (map-design 3.4), as data: three readings over two inputs. */
export function pairingReading(state: PairingState, running: boolean): { text: PairingPill; tone: PillTone } {
  if (state === 'unpaired') return { text: PAIRING_UNPAIRED, tone: 'neutral' };
  return running ? { text: PAIRING_DRIVING, tone: 'accent' } : { text: PAIRING_PAIRED, tone: 'ok' };
}

/** One tone at a time: the tone class is replaced, never added to. */
function setTone(el: HTMLElement, tone: PillTone): void {
  for (const cls of [...el.classList]) if (cls.startsWith('ov-pill-') && cls !== 'ov-pill-corner') el.classList.remove(cls);
  el.classList.add(`ov-pill-${tone}`);
}

export function createOverlays(root: HTMLElement, deps: OverlaysDeps = { skillColour: defaultSkillColour }): Overlays {
  const xpLine = pill('', 'accent', { corner: true });
  xpLine.classList.add('ov-xp', 'hidden');
  const status = pill('', 'neutral', { corner: true });
  status.classList.add('ov-status', 'hidden');
  const pairing = pill(PAIRING_UNPAIRED, 'neutral', { corner: true });
  pairing.classList.add('ov-pairing');
  root.replaceChildren(xpLine, status, pairing);

  // Insertion-ordered, which is what makes "the oldest goes" a `values().next()` and not a sort.
  const drops = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  let disposed = false;

  function remove(drop: HTMLElement): void {
    const timer = drops.get(drop);
    if (timer !== undefined) clearTimeout(timer);
    drops.delete(drop);
    drop.remove();
  }

  return {
    setXpLine(text) {
      if (disposed) return;
      xpLine.textContent = text ?? '';
      xpLine.classList.toggle('hidden', text === null);
    },
    setStatus(text, tone) {
      if (disposed) return;
      status.textContent = text;
      setTone(status, STATUS_TONE[tone]);
      status.classList.toggle('hidden', text === '');
    },
    setPairing(state, running) {
      if (disposed) return;
      const reading = pairingReading(state, running);
      pairing.textContent = reading.text;
      setTone(pairing, reading.tone);
    },
    dropXp(skill, delta) {
      if (disposed) return;
      const chip = h('span', { class: 'xp-drop-chip' });
      chip.style.background = deps.skillColour(skill);
      const drop = h('span', { class: 'xp-drop' }, chip, h('span', { class: 'xp-drop-value' }, `+${delta}`));
      drop.addEventListener('animationend', () => remove(drop));
      root.appendChild(drop);
      drops.set(drop, (deps.setTimeout ?? setTimeout)(() => remove(drop), DROP_LIFETIME_MS));
      while (drops.size > MAX_DROPS) remove(drops.keys().next().value as HTMLElement);
    },
    setHidden(hidden) {
      if (disposed) return;
      root.classList.toggle('hidden', hidden);
    },
    dispose() {
      disposed = true;
      for (const drop of [...drops.keys()]) remove(drop);
    }
  };
}

/** Every run state in which something is actually being driven. `paused` and `stuck` are not. */
export const isRunning = (s: RunStatus): boolean => s.state === 'starting' || s.state === 'running';

export interface OverlayWiringDeps {
  pairing: PairingStore;
  /** The frame event bus. One producer, two consumers: this drop and the Events panel's row. */
  bus: EventBus;
  status(): RunStatus;
  onStatus(cb: (s: RunStatus) => void): () => void;
  activeId(): string | null;
}

/**
 * Subscribes the overlay to the two frame-lifetime truths it draws. Lives here rather than in
 * `main.ts` because it is this module's contract (which pairing reading, which run states count as
 * running, which events draw a drop), and because main.ts has Tasks 14 and 16 still to fit.
 * The drop reads `ShellEvent.amount`, the field `frame/eventProducers.ts` sets from `XpEvent.delta`
 * for exactly this; parsing it back out of `text` would be a second, worse copy of the number.
 */
export function wireOverlays(overlays: Overlays, deps: OverlayWiringDeps): () => void {
  let state = deps.pairing.state();
  let running = isRunning(deps.status());
  const paint = (): void => overlays.setPairing(state, running);
  const offs = [
    deps.pairing.subscribe(next => { state = next; paint(); }),
    deps.onStatus(s => { running = isRunning(s); paint(); }),
    deps.bus.subscribe(e => {
      // The drop is over the ACTIVE canvas, so a background character's xp is an Events row only.
      if (e.type !== 'xp' || e.characterId !== deps.activeId()) return;
      overlays.dropXp(e.skill ?? '', e.amount ?? 0);
    })
  ];
  paint();
  return () => { for (const off of offs) off(); };
}
