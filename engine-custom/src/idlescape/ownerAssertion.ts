import { createHmac, timingSafeEqual } from 'node:crypto';

/** Upgrade header the front server's relay sets (server/src/proxy/ws.ts OWNER_HEADER). */
export const OWNER_HEADER = 'x-idlescape-owner';

const VERSION = 'cs1';
const MAX_HEADER_BYTES = 4000;
const MAX_ENTRIES = 5;
const UID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const NAME_RE = /^[a-z0-9_]{1,12}$/;

export interface OwnerAssertion {
    uid: string;
    character: string;
    exp: number;
}

export class OwnerAssertionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OwnerAssertionError';
    }
}

/**
 * Picks the entry for `gameName` out of the relayed header and verifies it. `gameName` is the
 * name the engine itself decrypted from the RSA login block and passed through toSafeName --
 * that is the whole point: the relay never sees it, so only this comparison can bind a socket
 * to an account.
 */
export function verifyOwnerHeader(header: string | null, gameName: string, secret: string, nowMs: number = Date.now()): OwnerAssertion | null {
    if (secret.length === 0 || !header || header.length > MAX_HEADER_BYTES) {
        return null;
    }

    const entries = header.split('~').filter(part => part.length > 0);
    if (entries.length === 0 || entries.length > MAX_ENTRIES) {
        return null;
    }

    for (const raw of entries) {
        const parts = raw.split('.');
        if (parts.length !== 4) {
            continue;
        }

        const [uid, character, expText, sig] = parts;
        if (character !== gameName || !UID_RE.test(uid) || !NAME_RE.test(character) || sig.length === 0) {
            continue;
        }

        const exp = Number(expText);
        if (!Number.isSafeInteger(exp) || exp <= nowMs) {
            continue;
        }

        const expected = Buffer.from(createHmac('sha256', secret).update(`${VERSION}|${uid}|${character}|${exp}`).digest('base64url'));
        const actual = Buffer.from(sig);
        if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
            continue;
        }

        return { uid, character, exp };
    }

    return null;
}
