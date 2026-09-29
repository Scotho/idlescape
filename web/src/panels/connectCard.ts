import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { currentIdToken } from '../auth';
import { mintPair } from '../api';
import { db } from '../firebase';
import { alert, h, kv } from '../ui/el';
import { card, dot } from '../ui/parts';
import type { MintPairResponse } from '../types';

/** What the pairTokens/{token} listener reports back to the card. */
export interface PairSnapshot { usedAt: number | null; label: string | null }

export interface ConnectCardOpts {
  /** Mints a fresh pairing token. Defaults to `api.mintPair` via the current Firebase id token. */
  mint?: () => Promise<MintPairResponse>;
  /** Subscribes to status changes for a minted token; returns an unsubscribe function. */
  subscribe?: (token: string, cb: (snap: PairSnapshot | null) => void) => () => void;
}

export interface ConnectCard { el: HTMLElement; dispose(): void }

const COUNTDOWN_TICK_MS = 1000;

function defaultMint(): Promise<MintPairResponse> {
  return currentIdToken().then(mintPair);
}

interface PairTokenDoc { usedAt: number | null; agentTokenId: string | null }
interface AgentTokenDoc { label: string }

/** Real Firestore listener: watches pairTokens/{token}, resolving the paired label via a one-time agentTokens read. */
function defaultSubscribe(token: string, cb: (snap: PairSnapshot | null) => void): () => void {
  return onSnapshot(doc(db, 'pairTokens', token), snap => {
    if (!snap.exists()) { cb(null); return; }
    const data = snap.data() as PairTokenDoc;
    if (data.usedAt === null || !data.agentTokenId) { cb({ usedAt: data.usedAt, label: null }); return; }
    void getDoc(doc(db, 'agentTokens', data.agentTokenId)).then(agentSnap => {
      const label = agentSnap.exists() ? (agentSnap.data() as AgentTokenDoc).label : null;
      cb({ usedAt: data.usedAt, label });
    });
  });
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

/**
 * The unpaired card, map-design 3.14: a hero card, the pairing link beside its Copy button, the
 * countdown, the paste instruction, and a waiting row whose 7px dot pulses until Claude answers.
 * Built rather than templated so the instruction's `connect to this` is a real `<b>` inside the
 * alert and the dot is the library's, not a span with a border-radius written here.
 */
function shell(): HTMLElement {
  const hint = alert(
    h('div', {}, 'Paste this into your Claude session and say: ', h('b', {}, 'connect to this'), '.'),
    { tone: 'accent' }
  );
  hint.classList.add('connect-hint');
  return card({ hero: true, class: 'connect-card' },
    h('b', { class: 'connect-title' }, 'Pair a Claude session'),
    h('div', { class: 'connect-url-row' },
      h('input', { class: 'input input-sm mono', id: 'connect-url', readonly: true, value: '' }),
      h('button', { class: 'btn btn-sm', id: 'connect-copy', type: 'button' }, 'Copy')
    ),
    kv('Expires in', '--:--', { id: 'connect-countdown', num: true }),
    hint,
    h('div', { class: 'connect-wait' },
      dot('idle', { pulse: true, size: 7 }),
      h('span', { id: 'connect-status' }, 'Waiting for Claude…')
    ),
    h('div', { class: 'alert alert-error hidden', id: 'connect-error' }),
    h('button', { class: 'btn btn-sm hidden', id: 'connect-try-again', type: 'button' }, 'Try again'),
    h('button', { class: 'btn btn-sm hidden', id: 'connect-new-link', type: 'button' }, 'New link'),
    h('a', { class: 'link', id: 'connect-guide', href: '/connect' }, 'How do I connect?')
  );
}

const MINT_ERROR_MESSAGE = "Couldn't create a link.";

export function createConnectCard(opts: ConnectCardOpts = {}): ConnectCard {
  const mint = opts.mint ?? defaultMint;
  const subscribe = opts.subscribe ?? defaultSubscribe;

  const el = shell();

  const urlInput = el.querySelector<HTMLInputElement>('#connect-url')!;
  const countdownEl = el.querySelector<HTMLElement>('#connect-countdown')!;
  const statusEl = el.querySelector<HTMLElement>('#connect-status')!;
  const errorEl = el.querySelector<HTMLElement>('#connect-error')!;
  const tryAgainBtn = el.querySelector<HTMLElement>('#connect-try-again')!;
  const newLinkBtn = el.querySelector<HTMLElement>('#connect-new-link')!;

  let unsubscribe: (() => void) | null = null;
  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  let expiresAt = 0;
  let paired = false;
  let expired = false;
  let disposed = false;

  function clearCountdown(): void {
    if (countdownTimer !== null) { clearInterval(countdownTimer); countdownTimer = null; }
  }

  function tickCountdown(): void {
    if (paired) return;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      if (!expired) {
        expired = true;
        clearCountdown();
        countdownEl.textContent = '0:00';
        statusEl.textContent = 'Expired';
        newLinkBtn.classList.remove('hidden');
      }
      return;
    }
    countdownEl.textContent = formatCountdown(remaining);
  }

  function onSnapshotUpdate(snap: PairSnapshot | null): void {
    if (paired || !snap || snap.usedAt === null) return;
    paired = true;
    expired = false;
    clearCountdown();
    newLinkBtn.classList.add('hidden');
    statusEl.textContent = `Paired as ${snap.label ?? 'Claude'}`;
  }

  async function start(): Promise<void> {
    unsubscribe?.();
    unsubscribe = null;
    clearCountdown();
    paired = false;
    expired = false;
    newLinkBtn.classList.add('hidden');
    errorEl.classList.add('hidden');
    errorEl.textContent = '';
    tryAgainBtn.classList.add('hidden');
    statusEl.textContent = 'Waiting for Claude…';
    countdownEl.textContent = '--:--';

    let result: MintPairResponse;
    try {
      result = await mint();
    } catch {
      if (disposed) return;
      errorEl.textContent = MINT_ERROR_MESSAGE;
      errorEl.classList.remove('hidden');
      tryAgainBtn.classList.remove('hidden');
      return;
    }
    // A dispose() that ran while mint() was in flight must not leave this continuation
    // starting a countdown interval or a Firestore subscription nobody can tear down.
    if (disposed) return;

    urlInput.value = result.pairUrl;
    expiresAt = result.expiresAt;
    tickCountdown();
    countdownTimer = setInterval(tickCountdown, COUNTDOWN_TICK_MS);
    unsubscribe = subscribe(result.token, onSnapshotUpdate);
  }

  el.querySelector('#connect-copy')!.addEventListener('click', () => {
    void navigator.clipboard?.writeText(urlInput.value);
  });
  newLinkBtn.addEventListener('click', () => { void start(); });
  tryAgainBtn.addEventListener('click', () => { void start(); });

  void start();

  return {
    el,
    dispose() {
      disposed = true;
      unsubscribe?.();
      unsubscribe = null;
      clearCountdown();
    }
  };
}
