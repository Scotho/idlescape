import type { Firestore } from 'firebase-admin/firestore';
import { expiryFrom, hashToken, randomToken } from './token';

const PAIR_TTL_MS = 15 * 60 * 1000;
const AGENT_TOKEN_ID_LEN = 20;
const AGENT_TOKEN_LEN = 40;
const PAIR_TOKEN_LEN = 32;
const LABEL_MAX_LEN = 64;
const DEFAULT_LABEL = 'Claude Code';

// Matches Unicode "Control" category codepoints (C0 controls plus DEL/C1) via a property
// escape, so the source never has to embed a literal control byte in a character class.
const CONTROL_CHARS_RE = /\p{Cc}/gu;

/**
 * `label` is free text supplied by whatever calls the exchange endpoint (the Claude Code skill,
 * today; anything with the pair token, in principle) and is later rendered in the Connect panel.
 * Strip control characters (they have no legitimate use in a session label and can otherwise
 * confuse rendering/logging) and cap the length so a hostile or buggy caller can't stash a huge
 * or unprintable payload in a document a real user's browser will read back.
 */
function sanitizeLabel(label: string | undefined): string {
  const cleaned = (label ?? '').replace(CONTROL_CHARS_RE, '').trim();
  const capped = cleaned.slice(0, LABEL_MAX_LEN);
  return capped.length > 0 ? capped : DEFAULT_LABEL;
}

export class NotOwnerError extends Error {
  constructor() {
    super('not the owner of this agent token');
    this.name = 'NotOwnerError';
  }
}

interface PairTokenDoc {
  uid: string;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
  agentTokenId: string | null;
}

interface AgentTokenDoc {
  uid: string;
  label: string;
  createdAt: number;
  lastSeenAt: number | null;
  revokedAt: number | null;
  secretHash: string;
}

export interface MintResult { token: string; expiresAt: number }

export interface LookupResult { uid: string; usedAt: number | null; expired: boolean }

export type ExchangeResult =
  | { ok: true; agentToken: string; agentTokenId: string; gameName: string | null }
  | { ok: false; reason: 'token_unknown' | 'token_spent' };

export interface AgentTokenSummary {
  id: string;
  label: string;
  createdAt: number;
  lastSeenAt: number | null;
  revokedAt: number | null;
}

export interface PairStore {
  mint(uid: string): Promise<MintResult>;
  lookup(token: string): Promise<LookupResult | null>;
  exchange(token: string, label?: string): Promise<ExchangeResult>;
  revoke(uid: string, agentTokenId: string): Promise<void>;
  listAgentTokens(uid: string): Promise<AgentTokenSummary[]>;
}

/**
 * Resolves the game name the exchange reports back to Claude: the first live character of the
 * paired account, or null when the account has none yet. Injected rather than reached for so
 * the pair store keeps no dependency on the characters store (and tests can pass a fake).
 */
export type FirstCharacterName = (uid: string) => Promise<string | null>;

export function createPairStore(db: Firestore, firstCharacterName: FirstCharacterName): PairStore {
  async function mint(uid: string): Promise<MintResult> {
    return db.runTransaction(async tx => {
      const now = Date.now();
      const pending = await tx.get(db.collection('pairTokens').where('uid', '==', uid).where('usedAt', '==', null));
      for (const doc of pending.docs) {
        tx.update(doc.ref, { expiresAt: now });
      }
      const token = randomToken(PAIR_TOKEN_LEN);
      const expiresAt = expiryFrom(now, PAIR_TTL_MS);
      const doc: PairTokenDoc = { uid, createdAt: now, expiresAt, usedAt: null, agentTokenId: null };
      tx.set(db.doc(`pairTokens/${token}`), doc);
      return { token, expiresAt };
    });
  }

  async function lookup(token: string): Promise<LookupResult | null> {
    const snap = await db.doc(`pairTokens/${token}`).get();
    if (!snap.exists) return null;
    const data = snap.data() as PairTokenDoc;
    return { uid: data.uid, usedAt: data.usedAt, expired: data.expiresAt <= Date.now() };
  }

  async function exchange(token: string, label?: string): Promise<ExchangeResult> {
    // Claiming the pair token is the part that has to be atomic; the game name is only ever
    // reported back in the response, never persisted, so it is resolved after the transaction
    // commits. Reading it inside would mean either a nested transaction (the characters store
    // migrates lazily and runs one of its own) or non-transactional reads interleaved with the
    // transaction's writes.
    const claimed = await db.runTransaction<
      { ok: true; agentToken: string; agentTokenId: string; uid: string } | { ok: false; reason: 'token_unknown' | 'token_spent' }
    >(async tx => {
      const pairRef = db.doc(`pairTokens/${token}`);
      const pairSnap = await tx.get(pairRef);
      if (!pairSnap.exists) return { ok: false, reason: 'token_unknown' };
      const pair = pairSnap.data() as PairTokenDoc;
      const now = Date.now();
      if (pair.usedAt !== null || pair.expiresAt <= now) return { ok: false, reason: 'token_spent' };

      const agentToken = randomToken(AGENT_TOKEN_LEN);
      const agentTokenId = randomToken(AGENT_TOKEN_ID_LEN);
      const agentDoc: AgentTokenDoc = {
        uid: pair.uid,
        label: sanitizeLabel(label),
        createdAt: now,
        lastSeenAt: null,
        revokedAt: null,
        secretHash: hashToken(agentToken)
      };
      tx.set(db.doc(`agentTokens/${agentTokenId}`), agentDoc);
      tx.update(pairRef, { usedAt: now, agentTokenId });
      return { ok: true, agentToken, agentTokenId, uid: pair.uid };
    });
    if (!claimed.ok) return claimed;
    // The token is already spent and the agent token already exists: a failure to read the
    // character list must not lose them. Report "no character" and let Claude carry on.
    const gameName = await firstCharacterName(claimed.uid).catch(err => {
      console.error('[pair] could not resolve a game name for the exchange', err);
      return null;
    });
    return { ok: true, agentToken: claimed.agentToken, agentTokenId: claimed.agentTokenId, gameName };
  }

  async function revoke(uid: string, agentTokenId: string): Promise<void> {
    const ref = db.doc(`agentTokens/${agentTokenId}`);
    const snap = await ref.get();
    if (!snap.exists || (snap.data() as AgentTokenDoc).uid !== uid) throw new NotOwnerError();
    await ref.update({ revokedAt: Date.now() });
  }

  async function listAgentTokens(uid: string): Promise<AgentTokenSummary[]> {
    const snap = await db.collection('agentTokens').where('uid', '==', uid).get();
    return snap.docs.map(doc => {
      const d = doc.data() as AgentTokenDoc;
      return { id: doc.id, label: d.label, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt, revokedAt: d.revokedAt };
    });
  }

  return { mint, lookup, exchange, revoke, listAgentTokens };
}
