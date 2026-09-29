// web/src/frame/characterTabs.ts -- the character strip across the top of the game view.
//
// It lives in the frame (not the side panel) and is rendered by the shell, so it exists before
// any plugin mounts. Only *created* characters get a real tab; the remaining slots are the
// account's unused capacity, a locked slot beyond it, and one disabled "Add more" slot.
import { escapeHtml } from '../dom';
import { displayStatus, type SessionState, type SessionStatus } from '../sessions/types';
import type { CharacterSummary } from '../types';

/** Character slots always drawn, whatever the account's limit is (spec section 5). */
export const TAB_SLOTS = 3;
export const NEW_CHARACTER_LABEL = '+ New character';
export const GUEST_LOCK_TOOLTIP = 'Create an account to unlock a third character';
export const MORE_LABEL = 'Add more';
export const COMING_SOON = 'coming soon';

/**
 * `clock` and `onlineSince` are the online timer's two halves. `clock` is a BOOLEAN marker, not a
 * string: "this tab renders a clock". A string marker would be falsy while empty and the mono
 * `num` face would then never be added, which is the one bug this shape exists to prevent. Both
 * stay optional because `slotHtml` is asserted directly with slots that carry neither.
 */
export type TabSlot =
  | { kind: 'character'; index: number; characterId: string; label: string; status: SessionStatus; active: boolean; disabled: false; tooltip: string; clock?: boolean; onlineSince?: number | null }
  | { kind: 'empty'; index: number; label: string; disabled: false }
  | { kind: 'locked'; index: number; label: string; disabled: true; tooltip: string }
  | { kind: 'more'; index: number; label: string; note: string; disabled: true; tooltip: string };

export interface TabsInput {
  characters: CharacterSummary[];
  /** The server's limit for this account (2 for a guest, 3 for a registered user). */
  limit: number;
  states: Record<string, SessionState>;
  /** When each character last came online, from `CharacterSession.onlineSince`. */
  onlineSince: Record<string, number | null>;
  activeId: string | null;
}

/**
 * The mock's own format, from its `renderVals()`: 5347 seconds renders `1:29:07`, 67 renders
 * `1:07`. Below an hour the hour segment is dropped rather than padded to `0:01:07`.
 */
