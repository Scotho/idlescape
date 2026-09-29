// web/src/panels/accountCharacters.ts -- the character list, inside the Account panel.
//
// Lifted out of `plugins/builtin/characters.ts` when the Characters panel merged into Account
// (G5). The reload, the failed-listing rule, the open-in-flight guard, the create form and the
// phrase-guarded delete are unchanged, and so is every DOM hook the Playwright specs drive
// (`#char-panel-name`, `#char-panel-create`, `#char-panel-error`, `[data-char-row]`,
// `[data-char-open]`, `[data-char-delete]`, `#char-del-*`). What changed: the rows are the mock's
// character cards (map-design 3.15) built with the component library instead of an innerHTML
// string, and the section returns an element rather than mounting into a panel body.
import { createCharacter, deleteCharacter, friendlyCharacterError, listCharacters } from '../characters/api';
import { displayStatus, type SessionState } from '../sessions/types';
import { alert, h } from '../ui/el';
import { card, sectionLabel } from '../ui/parts';
import type { CharacterSummary } from '../types';

export interface CharacterSectionDeps {
  idToken(): Promise<string>;
  isAnonymous(): boolean;
  /** The character whose tab is in front, or null before any tab is open. */
  active(): CharacterSummary | null;
  /** Live session state for a character, or null when it has no session yet. */
  stateOf(characterId: string): SessionState | null;
  /** Opens (lazily creating) and focuses that character's tab. */
  openTab(c: CharacterSummary): Promise<void>;
  /** Closes a character's tab and iframe; called after a successful delete. */
  closeTab(characterId: string): void;
  /** The listing changed (create or delete): the shell re-renders the tab strip. */
  onListChanged(characters: CharacterSummary[], limit: number): void;
  reauth(password: string): Promise<void>;
}

export interface CharacterSection {
  el: HTMLElement;
  reload(): Promise<void>;
  /** The Account panel unmounted: nothing in flight may repaint or report after this. */
  dispose(): void;
}

const WARNING = 'Deleting a character removes it permanently: its stats, quests and inventory are gone. Only you can do this; a connected Claude session cannot.';

