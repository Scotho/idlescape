import { byId, escapeHtml, hide, show, toggleVisible } from '../dom';
import type { HomeView } from '../types';

export interface PatchNote { date: string; title: string; items: string[] }

export interface HomeDeps {
  onGuest(): void;
  onShowLogin(): void;
  onShowSignup(): void;
  onShowConnect(): void;
  onBack(): void;
}

/**
 * What the home screen knows about the world right now. `players` is null whenever the count
 * is simply unknown (the engine is up but has not reported one), which is not the same thing
 * as the world being down.
 */
export interface WorldStatus { engine: 'up' | 'down'; players: number | null }

export interface HomeViewApi {
  setView(v: HomeView): void;
  setPlayers(status: WorldStatus): void;
  renderPatchNotes(notes: PatchNote[]): void;
  setBusy(busy: boolean): void;
  setError(msg: string | null): void;
}

/** One container per `HomeView`; `setView` shows exactly one of them. */
const SUBVIEWS: Record<HomeView, string> = {
  choices: 'home-choices',
  login: 'home-login',
  signup: 'home-signup',
  connect: 'entry-connect-view'
};

const MAX_PATCH_NOTES = 3;

/**
 * The home screen's dumb view: it owns nothing but the DOM inside `#screen-home`, turning
 * clicks into `deps` callbacks and state into markup. Every flow decision (who is signed in,
 * whether a guest needs minting, which sub-view a click should lead to) belongs to the
 * controller, so this stays trivially testable against a bare fragment.
 */
export function createHomeView(root: HTMLElement, deps: HomeDeps): HomeViewApi {
  const q = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#${id}`) ?? byId<T>(id);

  q('btn-guest').addEventListener('click', () => deps.onGuest());
  q('btn-show-login').addEventListener('click', () => deps.onShowLogin());
  q('btn-show-signup').addEventListener('click', () => deps.onShowSignup());
  q('btn-connect').addEventListener('click', () => deps.onShowConnect());
  q('btn-home-back').addEventListener('click', () => deps.onBack());

  return {
    setView(v: HomeView): void {
      for (const [key, id] of Object.entries(SUBVIEWS)) toggleVisible(q(id), key === v);
      toggleVisible(q('btn-home-back'), v !== 'choices');
    },
    setPlayers({ engine, players }: WorldStatus): void {
      q('home-players').textContent = engine === 'down' ? 'world offline'
        : players === null ? 'world online'
          : `${players} player${players === 1 ? '' : 's'} online`;
    },
    renderPatchNotes(notes: PatchNote[]): void {
      q('home-patch-notes').innerHTML = notes.slice(0, MAX_PATCH_NOTES).map(n =>
        `<li><span class="pn-date">${escapeHtml(n.date)}</span> <b>${escapeHtml(n.title)}</b>` +
        `<ul>${n.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul></li>`).join('');
    },
    setBusy(busy: boolean): void { toggleVisible(q('home-busy'), busy); },
    setError(msg: string | null): void {
      const el = q('home-error');
      el.textContent = msg ?? '';
      if (msg) show(el); else hide(el);
    }
  };
}