export function onlineFor(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function computeSlots(input: TabsInput): TabSlot[] {
  const ordered = [...input.characters].sort((a, b) => a.createdAt - b.createdAt);
  const slots: TabSlot[] = [];
  for (let index = 0; index < TAB_SLOTS; index++) {
    const character = ordered[index];
    if (character) {
      const status = displayStatus(input.states[character.id] ?? 'offline');
      const since = input.onlineSince[character.id] ?? null;
      slots.push({
        kind: 'character', index, characterId: character.id, label: character.gameName,
        status, active: character.id === input.activeId, disabled: false,
        // The tooltip keeps the WORD: it describes a state, not an elapsed time.
        tooltip: `${character.gameName} · ${status}`,
        clock: status === 'online' && since !== null, onlineSince: since
      });
      continue;
    }
    if (index < input.limit) {
      slots.push({ kind: 'empty', index, label: NEW_CHARACTER_LABEL, disabled: false });
      continue;
    }
    slots.push({ kind: 'locked', index, label: NEW_CHARACTER_LABEL, disabled: true, tooltip: GUEST_LOCK_TOOLTIP });
  }
  slots.push({ kind: 'more', index: TAB_SLOTS, label: MORE_LABEL, note: COMING_SOON, disabled: true, tooltip: COMING_SOON });
  return slots;
}

export interface TabsDeps {
  onSelect(characterId: string): void;
  onNew(): void;
  /** The clock `render` paints from, so an online tab never shows the word for one frame. */
  now(): number;
}

/**
 * Attribute-safe escaping. `escapeHtml` goes through `textContent`, which leaves quotes alone —
 * fine for text nodes, but a character name with a `"` in it would break out of an attribute.
 */
function attr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * One slot's markup. Exported so each branch of the clock pair above can be pinned without a
 * mount, including the two `computeSlots` never emits together.
 */
export function slotHtml(slot: TabSlot): string {
  if (slot.kind === 'character') {
    // The status text stays `slot.status` at render time and the tick overwrites it for the tabs
    // that carry `data-online-since`, so `render()` stays deterministic and `computeSlots` stays
    // pure and free of a clock.
    const clockAttr = typeof slot.onlineSince === 'number' ? ` data-online-since="${slot.onlineSince}"` : '';
    return `<button type="button" role="tab" class="char-tab${slot.active ? ' active' : ''}"
      data-char-tab="${attr(slot.characterId)}" title="${attr(slot.tooltip)}"
      aria-selected="${slot.active ? 'true' : 'false'}" tabindex="${slot.active ? 0 : -1}">
      <span class="char-tab-dot ${slot.status}" aria-hidden="true"></span>
      <span class="char-tab-name">${escapeHtml(slot.label)}</span>
      <span class="char-tab-status${slot.clock ? ' num' : ''}"${clockAttr} data-tab-status>${escapeHtml(slot.status)}</span>
    </button>`;
  }
  if (slot.kind === 'empty') {
    return `<button type="button" class="char-tab char-tab-empty" data-char-tab-new tabindex="-1">
      <span class="char-tab-name">${escapeHtml(slot.label)}</span></button>`;
  }
  if (slot.kind === 'locked') {
    return `<button type="button" class="char-tab char-tab-locked" data-char-tab-locked disabled
      title="${attr(slot.tooltip)}" aria-label="${attr(slot.tooltip)}" tabindex="-1">
      <span class="char-tab-name">${escapeHtml(slot.label)}</span></button>`;
  }
  return `<button type="button" class="char-tab char-tab-more" data-char-tab-more disabled
    title="${attr(slot.tooltip)}" tabindex="-1">
    <span class="char-tab-name">${escapeHtml(slot.label)}</span>
    <span class="char-tab-status">${escapeHtml(slot.note)}</span></button>`;
}

export interface CharacterTabs {
  render(input: TabsInput): void;
  /**
   * Repaints every stamped tab's clock, in place. A full `render()` at 1 Hz would replace the
   * button the player has focused and reset the roving tabindex, which is what `runBanner` and
   * SP4b's `updateRunCard` both learned to avoid.
   */
  tick(now: number): void;
}

export function createCharacterTabs(root: HTMLElement, deps: TabsDeps): CharacterTabs {
  root.setAttribute('role', 'tablist');
  root.setAttribute('aria-orientation', 'horizontal');
  root.setAttribute('aria-label', 'Characters');

  const realTabs = (): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>('[data-char-tab]'));

  root.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || button.disabled) return;
    const id = button.dataset.charTab;
    if (id) { deps.onSelect(id); return; }
    if (button.dataset.charTabNew !== undefined) deps.onNew();
  });

  // Keyboard: Left/Right (and Home/End) move between the real character tabs only; the empty and
  // disabled slots are not part of the tab ring.
  root.addEventListener('keydown', event => {
    const tabs = realTabs();
    const i = tabs.indexOf(document.activeElement as HTMLElement);
    if (i < 0 || tabs.length === 0) return;
    let next = -1;
    if (event.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    tabs[next].focus();
  });

  function tick(now: number): void {
    for (const el of root.querySelectorAll<HTMLElement>('[data-tab-status][data-online-since]')) {
      const since = Number(el.dataset.onlineSince);
      el.textContent = onlineFor(Math.max(0, Math.floor((now - since) / 1000)));
    }
  }

  return {
    tick,
    render(input: TabsInput): void {
      root.innerHTML = computeSlots(input).map(slotHtml).join('');
      // Something in the strip must always be reachable by Tab: the active character tab when
      // there is one, otherwise the first open slot. Arrow keys still walk the real tabs only.
      const tabs = realTabs();
      if (tabs.length) {
        if (!tabs.some(t => t.tabIndex === 0)) tabs[0].tabIndex = 0;
      } else {
        const firstNew = root.querySelector<HTMLButtonElement>('[data-char-tab-new]:not([disabled])');
        if (firstNew) firstNew.tabIndex = 0;
      }
      // Last, so a freshly rendered online tab is already showing its clock rather than the word
      // `online` until the next second boundary.
      tick(deps.now());
    }
  };
}
