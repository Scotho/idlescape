import type { PanelView, PluginManifest } from '../frame/panels';
import type { ClientHooks } from '../clientTypes';
import type { HealthSnapshot } from '../types';
import { currentIdToken } from '../auth';
import { revokeAgentToken } from '../api';
import { SEEN_RECENTLY_MS, type AgentTokenRow, type PairingStore } from '../frame/pairing';
import { h, kv } from '../ui/el';
import { dot, sectionLabel } from '../ui/parts';
import { createConnectCard, type ConnectCard } from './connectCard';
import { confirmDialog } from '../ui/dialog';

export const manifest = { id: 'connect', name: 'Claude', icon: 'claude', tier: 'shell' } as const satisfies PluginManifest;

/** Re-exported: the row shape moved to frame/pairing.ts with the listener that produces it. */
export type { AgentTokenRow };

export interface ConnectDeps {
  hooks: () => ClientHooks | null;
  /**
   * The frame's pairing singleton (ruling R10). The panel renders from it and subscribes for the
   * length of a mount; it no longer owns the Firestore listener, because the co-pilot bar needs
   * the pairing truth with this panel shut.
   */
  pairing: PairingStore;
  /** The frame's /health poll (frame/singletons.ts). Null before the first snapshot lands. */
  health?: () => HealthSnapshot | null;
  /** Optional toast for confirmations; the panel stays usable without one. */
  notify?: (message: string, tone: 'ok' | 'error' | 'info') => void;
}

export interface ConnectPanelOpts {
  createCard?: () => ConnectCard;
  revoke?: (idToken: string, id: string) => Promise<void>;
  getIdToken?: () => Promise<string>;
}

const RELATIVE_TIME_REFRESH_MS = 5000;
const TRANSIENT_ERROR_MS = 4000;