export function createCharacterSection(deps: CharacterSectionDeps): CharacterSection {
  const el = h('div', { class: 'stack' });
  let list: CharacterSummary[] = [];
  /** The account's character limit, as reported by the listing. The server owns the number. */
  let limit = 0;
  /** Set when the listing itself failed; the section then shows nothing but the reason. */
  let loadError: string | null = null;
  /**
   * A failed `openTab`, held across the re-render that follows it. `render()` rebuilds the
   * section, so a message written straight into `#char-panel-error` would be wiped before the
   * player ever saw it.
   */
  let openError: string | null = null;
  /** Set by `dispose`: a listing that lands after the panel closed must not repaint it. */
  let gone = false;

  const setError = (msg: string | null): void => {
    const box = el.querySelector<HTMLElement>('#char-panel-error');
    if (box) { box.textContent = msg ?? ''; box.classList.toggle('hidden', !msg); }
  };

  /** Prevents a stampede of open clicks while one open is already in flight. */
  const setOpenButtonsDisabled = (disabled: boolean): void => {
    el.querySelectorAll<HTMLButtonElement>('[data-char-open]').forEach(b => { b.disabled = disabled; });
  };

  /**
   * A failed listing must not read as "you have no characters": coercing it to `[]` showed an
   * empty account with a create form, which is exactly the failure mode the pre-game gate was
   * fixed for. Report it instead, and offer nothing that would act on a list we do not have.
   */
  async function reload(): Promise<void> {
    try {
      const listed = await listCharacters(await deps.idToken());
      if (gone) return;
      list = listed.characters;
      limit = listed.limit;
      loadError = null;
      openError = null;
      deps.onListChanged(list, limit);
    } catch (err) {
      if (gone) return;
      loadError = friendlyCharacterError((err as Error).message);
    }
    render();
  }

  function onOpen(c: CharacterSummary): void {
    setOpenButtonsDisabled(true);
    // Not a server error code: opening a tab rejects with its own player-facing prose (the boot
    // failure), so it is shown as-is rather than run through the code map.
    void deps.openTab(c)
      .then(() => { openError = null; })
      .catch(err => { openError = (err as Error).message; })
      // Re-render so every row's status catches up with the session that just opened;
      // `render` re-emits `openError`, so a failure survives its own re-render.
      .finally(() => { if (gone) return; setOpenButtonsDisabled(false); render(); });
  }

  /** One character, as the mock's card: name, live status, and the actions this row still has. */
  function characterCard(c: CharacterSummary, active: CharacterSummary | null): HTMLElement {
    const state = deps.stateOf(c.id) ?? 'offline';
    // The active row keeps its Delete button: it is the one the player is most likely to want to
    // remove, and the delete flow is guarded by the confirmation phrase anyway.
    const isActive = c.id === active?.id;
    const status = isActive ? `${displayStatus(state)} · this tab` : displayStatus(state);
    const row = card(
      { rail: isActive ? 'accent' : undefined, class: isActive ? 'char-row active' : 'char-row' },
      h('div', { class: 'char-row-main' },
        h('b', { class: 'char-row-name' }, c.gameName),
        h('span', { class: state === 'online' ? 'char-status char-status-online' : 'char-status', 'data-char-status': c.id }, status)),
      isActive ? null : h('button', { class: 'btn btn-outline btn-xs', type: 'button', 'data-char-open': c.id, onclick: () => onOpen(c) }, 'Open tab'),
      h('button', { class: 'btn btn-outline btn-xs', type: 'button', 'data-char-delete': c.id, onclick: () => openDelete(c) }, 'Delete')
    );
    row.dataset.charRow = c.id;
    return row;
  }

  function createForm(): HTMLElement {
    const name = h('input', { class: 'input', id: 'char-panel-name', placeholder: 'New character name', maxlength: 12, required: true });
    const form = h('form', { id: 'char-panel-create', class: 'char-create' },
      name, h('button', { class: 'btn', type: 'submit' }, 'Create'));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const typed = name.value.trim();
      // Every account names every character: an empty box never reaches the server, where it
      // would have taken the generated-name path.
      if (!typed) { setError(friendlyCharacterError('invalid')); return; }
      void (async () => {
        try {
          await createCharacter(await deps.idToken(), typed);
          await reload();
        } catch (err) {
          if (!gone) setError(friendlyCharacterError((err as Error).message));
        }
      })();
    });
    return form;
  }

  function render(): void {
    if (gone) return;
    if (loadError) {
      el.replaceChildren(h('div', { class: 'alert alert-error', id: 'char-panel-error' }, loadError));
      return;
    }
    const active = deps.active();
    el.replaceChildren(
      sectionLabel(`Characters · ${list.length} of ${limit}`),
      ...(list.length ? list.map(c => characterCard(c, active)) : [h('div', { class: 'empty' }, 'No characters yet.')]),
      list.length < limit ? createForm() : h('div', { class: 'kv-label' }, `Character limit reached (${limit}).`),
      h('div', { class: 'alert alert-error hidden', id: 'char-panel-error' }),
      h('div', { id: 'char-del-dialog', class: 'stack hidden' })
    );
    setError(openError);
  }

  function openDelete(c: CharacterSummary): void {
    const dlg = el.querySelector<HTMLElement>('#char-del-dialog');
    if (!dlg) return;
    const phrase = `delete ${c.gameName}`;
    const input = h('input', { class: 'input', id: 'char-del-phrase', autocomplete: 'off' });
    const password = deps.isAnonymous()
      ? null
      : h('input', { class: 'input', id: 'char-del-password', type: 'password', placeholder: 'your password (re-authentication)' });
    const confirm = h('button', { class: 'btn btn-danger', type: 'button', id: 'char-del-confirm', disabled: true }, `Delete ${c.gameName} forever`);
    input.addEventListener('input', () => { confirm.disabled = input.value.trim() !== phrase; });
    confirm.addEventListener('click', () => { void runDelete(c, phrase, password); });
    dlg.classList.remove('hidden');
    dlg.replaceChildren(
      alert(WARNING, { tone: 'error' }),
      h('div', { class: 'kv-label' }, 'Type ', h('b', {}, phrase), ' to continue.'),
      input,
      ...(password === null ? [] : [password]),
      confirm,
      h('button', { class: 'btn', type: 'button', id: 'char-del-cancel', onclick: () => { dlg.classList.add('hidden'); dlg.replaceChildren(); } }, 'Cancel')
    );
  }

  async function runDelete(c: CharacterSummary, phrase: string, password: HTMLInputElement | null): Promise<void> {
    try {
      // A rejected re-authentication carries a Firebase code, not a character code; it always
      // means the same thing to the player.
      if (!deps.isAnonymous()) {
        try { await deps.reauth(password?.value ?? ''); } catch { setError(friendlyCharacterError('reauth')); return; }
      }
      await deleteCharacter(await deps.idToken(), c.id, phrase);
      // The iframe is bound to this character; nothing may keep playing it.
      deps.closeTab(c.id);
      await reload();
    } catch (err) {
      if (!gone) setError(friendlyCharacterError((err as Error).message));
    }
  }

  return {
    el,
    reload,
    dispose() { gone = true; el.replaceChildren(); }
  };
}
