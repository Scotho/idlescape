import { afterEach, describe, expect, test, vi } from 'vitest';
import { createConnectCard, type PairSnapshot } from './connectCard';
import type { MintPairResponse } from '../types';

/** Flush pending microtasks/macrotasks so the card's async mint() resolves. */
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createConnectCard', () => {
  test('renders the pairing url, a copy button, and flips status to Paired as <label>', async () => {
    const mintResult: MintPairResponse = { pairUrl: 'https://x.test/pair/tok123', token: 'tok123', expiresAt: Date.now() + 15 * 60 * 1000 };
    const mint = vi.fn(async () => mintResult);
    let reportedCb: ((snap: PairSnapshot | null) => void) | null = null;
    const unsubscribe = vi.fn();
    const subscribe = vi.fn((token: string, cb: (snap: PairSnapshot | null) => void) => {
      expect(token).toBe('tok123');
      reportedCb = cb;
      return unsubscribe;
    });

    const card = createConnectCard({ mint, subscribe });
    document.body.appendChild(card.el);
    await flush();

    expect(mint).toHaveBeenCalledTimes(1);
    const urlInput = card.el.querySelector<HTMLInputElement>('#connect-url');
    expect(urlInput).not.toBeNull();
    expect(urlInput!.value).toBe('https://x.test/pair/tok123');
    expect(card.el.querySelector('#connect-copy')).not.toBeNull();
    expect(card.el.querySelector('#connect-status')!.textContent).toBe('Waiting for Claude…');

    expect(reportedCb).not.toBeNull();
    reportedCb!({ usedAt: Date.now(), label: 'MacBook Pro' });
    expect(card.el.querySelector('#connect-status')!.textContent).toBe('Paired as MacBook Pro');

    card.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  // map-design 3.14's unpaired card, literal by literal. The instruction is the one string in
  // this card the player has to retype, so its wording and its emphasis are both behaviour.
  test('composes the hero card, the mock instruction and the pulsing waiting row', async () => {
    const mint = vi.fn(async () => ({ pairUrl: 'https://x.test/pair/c', token: 'c', expiresAt: Date.now() + 900000 }));
    const card = createConnectCard({ mint, subscribe: vi.fn(() => () => {}) });
    document.body.appendChild(card.el);
    await flush();

    expect(card.el.className).toBe('card card-hero connect-card');
    expect(card.el.querySelector('.connect-title')!.textContent).toBe('Pair a Claude session');

    const url = card.el.querySelector<HTMLInputElement>('#connect-url')!;
    expect(url.className).toBe('input input-sm mono');
    expect(url.readOnly).toBe(true);
    expect(url.closest('.connect-url-row')).not.toBeNull();
    expect(card.el.querySelector('#connect-copy')!.className).toBe('btn btn-sm');

    const hint = card.el.querySelector('.connect-hint')!;
    expect(hint.textContent).toBe('Paste this into your Claude session and say: connect to this.');
    expect(hint.querySelector('b')!.textContent).toBe('connect to this');

    const dot = card.el.querySelector<HTMLElement>('.connect-wait .dot')!;
    expect(dot.className).toBe('dot dot-pulse');
    expect(dot.style.width).toBe('7px');

    card.dispose();
  });

  test('copy button writes the pairing url to the clipboard', async () => {
    const mint = vi.fn(async () => ({ pairUrl: 'https://x.test/pair/abc', token: 'abc', expiresAt: Date.now() + 900000 }));
    const subscribe = vi.fn(() => () => {});
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const card = createConnectCard({ mint, subscribe });
    document.body.appendChild(card.el);
    await flush();

    card.el.querySelector<HTMLButtonElement>('#connect-copy')!.click();
    expect(writeText).toHaveBeenCalledWith('https://x.test/pair/abc');
    card.dispose();
  });

  test('shows Expired and a New link button once the countdown elapses', async () => {
    vi.useFakeTimers();
    const mint = vi.fn(async () => ({ pairUrl: 'https://x.test/pair/exp', token: 'exp', expiresAt: Date.now() + 1000 }));
    const subscribe = vi.fn(() => () => {});
    const card = createConnectCard({ mint, subscribe });
    document.body.appendChild(card.el);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);

    expect(card.el.querySelector('#connect-status')!.textContent).toBe('Expired');
    const newLinkBtn = card.el.querySelector<HTMLElement>('#connect-new-link');
    expect(newLinkBtn).not.toBeNull();
    expect(newLinkBtn!.classList.contains('hidden')).toBe(false);

    card.dispose();
    vi.useRealTimers();
  });

  test('dispose unsubscribes and stops the countdown', async () => {
    const mint = vi.fn(async () => ({ pairUrl: 'https://x.test/pair/d', token: 'd', expiresAt: Date.now() + 900000 }));
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    const card = createConnectCard({ mint, subscribe });
    document.body.appendChild(card.el);
    await flush();
    card.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test('shows an error and Try again when mint fails, and recovers on retry', async () => {
    let shouldFail = true;
    const mint = vi.fn(async (): Promise<MintPairResponse> => {
      if (shouldFail) { shouldFail = false; throw new Error('network down'); }
      return { pairUrl: 'https://x.test/pair/retry', token: 'retry', expiresAt: Date.now() + 900000 };
    });
    const subscribe = vi.fn(() => () => {});

    const card = createConnectCard({ mint, subscribe });
    document.body.appendChild(card.el);
    await flush();

    const errorEl = card.el.querySelector<HTMLElement>('#connect-error')!;
    const tryAgainBtn = card.el.querySelector<HTMLButtonElement>('#connect-try-again')!;
    expect(errorEl.classList.contains('hidden')).toBe(false);
    expect(errorEl.textContent).toContain("Couldn't create a link");
    expect(tryAgainBtn.classList.contains('hidden')).toBe(false);

    tryAgainBtn.click();
    await flush();

    expect(errorEl.classList.contains('hidden')).toBe(true);
    expect(card.el.querySelector<HTMLInputElement>('#connect-url')!.value).toBe('https://x.test/pair/retry');
    expect(mint).toHaveBeenCalledTimes(2);

    card.dispose();
  });

  test('dispose before an in-flight mint() resolves does not leak the interval or the listener', async () => {
    let resolveMint: (r: MintPairResponse) => void = () => {};
    const mint = vi.fn(() => new Promise<MintPairResponse>(resolve => { resolveMint = resolve; }));
    const subscribe = vi.fn(() => () => {});
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    const card = createConnectCard({ mint, subscribe });
    document.body.appendChild(card.el);

    card.dispose();
    resolveMint({ pairUrl: 'https://x.test/pair/late', token: 'late', expiresAt: Date.now() + 900000 });
    await flush();

    expect(subscribe).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();

    setIntervalSpy.mockRestore();
  });
});