function relativeTime(ms: number | null): string {
  if (ms === null) return 'never';
  const deltaMs = Date.now() - ms;
  const seconds = Math.max(0, Math.floor(deltaMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString();
}

function gatewayText(status: HealthSnapshot['gateway']): string {
  if (status === 'up') return 'up';
  if (status === 'down') return 'down';
  return 'not deployed yet';
}

/**
 * The mock writes the Gateway value as a green `● up` (map-design 3.14). The glyph is a state
 * mark used as data, which ruling R19 keeps; the colour is the one thing that distinguishes the
 * three states at a glance, so it travels with the text rather than being left to the reader.
 */
function gatewayTone(status: HealthSnapshot['gateway']): string {
  if (status === 'up') return 'var(--ok-bright)';
  if (status === 'down') return 'var(--error-text)';
  return 'var(--text-muted)';
}

/**
 * The value is two nodes rather than one string: `● up` read aloud is "black circle up", and the
 * mark repeats what the colour already says. `aria-hidden` on the glyph leaves a screen reader
 * with the word and leaves the mock's appearance untouched (ruling R19 keeps the glyph).
 */
function paintGateway(el: HTMLElement, status: HealthSnapshot['gateway']): void {
  el.replaceChildren(h('span', { 'aria-hidden': 'true' }, '● '), gatewayText(status));
  el.style.color = gatewayTone(status);
}

function linkHealthText(hooks: ClientHooks | null): string {
  if (!hooks) return 'not connected';
  const state = hooks.getState();
  const rtt = state.rttMs === null ? '—' : `${state.rttMs}ms`;
  // `ws ok` is the mock's own wording; the pre-v2 panel said `connected`, which is the same fact
  // in two more syllables than a 280px row has room for beside fps and rtt.
  const ws = state.loggedIn ? 'ok' : 'down';
  return `fps ${state.fps} · rtt ${rtt} · ws ${ws}`;
}

export function createConnectPanel(deps: ConnectDeps, opts: ConnectPanelOpts = {}): PanelView {
  const createCard = opts.createCard ?? createConnectCard;
  const revoke = opts.revoke ?? revokeAgentToken;
  const getIdToken = opts.getIdToken ?? currentIdToken;

  let manualShowCard = false;
  let card: ConnectCard | null = null;
  let unsubscribeSessions: (() => void) | null = null;
  let relativeTimer: ReturnType<typeof setInterval> | null = null;
  let rootBody: HTMLElement | null = null;
  let unmounted = false;
  let revokeErrorTimer: ReturnType<typeof setTimeout> | null = null;

  function activeRows(): AgentTokenRow[] {
    return deps.pairing.sessions().filter(r => r.revokedAt === null);
  }

  function gatewayStatus(): HealthSnapshot['gateway'] {
    return deps.health?.()?.gateway ?? 'not_deployed';
  }

  function disposeCard(): void {
    card?.dispose();
    card = null;
  }

  function showRevokeError(message: string): void {
    if (!rootBody) return;
    const el = rootBody.querySelector<HTMLElement>('#connect-revoke-error');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
    if (revokeErrorTimer !== null) clearTimeout(revokeErrorTimer);
    revokeErrorTimer = setTimeout(() => {
      el.classList.add('hidden');
      el.textContent = '';
      revokeErrorTimer = null;
    }, TRANSIENT_ERROR_MS);
  }

  function handleRevoke(id: string, label: string): void {
    void (async () => {
      const ok = await confirmDialog({
        title: `Revoke "${label}"?`,
        body: 'That Claude session loses access to this account right away. You can pair it again later.',
        confirmLabel: 'Revoke',
        danger: true
      });
      if (!ok) return;
      try {
        const idToken = await getIdToken();
        await revoke(idToken, id);
        deps.notify?.(`Revoked "${label}".`, 'ok');
      } catch {
        if (unmounted) return;
        showRevokeError(`Couldn't revoke "${label}".`);
      }
    })();
  }

  /**
   * One paired session, map-design 3.14: a glowing 8px dot for a session that answered inside the
   * window, an idle one plus `Last seen ...` for anything older, and a quiet Revoke on the right.
   * Built with `h()`, so a hostile label lands as a text node and can never be parsed as markup.
   */
  function sessionRow(row: AgentTokenRow): HTMLElement {
    const seenRecently = row.lastSeenAt !== null && Date.now() - row.lastSeenAt <= SEEN_RECENTLY_MS;
    return h('div', { class: 'kv session-row', 'data-session-row': '', 'data-id': row.id },
      dot(seenRecently ? 'ok' : 'idle', { glow: seenRecently, pulse: seenRecently, size: 8 }),
      h('span', { class: 'kv-value' }, row.label),
      h('span', { class: 'kv-label', 'data-last-seen': '' },
        seenRecently ? 'Active now' : `Last seen ${relativeTime(row.lastSeenAt)}`),
      h('button', {
        class: 'btn btn-outline btn-xs', type: 'button', 'data-revoke': row.id,
        title: `Paired ${formatDate(row.createdAt)}`,
        onclick: () => handleRevoke(row.id, row.label)
      }, 'Revoke')
    );
  }

  function pairAnotherButton(): HTMLElement {
    return h('button', {
      class: 'btn btn-link', id: 'connect-pair-another', type: 'button',
      onclick: () => { manualShowCard = true; if (rootBody) render(rootBody); }
    }, 'Pair another session');
  }

  /**
   * Two states and one tail. Unpaired (or "Pair another session" pressed) mounts the pairing card
   * and nothing else; paired lists the sessions. The Link section is the tail either way: it
   * reports the gateway and the client link, which are facts about the shell rather than about a
   * pairing, and the pre-v2 panel showed them in both states too.
   */
  function render(body: HTMLElement): void {
    const active = activeRows();
    const showCard = manualShowCard || active.length === 0;
    const nodes: Node[] = [];

    if (showCard) {
      if (!card) card = createCard();
      nodes.push(card.el);
    } else {
      disposeCard();
    }

    if (active.length > 0) {
      nodes.push(sectionLabel('Paired sessions'));
      nodes.push(h('div', { class: 'row-list', id: 'connect-sessions' }, ...active.map(sessionRow)));
      if (!showCard) nodes.push(pairAnotherButton());
    }

    nodes.push(h('div', { class: 'alert alert-error hidden', id: 'connect-revoke-error' }));
    nodes.push(sectionLabel('Link'));
    const gatewayRow = kv('Gateway', '', { id: 'connect-gateway' });
    paintGateway(gatewayRow.querySelector<HTMLElement>('#connect-gateway')!, gatewayStatus());
    nodes.push(gatewayRow);
    nodes.push(kv('Health', linkHealthText(deps.hooks()), { id: 'connect-link-health', num: true }));

    body.replaceChildren(...nodes);
  }

  return {
    title: 'Claude',
    mount(body: HTMLElement) {
      unmounted = false;
      rootBody = body;
      render(body);

      // The listener belongs to the frame; this is a subscription to it, dropped on unmount.
      unsubscribeSessions = deps.pairing.subscribe(() => { if (rootBody) render(rootBody); });

      relativeTimer = setInterval(() => {
        const lastSeenEls = body.querySelectorAll<HTMLElement>('[data-last-seen]');
        const active = activeRows();
        lastSeenEls.forEach((el, i) => {
          const seen = active[i]?.lastSeenAt ?? null;
          const recent = seen !== null && Date.now() - seen <= SEEN_RECENTLY_MS;
          el.textContent = recent ? 'Active now' : `Last seen ${relativeTime(seen)}`;
        });
        const linkHealthEl = body.querySelector<HTMLElement>('#connect-link-health');
        if (linkHealthEl) linkHealthEl.textContent = linkHealthText(deps.hooks());
        // The /health poll is the frame's now, on this same 5s cadence, so the gateway line is
        // repainted here rather than by a second timer of the panel's own.
        const gatewayEl = body.querySelector<HTMLElement>('#connect-gateway');
        if (gatewayEl) paintGateway(gatewayEl, gatewayStatus());
      }, RELATIVE_TIME_REFRESH_MS);
    },
    unmount() {
      unmounted = true;
      unsubscribeSessions?.();
      unsubscribeSessions = null;
      disposeCard();
      if (relativeTimer !== null) { clearInterval(relativeTimer); relativeTimer = null; }
      if (revokeErrorTimer !== null) { clearTimeout(revokeErrorTimer); revokeErrorTimer = null; }
      rootBody = null;
      // Transient view state should not survive a close/reopen: a stale "Pair another" click
      // must not leak into the next mount() call. The rows themselves are the frame's now.
      manualShowCard = false;
    }
  };
}
